-- Secure aggregate data for the live dashboard and enable Realtime events.

create or replace function public.get_meeting_quorum(target_meeting_id uuid)
returns table (
  eligible_count bigint,
  verified_count bigint,
  eligible_vote_weight numeric,
  verified_vote_weight numeric,
  quorum_percent_actual numeric,
  quorum_percent_required numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and not public.is_meeting_participant(target_meeting_id) then
    raise exception 'Not authorized for this meeting' using errcode = '42501';
  end if;

  return query
  select
    count(mev.id) filter (where mev.can_vote),
    count(mev.id) filter (where mev.can_vote and mev.identity_status = 'verified'),
    coalesce(sum(mev.vote_weight) filter (where mev.can_vote), 0),
    coalesce(sum(mev.vote_weight) filter (where mev.can_vote and mev.identity_status = 'verified'), 0),
    case
      when coalesce(sum(mev.vote_weight) filter (where mev.can_vote), 0) = 0 then 0
      else round(
        coalesce(sum(mev.vote_weight) filter (where mev.can_vote and mev.identity_status = 'verified'), 0)
        / coalesce(sum(mev.vote_weight) filter (where mev.can_vote), 0) * 100,
        2
      )
    end,
    m.quorum_percent
  from public.meetings m
  left join public.meeting_eligible_voters mev on mev.meeting_id = m.id
  where m.id = target_meeting_id
  group by m.id;
end;
$$;

revoke all on function public.get_meeting_quorum(uuid) from public;
grant execute on function public.get_meeting_quorum(uuid) to authenticated;

do $$
declare
  target_table text;
  realtime_tables text[] := array[
    'meetings',
    'meeting_eligible_voters',
    'documents',
    'document_reads',
    'vote_sessions',
    'incident_reports'
  ];
begin
  foreach target_table in array realtime_tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;
