-- Add lot 999 as an eligible voter for AGM-2569-001.
-- Safe to run more than once.

begin;

do $$
begin
  if not exists (
    select 1 from public.meetings
    where id = '2f49c637-12ea-4235-8121-78373a7e9e1f'::uuid
      and code = 'AGM-2569-001'
  ) then
    raise exception 'Meeting AGM-2569-001 was not found or UUID does not match';
  end if;

  if not exists (
    select 1 from public.lots
    where id = '2dd7565d-6dd6-4ba8-81f0-e408185406d5'::uuid
      and lot_no = '999'
  ) then
    raise exception 'Lot 999 was not found or UUID does not match';
  end if;
end;
$$;

insert into public.meeting_eligible_voters (
  meeting_id,
  lot_id,
  representative_name,
  representative_email,
  is_proxy,
  vote_weight,
  can_vote,
  identity_status
)
values (
  '2f49c637-12ea-4235-8121-78373a7e9e1f'::uuid,
  '2dd7565d-6dd6-4ba8-81f0-e408185406d5'::uuid,
  'TANG ABIT',
  'tangabit6@gmail.com',
  false,
  1,
  true,
  'pending'
)
on conflict (meeting_id, lot_id)
do update set
  representative_name = excluded.representative_name,
  representative_email = excluded.representative_email,
  is_proxy = excluded.is_proxy,
  vote_weight = excluded.vote_weight,
  can_vote = excluded.can_vote,
  identity_status = case
    when public.meeting_eligible_voters.identity_status = 'verified' then 'verified'::public.identity_status
    else 'pending'::public.identity_status
  end;

commit;

select
  mev.id,
  m.code as meeting_code,
  l.lot_no,
  l.house_no,
  mev.representative_name,
  mev.representative_email,
  mev.profile_id,
  mev.identity_status,
  mev.vote_weight,
  mev.can_vote
from public.meeting_eligible_voters mev
join public.meetings m on m.id = mev.meeting_id
join public.lots l on l.id = mev.lot_id
where mev.meeting_id = '2f49c637-12ea-4235-8121-78373a7e9e1f'::uuid
  and mev.lot_id = '2dd7565d-6dd6-4ba8-81f0-e408185406d5'::uuid;
