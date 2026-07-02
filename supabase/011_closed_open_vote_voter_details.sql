-- Reveal house numbers for an open ballot only after voting closes.
-- The function avoids granting participants direct access to the lots table.

create or replace function public.get_closed_open_vote_details(target_vote_session_id uuid)
returns table (
  house_no text,
  lot_no text,
  choice public.vote_choice,
  vote_weight numeric,
  voted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_meeting_id uuid;
begin
  select vs.meeting_id
  into target_meeting_id
  from public.vote_sessions vs
  where vs.id = target_vote_session_id
    and vs.mode = 'open'
    and vs.status = 'closed';

  if target_meeting_id is null then
    raise exception 'Open vote results are available only after voting closes.'
      using errcode = '42501';
  end if;

  if not public.is_admin() and not public.is_meeting_participant(target_meeting_id) then
    raise exception 'You are not allowed to view these vote details.'
      using errcode = '42501';
  end if;

  return query
  select
    l.house_no,
    l.lot_no,
    ov.choice,
    ov.vote_weight,
    ov.created_at
  from public.open_votes ov
  join public.lots l on l.id = ov.lot_id
  where ov.vote_session_id = target_vote_session_id
  order by ov.choice, l.house_no nulls last, l.lot_no;
end;
$$;

revoke all on function public.get_closed_open_vote_details(uuid) from public;
revoke all on function public.get_closed_open_vote_details(uuid) from anon;
grant execute on function public.get_closed_open_vote_details(uuid) to authenticated;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'get_closed_open_vote_details';
