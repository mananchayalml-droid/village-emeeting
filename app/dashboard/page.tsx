import Image from "next/image";
import { AppShell, PageHeader } from "@/components/AppShell";
import { AdminOnly } from "@/components/AuthGate";
import { DashboardLive } from "@/components/DashboardLive";

export default function DashboardPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="ประชุมหมู่บ้าน · โปร่งใส · ตรวจสอบได้"
        title="ศูนย์กลางการประชุมออนไลน์"
        description="ระบบกลางสำหรับแสดงตน เข้าถึงเอกสาร ลงคะแนน แจ้งเหตุ และจัดเก็บหลักฐานการประชุม ข้อมูลสำคัญจะอัปเดตระหว่างการประชุมโดยอัตโนมัติ"
        action={<AdminOnly><a className="btn primary" href="/meetings">จัดการการประชุม</a></AdminOnly>}
        featured
        tone="community"
        visual={<Image priority alt="ครอบครัวกระรอกตัวแทนชุมชนหมู่บ้าน" src="/squirrel-dashboard-family-transparent.png" fill sizes="(max-width: 800px) 70vw, 380px" />}
      />
      <DashboardLive />
      <ComplianceFeatures />
    </AppShell>
  );
}

const complianceFeatures = [
  { href: "/meetings", title: "ยืนยันตัวตนก่อนเข้าประชุม", description: "ตรวจสอบผู้มีสิทธิ์ บ้านเลขที่ และบันทึกเวลาเข้า–ออก" },
  { href: "/meetings", title: "ประชุมด้วยเสียงและภาพ", description: "เชื่อมต่อ Google Meet เพื่อสื่อสารและมีปฏิสัมพันธ์ระหว่างประชุม" },
  { href: "/documents", title: "เอกสารเข้าถึงได้ในที่เดียว", description: "เปิดเอกสารจาก Google Drive พร้อมบันทึกหลักฐานการเปิดอ่าน" },
  { href: "/voting", title: "ลงคะแนนเปิดเผยและลับ", description: "รองรับตัวเลือกที่กำหนดเอง น้ำหนักเสียง และสรุปผลเป็นกราฟ" },
  { href: "/meetings", title: "ติดตามองค์ประชุมแบบเรียลไทม์", description: "แสดงจำนวนผู้ยืนยันตัวตน ผู้เข้าร่วม และสถานะองค์ประชุม" },
  { href: "/incidents", title: "แจ้งและติดตามเหตุขัดข้อง", description: "แจ้งปัญหาเสียง ภาพ หรือเอกสาร พร้อมติดตามคำตอบจากผู้ดูแล" },
  { href: "/meetings", title: "จัดเก็บหลักฐานตรวจสอบย้อนหลัง", description: "รวบรวมรายงาน ผลคะแนน ไฟล์บันทึก และข้อมูลจราจรอิเล็กทรอนิกส์" },
];

function ComplianceFeatures() {
  return (
    <section className="compliance-features" aria-labelledby="compliance-features-title">
      <header className="compliance-features-heading">
        <div>
          <span className="eyebrow">กระบวนการประชุมอิเล็กทรอนิกส์</span>
          <h2 id="compliance-features-title">ครบทุกขั้นตอนสำคัญในที่เดียว</h2>
          <p>ออกแบบเพื่อสนับสนุนกระบวนการตาม พ.ร.ก. ว่าด้วยการประชุมผ่านสื่ออิเล็กทรอนิกส์ พ.ศ. 2563 และประกาศมาตรฐานที่เกี่ยวข้อง</p>
        </div>
        <span className="compliance-count">7 กระบวนการ</span>
      </header>

      <ol className="compliance-feature-grid">
        {complianceFeatures.map((feature, index) => (
          <li key={feature.title}>
            <a href={feature.href}>
              <span className="compliance-feature-number" aria-hidden="true">{index + 1}</span>
              <span className="compliance-feature-copy">
                <strong>{feature.title}</strong>
                <small>{feature.description}</small>
              </span>
              <span className="compliance-feature-arrow" aria-hidden="true">→</span>
            </a>
          </li>
        ))}
      </ol>

      <div className="compliance-note">
        <p>ระบบช่วยจัดเตรียมกระบวนการและหลักฐานการประชุม การดำเนินการจริงยังต้องเป็นไปตามข้อบังคับของนิติบุคคลและกฎหมายที่เกี่ยวข้อง</p>
        <a href="https://www.etda.or.th/th/Our-Service/e-meeting/law.aspx" rel="noreferrer" target="_blank">อ่านสาระสำคัญของกฎหมาย e-Meeting จาก ETDA <span aria-hidden="true">↗</span></a>
      </div>
    </section>
  );
}
