-- 3. ล้างข้อมูลหมู่บ้านที่ไม่ถูกใช้ในประวัติ แต่เก็บข้อมูลประชุมทั้งหมด
--
-- ข้อจำกัด: lots ที่ถูกอ้างอิงโดย meeting_eligible_voters หรือ open_votes
-- เป็นส่วนหนึ่งของหลักฐานการประชุม จึงต้องเก็บไว้และจะไม่ถูกลบโดย Query นี้
-- Query นี้ลบ lots ที่ยังไม่เคยถูกใช้ในการประชุม ลบบัญชีลูกบ้านเดิม
-- และเก็บเฉพาะบัญชี Admin ไว้ ส่วนข้อมูลประชุมจะไม่ถูกลบ
--
-- วิธีใช้: เปลี่ยน CHANGE_ME เป็น RESET_UNUSED_VILLAGE_CONFIRMED แล้วกด Run

begin;

create temporary table preserved_admin_ids (
  id uuid primary key
) on commit drop;

insert into preserved_admin_ids (id)
select distinct p.id
from public.profiles p
join public.admin_members am on am.profile_id = p.id
where p.role = 'admin'
  and p.is_active = true
  and am.can_manage_all = true;

do $$
declare
  confirmation constant text := 'CHANGE_ME';
begin
  if confirmation <> 'RESET_UNUSED_VILLAGE_CONFIRMED' then
    raise exception
      'Reset cancelled. Set confirmation to RESET_UNUSED_VILLAGE_CONFIRMED.';
  end if;

  if not exists (select 1 from preserved_admin_ids) then
    raise exception 'Reset cancelled because no active admin account was found.';
  end if;
end;
$$;

-- รักษาความสมบูรณ์ของสิทธิ์ Admin ก่อนลบบัญชีลูกบ้านเดิม
update public.admin_members
set added_by = null
where added_by is not null
  and added_by not in (select id from preserved_admin_ids);

-- Foreign key ในหลักฐานประชุมใช้ ON DELETE SET NULL จึงยังเก็บเหตุการณ์เดิมไว้
delete from auth.users u
where u.id not in (select id from preserved_admin_ids);

delete from public.lots l
where not exists (
  select 1
  from public.meeting_eligible_voters mev
  where mev.lot_id = l.id
)
and not exists (
  select 1
  from public.open_votes ov
  where ov.lot_id = l.id
);

commit;

-- retained_historical_lots คือบ้านที่ยังต้องเก็บเพราะเป็นหลักฐานการประชุม
select
  (select count(*) from public.meetings) as preserved_meetings,
  (select count(*) from public.lots) as retained_historical_lots,
  (select count(*) from auth.users) as preserved_admin_users,
  (select count(*) from public.meeting_eligible_voters) as preserved_eligible_records,
  (select count(*) from public.open_votes) as preserved_open_votes;
