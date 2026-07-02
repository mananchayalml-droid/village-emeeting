-- Allow participants to see all open-ballot records only after voting closes.
-- While a vote is open, participants can still read only their own ballot.

drop policy if exists "open votes read own or admin" on public.open_votes;

create policy "open votes read own admin or closed results"
on public.open_votes for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.meeting_eligible_voters mev
    where mev.id = eligible_voter_id
      and mev.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.vote_sessions vs
    where vs.id = vote_session_id
      and vs.status = 'closed'
      and public.is_meeting_participant(vs.meeting_id)
  )
);

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'open_votes'
order by policyname;
