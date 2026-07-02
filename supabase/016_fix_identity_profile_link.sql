-- Link an eligible-voter row to the authenticated user without granting users
-- general UPDATE access to meeting_eligible_voters.

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

-- Repair earlier identity submissions that contain one unambiguous profile ID.
with submitted_profiles as (
  select
    al.eligible_voter_id,
    min(al.profile_id::text)::uuid as profile_id
  from public.attendance_logs al
  where al.action = 'identity_submit'
    and al.eligible_voter_id is not null
    and al.profile_id is not null
  group by al.eligible_voter_id
  having count(distinct al.profile_id) = 1
)
update public.meeting_eligible_voters mev
set profile_id = submitted_profiles.profile_id
from submitted_profiles, public.profiles p, public.lots l
where mev.id = submitted_profiles.eligible_voter_id
  and p.id = submitted_profiles.profile_id
  and p.is_active = true
  and l.id = mev.lot_id
  and mev.profile_id is null
  and nullif(trim(coalesce(p.email, '')), '') is not null
  and (
    lower(trim(coalesce(mev.representative_email, ''))) = lower(trim(p.email))
    or lower(trim(coalesce(l.owner_email, ''))) = lower(trim(p.email))
  );

select
  mev.id,
  mev.representative_name,
  mev.representative_email,
  mev.profile_id,
  mev.identity_status
from public.meeting_eligible_voters mev
where mev.identity_status = 'pending'
order by mev.created_at desc;
