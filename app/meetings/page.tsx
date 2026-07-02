import Image from "next/image";
import { AppShell, PageHeader } from "@/components/AppShell";
import { DashboardLive } from "@/components/DashboardLive";
import { MeetingClosureLive } from "@/components/MeetingClosureLive";
import { MeetingsLive } from "@/components/MeetingsLive";

export default function MeetingsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Meeting operations"
        title="Meetings"
        description="การประชุมจาก Supabase แบบ realtime โดยลิงก์ Google Meet แสดงเมื่อผู้เข้าร่วมผ่านการยืนยันตัวตน"
        tone="meeting"
        visual={<Image priority alt="กระรอกใส่หูฟังวิดีโอคอลผ่านมือถือ" src="/squirrel-meetings-call-transparent.png" fill sizes="(max-width: 800px) 64vw, 300px" />}
      />
      <DashboardLive />
      <MeetingClosureLive />
      <MeetingsLive />
    </AppShell>
  );
}
