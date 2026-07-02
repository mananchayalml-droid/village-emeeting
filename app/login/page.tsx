import Image from "next/image";
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
              <h2>รับจดหมายเข้าสู่ระบบ</h2>
              <p>กรอกอีเมลที่ลงทะเบียน ระบบจะส่ง Magic Link เพื่อยืนยันตัวตนและตรวจสิทธิ์</p>
              <LoginForm />
            </div>
          </div>
          <div className="login-assurance" aria-label="ระบบที่เชื่อมต่อ">
            <span>Google Meet</span><i />
            <span>Google Drive</span><i />
            <span>Supabase</span>
          </div>
          <div className="mascot-garden">
            <Image priority alt="มาสคอตกระรอกถือจดหมายเข้าสู่ระบบ" src="/squirrel-login-letter-transparent.png" width={550} height={700} sizes="(max-width: 600px) 72vw, 360px" />
          </div>
        </div>
      </section>
    </main>
  );
}
