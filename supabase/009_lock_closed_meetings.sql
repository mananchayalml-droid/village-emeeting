-- Make closed and archived meetings immutable at the database layer.

create or replace function public.assert_meeting_not_locked(target_meeting_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_status public.meeting_status;
begin
  if target_meeting_id is null then
    return;
  end if;

  select status into target_status
  from public.meetings
  where id = target_meeting_id;

  if target_status in ('closed', 'archived') then
    raise exception 'Meeting is closed and locked. Related data cannot be added, changed, or deleted.'
      using errcode = '55000';
  end if;
end;
$$;

create or replace function public.lock_meeting_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status in ('closed', 'archived') then
    raise exception 'Meeting is closed and locked. It cannot be changed, reopened, or deleted.'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.lock_direct_meeting_data()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_meeting_not_locked(old.meeting_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_meeting_not_locked(new.meeting_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.lock_vote_session_data()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_meeting_id uuid;
  new_meeting_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select meeting_id into old_meeting_id
    from public.vote_sessions
    where id = old.vote_session_id;
    perform public.assert_meeting_not_locked(old_meeting_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select meeting_id into new_meeting_id
    from public.vote_sessions
    where id = new.vote_session_id;
    perform public.assert_meeting_not_locked(new_meeting_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_meeting_record on public.meetings;
create trigger trg_lock_meeting_record
before update or delete on public.meetings
for each row execute function public.lock_meeting_record();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'meeting_eligible_voters',
    'attendance_logs',
    'documents',
    'document_reads',
    'agenda_items',
    'announcements',
    'vote_sessions',
    'incident_reports',
    'evidence_files',
    'traffic_logs'
  ] loop
    execute format('drop trigger if exists trg_lock_closed_meeting on public.%I', table_name);
    execute format(
      'create trigger trg_lock_closed_meeting before insert or update or delete on public.%I for each row execute function public.lock_direct_meeting_data()',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'open_votes',
    'secret_ballot_tokens',
    'secret_votes'
  ] loop
    execute format('drop trigger if exists trg_lock_closed_meeting on public.%I', table_name);
    execute format(
      'create trigger trg_lock_closed_meeting before insert or update or delete on public.%I for each row execute function public.lock_vote_session_data()',
      table_name
    );
  end loop;
end;
$$;

select event_object_table, trigger_name
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in ('trg_lock_meeting_record', 'trg_lock_closed_meeting')
order by event_object_table;
