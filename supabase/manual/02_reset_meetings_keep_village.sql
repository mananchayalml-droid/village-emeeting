-- 2. ล้างข้อมูลประชุมทั้งหมด แต่เก็บข้อมูลหมู่บ้านและบัญชีผู้ใช้
-- เหมาะสำหรับล้างการประชุมทดสอบก่อนเริ่มใช้งานจริง
--
-- เก็บไว้: lots, profiles, admin_members และ auth.users
-- ลบ: meetings และข้อมูลที่อ้างอิงการประชุมทั้งหมด
--
-- วิธีใช้: เปลี่ยน CHANGE_ME เป็น RESET_MEETINGS_CONFIRMED แล้วกด Run

begin;

do $$
declare
  confirmation constant text := 'CHANGE_ME';
begin
  if confirmation <> 'RESET_MEETINGS_CONFIRMED' then
    raise exception
      'Reset cancelled. Set confirmation to RESET_MEETINGS_CONFIRMED.';
  end if;
end;
$$;

-- TRUNCATE ไม่เรียก row trigger ที่ใช้ล็อกการประชุมที่ปิดแล้ว
truncate table public.meetings restart identity cascade;

commit;

-- ผลลัพธ์ที่คาดหวัง: meetings = 0 ส่วนข้อมูลอื่นยังคงอยู่
select
  (select count(*) from public.meetings) as meetings,
  (select count(*) from public.lots) as preserved_lots,
  (select count(*) from public.profiles) as preserved_profiles,
  (select count(*) from public.admin_members) as preserved_admins;

