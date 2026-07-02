-- Allow a signed-in resident to see an upcoming meeting as soon as their
-- registered email appears in that meeting's eligible-voter row or lot.

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

drop policy if exists "eligible voters self or admin read" on public.meeting_eligible_voters;
create policy "eligible voters self or admin read"
on public.meeting_eligible_voters for select
using (public.is_admin() or public.is_eligible_voter_self(id));

-- Verification: should return true for an eligible resident after Login.
select public.is_meeting_participant(m.id) as can_view, m.code, m.title, m.status
from public.meetings m
where m.status in ('draft', 'identity_open', 'in_progress')
order by m.scheduled_start
limit 10;
