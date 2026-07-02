import { AppShell, PageHeader } from "@/components/AppShell";
import { DataTableManager } from "@/components/DataTableManager";

export default function AdminDataPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Data management"
        title="จัดการข้อมูลแต่ละตาราง"
        description="เพิ่ม ลบ และตรวจข้อมูลของตารางหลักทั้งหมดผ่านหน้าเว็บ ก่อนเชื่อมต่อ Supabase production"
      />
      <DataTableManager />
    </AppShell>
  );
}
