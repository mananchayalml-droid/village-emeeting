-- 1. ล้างข้อมูลทั้งหมด รวมบัญชี Login และ Admin แต่คงโครงสร้างฐานข้อมูลไว้
-- คำสั่งนี้ลบถาวรและไม่สามารถย้อนกลับได้
-- ไฟล์ใน Google Drive ต้องลบหรือจัดเก็บแยกต่างหาก
--
-- วิธีใช้: เปลี่ยน CHANGE_ME เป็น RESET_EVERYTHING_CONFIRMED แล้วกด Run

begin;

do $$
declare
  confirmation constant text := 'CHANGE_ME';
begin
  if confirmation <> 'RESET_EVERYTHING_CONFIRMED' then
    raise exception
      'Reset cancelled. Set confirmation to RESET_EVERYTHING_CONFIRMED.';
  end if;
end;
$$;

-- meetings จะ cascade ไปยังผู้มีสิทธิ์ เอกสาร วาระ คะแนน เหตุขัดข้อง
-- attendance, evidence และ traffic logs ทั้งหมด
truncate table
  public.meetings,
  public.lots,
  public.admin_audit_logs
restart identity cascade;

-- การลบ auth.users จะ cascade ไปยัง profiles และ admin_members
delete from auth.users;

commit;

-- ผลลัพธ์ที่คาดหวัง: ทุกค่าเป็น 0
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.admin_members) as admins,
  (select count(*) from public.lots) as lots,
  (select count(*) from public.meetings) as meetings,
  (select count(*) from public.admin_audit_logs) as audit_logs;

