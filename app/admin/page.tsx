import Link from "next/link";
import { AppShell, PageHeader, StatusBadge } from "@/components/AppShell";
import { QuickTestSetup } from "@/components/QuickTestSetup";
import { adminTasks, decisions } from "@/lib/data";

export default function AdminPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Full access administration"
        title="Admin"
        description="จัดการผู้มีสิทธิ ผู้ดูแลระบบ เอกสาร โหวต หลักฐาน และ audit log โดย admin ทั้ง 5 คนต้องเปิด 2FA"
        action={<Link className="btn primary" href="/admin/data">จัดการข้อมูลตาราง</Link>}
        tone="admin"
      />

      <QuickTestSetup />

      <section className="grid three-column" style={{ marginTop: 16 }}>
        <article className="stat-card">
          <span>Admin สิทธิ์เต็ม</span>
          <strong>{decisions.admins}</strong>
          <small>ต้องใช้บัญชีแยกกันทุกคน</small>
        </article>
        <article className="stat-card">
          <span>Realtime DB</span>
          <strong>Supabase</strong>
          <small>RLS + append-only audit log</small>
        </article>
        <article className="stat-card">
          <span>Evidence Storage</span>
          <strong>Drive</strong>
          <small>Shared folder ของนิติบุคคล</small>
        </article>
      </section>

      <section className="grid two-column" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="section-title">
            <h2>งานตั้งค่าที่ต้องทำ</h2>
            <StatusBadge tone="amber">ก่อน production</StatusBadge>
          </div>
          <ul className="list">
            {adminTasks.map((task) => (
              <li key={task}><strong>{task}</strong><span className="muted">บันทึกทุก action ใน admin_audit_logs</span></li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="section-title">
            <h2>เพิ่มผู้มีสิทธิ</h2>
            <StatusBadge tone="blue">CSV / Manual</StatusBadge>
          </div>
          <form className="grid">
            <div className="form-grid">
              <label>เลขที่บ้าน/แปลง<input placeholder="A-12" /></label>
              <label>จำนวนเสียง<input placeholder="1" /></label>
            </div>
            <label>ชื่อผู้มีสิทธิ<input placeholder="ชื่อ-นามสกุล" /></label>
            <label>อีเมลหรือเบอร์โทร<input placeholder="สำหรับ OTP / magic link" /></label>
            <button className="btn primary" type="button">บันทึกผู้มีสิทธิ</button>
            <Link className="btn" href="/admin/data">ไปหน้าเพิ่ม/ลบข้อมูลทุกตาราง</Link>
          </form>
        </div>
      </section>
    </AppShell>
  );
}
