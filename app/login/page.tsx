import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="login-page">
      <header className="login-header">
        <span className="login-brand"><span className="brand-mark" aria-hidden="true"><span>V</span></span><strong>ประชุมหมู่บ้าน</strong></span>
        <span className="login-nav">ปลอดภัย · โปร่งใส · ตรวจสอบได้</span>
      </header>
      <section className="login-hero">
        <div className="login-copy">
          <span className="login-flourish" aria-hidden="true">✦</span>
          <p className="arched-title">GOOD MORNING, NEIGHBOR</p>
          <h1>เข้าสู่การประชุม<br />ของชุมชนเรา</h1>
          <span className="title-ribbon">ยืนยันตัวตนก่อนเข้าร่วม</span>
          <div className="login-card-wrap">
            <div className="botanical branch-left" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="botanical branch-right" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="panel login-card">
              <span className="eyebrow">SECURE ACCESS</span>
              <h2>เข้าสู่ระบบประชุม</h2>
              <p>ลูกบ้านใช้อีเมลเพื่อรับ Magic Link ส่วนผู้ดูแลใช้รหัส Admin ที่กำหนดไว้</p>
              <Suspense fallback={<p className="muted">กำลังโหลดฟอร์มเข้าสู่ระบบ...</p>}>
                <LoginForm />
              </Suspense>
            </div>
          </div>
          <div className="login-assurance" aria-label="ระบบที่เชื่อมต่อ">
            <span>Google Meet</span><i />
            <span>Google Drive</span><i />
            <span>Supabase</span>
          </div>
        </div>
      </section>
    </main>
  );
}
