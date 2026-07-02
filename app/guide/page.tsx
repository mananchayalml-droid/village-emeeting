import Image from "next/image";
import { AppShell, PageHeader } from "@/components/AppShell";
import { UsageGuide } from "@/components/UsageGuide";

export default function GuidePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="คู่มือประจำหมู่บ้าน"
        title="ทำตามทีละขั้น ก็พร้อมประชุม"
        description="คู่มือฉบับใช้งานจริงสำหรับผู้เข้าร่วมและ Admin ตั้งแต่เข้าสู่ระบบ ยืนยันตัวตน ประชุม ลงคะแนน จนถึงปิดและเก็บหลักฐาน"
        tone="community"
        visual={<Image priority alt="ครอบครัวกระรอกตัวแทนสมาชิกในหมู่บ้าน" src="/squirrel-dashboard-family-transparent.png" fill sizes="(max-width: 800px) 64vw, 300px" />}
      />
      <UsageGuide />
    </AppShell>
  );
}
