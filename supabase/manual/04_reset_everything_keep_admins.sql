-- 4. ล้างข้อมูลทั้งหมด แต่เก็บบัญชีและสิทธิ์ของ Admin
--
-- เก็บไว้: auth.users, profiles และ admin_members เฉพาะผู้ที่เป็น Admin จริง
-- ลบ: ผู้ใช้ทั่วไป ข้อมูลหมู่บ้าน การประชุม หลักฐาน และ audit logs
-- ไฟล์ใน Google Drive ต้องลบหรือจัดเก็บแยกต่างหาก
--
-- วิธีใช้: เปลี่ยน CHANGE_ME เป็น RESET_KEEP_ADMINS_CONFIRMED แล้วกด Run

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
  admin_count integer;
begin
  if confirmation <> 'RESET_KEEP_ADMINS_CONFIRMED' then
    raise exception
      'Reset cancelled. Set confirmation to RESET_KEEP_ADMINS_CONFIRMED.';
  end if;

  select count(*) into admin_count from preserved_admin_ids;
  if admin_count = 0 then
    raise exception 'Reset cancelled because no active admin account was found.';
  end if;
end;
$$;

truncate table
  public.meetings,
  public.lots,
  public.admin_audit_logs
restart identity cascade;

-- ป้องกัน foreign key กรณีผู้แต่งตั้งเดิมไม่ใช่ Admin ที่ถูกเก็บไว้
update public.admin_members
set added_by = null
where added_by is not null
  and added_by not in (select id from preserved_admin_ids);

-- profiles และข้อมูลที่ผูกกับผู้ใช้ทั่วไปจะถูกลบตาม auth.users
delete from auth.users u
where u.id not in (select id from preserved_admin_ids);

commit;

-- ควรเหลือเฉพาะบัญชี Admin ส่วนข้อมูลหมู่บ้านและประชุมต้องเป็น 0
select
  (select count(*) from auth.users) as preserved_auth_users,
  (select count(*) from public.profiles) as preserved_profiles,
  (select count(*) from public.admin_members) as preserved_admins,
  (select count(*) from public.lots) as lots,
  (select count(*) from public.meetings) as meetings,
  (select count(*) from public.admin_audit_logs) as audit_logs;

