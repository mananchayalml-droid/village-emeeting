-- Add house/lot 554/96 to AGM-2569-001 as an eligible voter.
-- Safe to run more than once.

begin;

do $$
begin
  if not exists (
    select 1
    from public.meetings
    where code = 'AGM-2569-001'
  ) then
    raise exception 'Meeting AGM-2569-001 was not found';
  end if;

  if not exists (
    select 1
    from public.lots
    where lot_no = '554/96'
       or house_no = '554/96'
  ) then
    raise exception 'House or lot 554/96 was not found in public.lots';
  end if;
end;
$$;

insert into public.meeting_eligible_voters (
  meeting_id,
  lot_id,
  profile_id,
  representative_name,
  representative_email,
  representative_phone,
  is_proxy,
  vote_weight,
  can_vote,
  identity_status
)
select
  m.id,
  l.id,
  p.id,
  l.owner_name,
  l.owner_email,
  l.owner_phone,
  false,
  l.vote_weight,
  l.can_vote,
  'pending'::public.identity_status
from public.meetings m
join public.lots l
  on l.lot_no = '554/96'
  or l.house_no = '554/96'
left join public.profiles p
  on lower(trim(p.email)) = lower(trim(l.owner_email))
where m.code = 'AGM-2569-001'
on conflict (meeting_id, lot_id)
do update set
  profile_id = coalesce(public.meeting_eligible_voters.profile_id, excluded.profile_id),
  representative_name = excluded.representative_name,
  representative_email = excluded.representative_email,
  representative_phone = excluded.representative_phone,
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
where m.code = 'AGM-2569-001'
  and (l.lot_no = '554/96' or l.house_no = '554/96');
