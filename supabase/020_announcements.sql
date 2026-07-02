-- Separate resident announcements from voting agenda items.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  announcement_type text not null default 'announcement'
    check (announcement_type in ('announcement', 'news')),
  title text not null,
  content text,
  attachment_type text check (attachment_type is null or attachment_type in ('image', 'pdf')),
  attachment_url text check (attachment_url is null or attachment_url ~ '^https?://'),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  source_agenda_item_id uuid unique references public.agenda_items(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_attachment_pair_check check (
    (attachment_type is null and attachment_url is null)
    or (attachment_type is not null and attachment_url is not null)
  )
);

create index if not exists idx_announcements_meeting_sort
on public.announcements(meeting_id, is_published, sort_order, created_at desc);

drop trigger if exists trg_announcements_updated_at on public.announcements;
create trigger trg_announcements_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;

drop policy if exists "announcements participants read" on public.announcements;
create policy "announcements participants read"
on public.announcements for select
using (
  public.is_admin()
  or (is_published and public.is_meeting_participant(meeting_id))
);

drop policy if exists "announcements admin write" on public.announcements;
create policy "announcements admin write"
on public.announcements for all
using (public.is_admin())
with check (public.is_admin());

-- Move existing inline image/PDF content to the new announcement area once.
insert into public.announcements (
  meeting_id,
  announcement_type,
  title,
  content,
  attachment_type,
  attachment_url,
  sort_order,
  is_published,
  source_agenda_item_id,
  created_at,
  updated_at
)
select
  meeting_id,
  'announcement',
  title,
  description,
  coalesce(content_type, 'image'),
  coalesce(content_url, image_url),
  sort_order,
  true,
  id,
  created_at,
  created_at
from public.agenda_items
where coalesce(content_url, image_url) is not null
on conflict (source_agenda_item_id) do nothing;

-- Keep announcements immutable after the meeting closes. This function is
-- self-contained so the migration does not depend on 009 being installed.
create or replace function public.lock_announcement_meeting_data()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_meeting_id uuid;
  target_status text;
begin
  target_meeting_id := case when tg_op = 'DELETE' then old.meeting_id else new.meeting_id end;

  select status::text into target_status
  from public.meetings
  where id = target_meeting_id;

  if target_status in ('closed', 'archived') then
    raise exception 'Meeting is closed and locked. Announcements cannot be added, changed, or deleted.'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_closed_meeting on public.announcements;
create trigger trg_lock_closed_meeting
before insert or update or delete on public.announcements
for each row execute function public.lock_announcement_meeting_data();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end;
$$;

select id, meeting_id, announcement_type, title, attachment_type, attachment_url, is_published
from public.announcements
order by meeting_id, sort_order, created_at desc;
