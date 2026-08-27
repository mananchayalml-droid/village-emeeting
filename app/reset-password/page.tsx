import { Suspense } from "react";
import { ResetPasswordClient } from "./ResetPasswordClient";

export default function ResetPasswordPage() {
  return (
    <main className="login-page">
      <header className="login-header">
        <span className="login-brand"><span className="brand-mark" aria-hidden="true"><span>V</span></span><strong>ประชุมหมู่บ้าน</strong></span>
        <span className="login-nav">ตั้งรหัสผ่าน Admin</span>
      </header>
      <section className="login-hero">
        <div className="login-copy">
          <p className="arched-title">ADMIN ACCESS</p>
          <h1>ตั้งรหัสผ่าน<br />สำหรับผู้ดูแล</h1>
          <div className="login-card-wrap">
            <div className="botanical branch-left" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="botanical branch-right" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <Suspense fallback={<section className="panel login-card"><p>กำลังโหลด...</p></section>}>
              <ResetPasswordClient />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
