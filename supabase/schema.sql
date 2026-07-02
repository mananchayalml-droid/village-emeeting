-- Village e-Meeting PostgreSQL schema for Supabase
-- Stack: Google Meet + Google Drive + Supabase
-- Run this in Supabase SQL editor after creating the project.

create extension if not exists "pgcrypto";

create type public.app_role as enum (
  'participant',
  'observer',
  'staff',
  'admin'
);

create type public.meeting_status as enum (
  'draft',
  'identity_open',
  'in_progress',
  'closed',
  'archived'
);

create type public.identity_status as enum (
  'pending',
  'verified',
  'rejected',
  'revoked'
);

create type public.document_status as enum (
  'draft',
  'published',
  'superseded',
  'archived'
);

create type public.vote_mode as enum (
  'open',
  'secret'
);

create type public.vote_choice as enum (
  'yes',
  'no',
  'abstain',
  'candidate'
);

create type public.vote_session_status as enum (
  'draft',
  'open',
  'closed',
  'voided'
);

create type public.incident_status as enum (
  'open',
  'investigating',
  'resolved',
  'closed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  role public.app_role not null default 'participant',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  can_manage_all boolean not null default true,
  two_factor_confirmed boolean not null default false,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (profile_id)
);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  lot_no text not null unique,
  house_no text,
  owner_name text not null,
  owner_email text,
  owner_phone text,
  vote_weight numeric(10,2) not null default 1,
  can_vote boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz,
  status public.meeting_status not null default 'draft',
  quorum_percent numeric(5,2) not null default 50,
  google_meet_url text,
  google_calendar_event_id text,
  google_drive_folder_id text,
  recording_url text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_meet_url_format check (
    google_meet_url is null or google_meet_url ~ '^https://meet\.google\.com/[a-z0-9-]+$'
  )
);

create table public.meeting_eligible_voters (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  lot_id uuid not null references public.lots(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  representative_name text,
  representative_email text,
  representative_phone text,
  is_proxy boolean not null default false,
  proxy_document_url text,
  vote_weight numeric(10,2) not null default 1,
  can_vote boolean not null default true,
  identity_status public.identity_status not null default 'pending',
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  verification_method text,
  verification_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (meeting_id, lot_id)
);

create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  eligible_voter_id uuid references public.meeting_eligible_voters(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('login', 'identity_submit', 'verified', 'join_meeting', 'leave_meeting', 'logout')),
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  title text not null,
  document_type text not null,
  version text not null default 'v1.0',
  google_drive_file_id text,
  file_url text not null,
  file_sha256 text,
  status public.document_status not null default 'draft',
  uploaded_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (meeting_id, title, version)
);

create table public.document_reads (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  eligible_voter_id uuid references public.meeting_eligible_voters(id) on delete set null,
  ip inet,
  user_agent text,
  read_at timestamptz not null default now()
);

create table public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  agenda_no text not null,
  title text not null,
  description text,
  image_url text check (image_url is null or image_url ~ '^https?://'),
  content_type text check (content_type is null or content_type in ('image', 'pdf')),
  content_url text check (content_url is null or content_url ~ '^https?://'),
  requires_vote boolean not null default false,
  is_secret_agenda boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (meeting_id, agenda_no),
  constraint agenda_items_content_pair_check check (
    (content_type is null and content_url is null)
    or (content_type is not null and content_url is not null)
  )
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  announcement_type text not null default 'announcement' check (announcement_type in ('announcement', 'news')),
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

create table public.vote_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  agenda_item_id uuid not null references public.agenda_items(id) on delete cascade,
  mode public.vote_mode not null,
  status public.vote_session_status not null default 'draft',
  motion_text text not null,
  required_rule text not null default 'majority',
  opened_by uuid references public.profiles(id),
  opened_at timestamptz,
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.open_votes (
  id uuid primary key default gen_random_uuid(),
  vote_session_id uuid not null references public.vote_sessions(id) on delete cascade,
  eligible_voter_id uuid not null references public.meeting_eligible_voters(id) on delete restrict,
  lot_id uuid not null references public.lots(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  choice public.vote_choice not null,
  candidate_text text,
  vote_weight numeric(10,2) not null default 1,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (vote_session_id, eligible_voter_id)
);

create table public.secret_ballot_tokens (
  id uuid primary key default gen_random_uuid(),
  vote_session_id uuid not null references public.vote_sessions(id) on delete cascade,
  eligible_voter_id uuid not null references public.meeting_eligible_voters(id) on delete restrict,
  token_hash text not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (vote_session_id, eligible_voter_id)
);

create table public.secret_votes (
  id uuid primary key default gen_random_uuid(),
  vote_session_id uuid not null references public.vote_sessions(id) on delete cascade,
  ballot_token_hash text not null references public.secret_ballot_tokens(token_hash) on delete restrict,
  choice public.vote_choice not null,
  candidate_text text,
  vote_weight numeric(10,2) not null default 1,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (vote_session_id, ballot_token_hash)
);

create table public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  reporter_profile_id uuid references public.profiles(id) on delete set null,
  eligible_voter_id uuid references public.meeting_eligible_voters(id) on delete set null,
  reporter_name text,
  incident_type text not null,
  detail text not null,
  status public.incident_status not null default 'open',
  attachment_url text,
  admin_response text,
  admin_response_by uuid references public.profiles(id) on delete set null,
  admin_response_name text,
  admin_responded_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution_note text,
  resolved_at timestamptz,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  evidence_type text not null,
  title text not null,
  file_url text not null,
  google_drive_file_id text,
  sha256 text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.traffic_logs (
  id bigserial primary key,
  meeting_id uuid references public.meetings(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  eligible_voter_id uuid references public.meeting_eligible_voters(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id uuid,
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.admin_audit_logs (
  id bigserial primary key,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_profiles_role on public.profiles(role);
create index idx_meetings_status_start on public.meetings(status, scheduled_start);
create index idx_eligible_meeting_status on public.meeting_eligible_voters(meeting_id, identity_status);
create index idx_attendance_meeting_created on public.attendance_logs(meeting_id, created_at desc);
create index idx_documents_meeting_status on public.documents(meeting_id, status);
create index idx_document_reads_document on public.document_reads(document_id, read_at desc);
create index idx_agenda_meeting_sort on public.agenda_items(meeting_id, sort_order);
create index idx_announcements_meeting_sort on public.announcements(meeting_id, is_published, sort_order, created_at desc);
create index idx_vote_sessions_meeting_status on public.vote_sessions(meeting_id, status);
create index idx_open_votes_session on public.open_votes(vote_session_id);
create index idx_secret_votes_session on public.secret_votes(vote_session_id);
create index idx_incidents_meeting_status on public.incident_reports(meeting_id, status);
create index idx_evidence_meeting_type on public.evidence_files(meeting_id, evidence_type);
create index idx_traffic_meeting_created on public.traffic_logs(meeting_id, created_at desc);
create index idx_admin_audit_actor_created on public.admin_audit_logs(actor_profile_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_lots_updated_at
before update on public.lots
for each row execute function public.set_updated_at();

create trigger trg_meetings_updated_at
before update on public.meetings
for each row execute function public.set_updated_at();

create trigger trg_announcements_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

create trigger trg_incident_reports_updated_at
before update on public.incident_reports
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.admin_members a on a.profile_id = p.id
    where p.id = auth.uid()
      and p.is_active = true
      and p.role = 'admin'
      and a.can_manage_all = true
      and a.two_factor_confirmed = true
  );
$$;

create or replace function public.is_meeting_participant(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.meeting_eligible_voters mev
    join public.lots l on l.id = mev.lot_id
    join public.profiles p on p.id = auth.uid() and p.is_active = true
    where mev.meeting_id = target_meeting_id
      and nullif(trim(coalesce(p.email, '')), '') is not null
      and (
        mev.profile_id = auth.uid()
        or lower(trim(coalesce(mev.representative_email, ''))) = lower(trim(coalesce(p.email, '')))
        or lower(trim(coalesce(l.owner_email, ''))) = lower(trim(coalesce(p.email, '')))
      )
  );
$$;

create or replace function public.is_eligible_voter_self(target_eligible_voter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.meeting_eligible_voters mev
    join public.lots l on l.id = mev.lot_id
    join public.profiles p on p.id = auth.uid() and p.is_active = true
    where mev.id = target_eligible_voter_id
      and nullif(trim(coalesce(p.email, '')), '') is not null
      and (
        mev.profile_id = auth.uid()
        or lower(trim(coalesce(mev.representative_email, ''))) = lower(trim(coalesce(p.email, '')))
        or lower(trim(coalesce(l.owner_email, ''))) = lower(trim(coalesce(p.email, '')))
      )
  );
$$;

revoke all on function public.is_meeting_participant(uuid) from public;
revoke all on function public.is_eligible_voter_self(uuid) from public;
grant execute on function public.is_meeting_participant(uuid) to authenticated;
grant execute on function public.is_eligible_voter_self(uuid) to authenticated;

create or replace function public.link_eligible_voter_profile(
  target_eligible_voter_id uuid,
  target_meeting_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text;
  eligible_profile_id uuid;
  eligible_email text;
  lot_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select lower(trim(p.email)) into current_email
  from public.profiles p
  where p.id = auth.uid() and p.is_active = true;

  if nullif(current_email, '') is null then
    raise exception 'Authenticated profile has no email' using errcode = '42501';
  end if;

  select mev.profile_id, lower(trim(mev.representative_email)), lower(trim(l.owner_email))
  into eligible_profile_id, eligible_email, lot_email
  from public.meeting_eligible_voters mev
  join public.lots l on l.id = mev.lot_id
  where mev.id = target_eligible_voter_id
    and mev.meeting_id = target_meeting_id
  for update of mev;

  if not found then
    raise exception 'Eligible voter was not found' using errcode = '42501';
  end if;
  if eligible_profile_id is not null and eligible_profile_id <> auth.uid() then
    raise exception 'Eligible voter is linked to another account' using errcode = '42501';
  end if;
  if current_email is distinct from eligible_email and current_email is distinct from lot_email then
    raise exception 'Eligible voter email does not match authenticated account' using errcode = '42501';
  end if;

  update public.meeting_eligible_voters
  set profile_id = auth.uid(),
      representative_email = coalesce(nullif(representative_email, ''), current_email)
  where id = target_eligible_voter_id;

  return true;
end;
$$;

revoke all on function public.link_eligible_voter_profile(uuid, uuid) from public;
grant execute on function public.link_eligible_voter_profile(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.admin_members enable row level security;
alter table public.lots enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_eligible_voters enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.documents enable row level security;
alter table public.document_reads enable row level security;
alter table public.agenda_items enable row level security;
alter table public.announcements enable row level security;
alter table public.vote_sessions enable row level security;
alter table public.open_votes enable row level security;
alter table public.secret_ballot_tokens enable row level security;
alter table public.secret_votes enable row level security;
alter table public.incident_reports enable row level security;
alter table public.evidence_files enable row level security;
alter table public.traffic_logs enable row level security;
alter table public.admin_audit_logs enable row level security;

create policy "profiles self read"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

create policy "profiles admin write"
on public.profiles for all
using (public.is_admin())
with check (public.is_admin());

create policy "admin members admin only"
on public.admin_members for all
using (public.is_admin())
with check (public.is_admin());

create policy "lots admin only"
on public.lots for all
using (public.is_admin())
with check (public.is_admin());

create policy "meetings participants read"
on public.meetings for select
using (public.is_admin() or public.is_meeting_participant(id));

create policy "meetings admin write"
on public.meetings for all
using (public.is_admin())
with check (public.is_admin());

create policy "eligible voters self or admin read"
on public.meeting_eligible_voters for select
using (public.is_admin() or public.is_eligible_voter_self(id));

create policy "eligible voters admin write"
on public.meeting_eligible_voters for all
using (public.is_admin())
with check (public.is_admin());

create policy "attendance participant insert own"
on public.attendance_logs for insert
with check (public.is_admin() or profile_id = auth.uid());

create policy "attendance admin read"
on public.attendance_logs for select
using (public.is_admin() or profile_id = auth.uid());

create policy "documents meeting participants read"
on public.documents for select
using (public.is_admin() or public.is_meeting_participant(meeting_id));

create policy "documents admin write"
on public.documents for all
using (public.is_admin())
with check (public.is_admin());

create policy "document reads insert own"
on public.document_reads for insert
with check (public.is_admin() or profile_id = auth.uid());

create policy "document reads read own or admin"
on public.document_reads for select
using (public.is_admin() or profile_id = auth.uid());

create policy "agenda participants read"
on public.agenda_items for select
using (public.is_admin() or public.is_meeting_participant(meeting_id));

create policy "agenda admin write"
on public.agenda_items for all
using (public.is_admin())
with check (public.is_admin());

create policy "announcements participants read"
on public.announcements for select
using (public.is_admin() or (is_published and public.is_meeting_participant(meeting_id)));

create policy "announcements admin write"
on public.announcements for all
using (public.is_admin())
with check (public.is_admin());

create policy "vote sessions participants read"
on public.vote_sessions for select
using (public.is_admin() or public.is_meeting_participant(meeting_id));

create policy "vote sessions admin write"
on public.vote_sessions for all
using (public.is_admin())
with check (public.is_admin());

create policy "open votes participant insert own"
on public.open_votes for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.meeting_eligible_voters mev
    where mev.id = eligible_voter_id
      and mev.profile_id = auth.uid()
      and mev.can_vote = true
      and mev.identity_status = 'verified'
  )
);

create policy "open votes read own or admin"
on public.open_votes for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.meeting_eligible_voters mev
    where mev.id = eligible_voter_id
      and mev.profile_id = auth.uid()
  )
);

create policy "secret tokens read own or admin"
on public.secret_ballot_tokens for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.meeting_eligible_voters mev
    where mev.id = eligible_voter_id
      and mev.profile_id = auth.uid()
  )
);

create policy "secret tokens admin insert"
on public.secret_ballot_tokens for insert
with check (public.is_admin());

create policy "secret votes participants insert"
on public.secret_votes for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.secret_ballot_tokens sbt
    join public.meeting_eligible_voters mev on mev.id = sbt.eligible_voter_id
    where sbt.token_hash = ballot_token_hash
      and sbt.used_at is null
      and mev.profile_id = auth.uid()
      and mev.can_vote = true
      and mev.identity_status = 'verified'
  )
);

create policy "secret votes admin read only"
on public.secret_votes for select
using (public.is_admin());

create policy "incidents participants read"
on public.incident_reports for select
using (public.is_admin() or reporter_profile_id = auth.uid() or public.is_meeting_participant(meeting_id));

create policy "incidents participants insert"
on public.incident_reports for insert
with check (public.is_admin() or reporter_profile_id = auth.uid());

create policy "incidents admin update"
on public.incident_reports for update
using (public.is_admin())
with check (public.is_admin());

create policy "evidence admin read write"
on public.evidence_files for all
using (public.is_admin())
with check (public.is_admin());

create policy "traffic insert own"
on public.traffic_logs for insert
with check (public.is_admin() or profile_id = auth.uid());

create policy "traffic read own or admin"
on public.traffic_logs for select
using (public.is_admin() or profile_id = auth.uid());

create policy "admin audit admin read"
on public.admin_audit_logs for select
using (public.is_admin());

create policy "admin audit admin insert"
on public.admin_audit_logs for insert
with check (public.is_admin());

create or replace view public.meeting_quorum_summary
with (security_invoker = true) as
select
  m.id as meeting_id,
  m.code,
  m.title,
  count(mev.id) filter (where mev.can_vote) as eligible_count,
  count(mev.id) filter (where mev.can_vote and mev.identity_status = 'verified') as verified_count,
  coalesce(sum(mev.vote_weight) filter (where mev.can_vote), 0) as eligible_vote_weight,
  coalesce(sum(mev.vote_weight) filter (where mev.can_vote and mev.identity_status = 'verified'), 0) as verified_vote_weight,
  case
    when coalesce(sum(mev.vote_weight) filter (where mev.can_vote), 0) = 0 then 0
    else round(
      (
        coalesce(sum(mev.vote_weight) filter (where mev.can_vote and mev.identity_status = 'verified'), 0)
        / coalesce(sum(mev.vote_weight) filter (where mev.can_vote), 0)
      ) * 100,
      2
    )
  end as quorum_percent_actual,
  m.quorum_percent as quorum_percent_required
from public.meetings m
left join public.meeting_eligible_voters mev on mev.meeting_id = m.id
group by m.id;

create or replace view public.open_vote_summary
with (security_invoker = true) as
select
  vs.id as vote_session_id,
  vs.meeting_id,
  vs.agenda_item_id,
  ov.choice,
  count(*) as ballot_count,
  coalesce(sum(ov.vote_weight), 0) as vote_weight_sum
from public.vote_sessions vs
left join public.open_votes ov on ov.vote_session_id = vs.id
where vs.mode = 'open'
group by vs.id, vs.meeting_id, vs.agenda_item_id, ov.choice;

create or replace view public.secret_vote_summary
with (security_invoker = true) as
select
  vs.id as vote_session_id,
  vs.meeting_id,
  vs.agenda_item_id,
  sv.choice,
  count(*) as ballot_count,
  coalesce(sum(sv.vote_weight), 0) as vote_weight_sum
from public.vote_sessions vs
left join public.secret_votes sv on sv.vote_session_id = vs.id
where vs.mode = 'secret'
group by vs.id, vs.meeting_id, vs.agenda_item_id, sv.choice;

revoke all on public.meeting_quorum_summary from anon;
revoke all on public.open_vote_summary from anon;
revoke all on public.secret_vote_summary from anon;

grant select on public.meeting_quorum_summary to authenticated;
grant select on public.open_vote_summary to authenticated;
grant select on public.secret_vote_summary to authenticated;
