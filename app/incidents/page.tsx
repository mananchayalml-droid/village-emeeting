import Image from "next/image";
import { AppShell, PageHeader } from "@/components/AppShell";
import { IncidentsLive } from "@/components/IncidentsLive";

export default function IncidentReportingPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Issue tracking"
        title="Incident Reporting"
        description="บันทึกเหตุขัดข้องระหว่างประชุม เช่น เสียง ภาพ เอกสาร login หรือการลงคะแนน เพื่อเก็บเป็นหลักฐาน"
        tone="incidents"
        visual={<Image priority alt="กระรอกถือโทรโข่งประกาศแจ้งเหตุ" src="/squirrel-incidents-megaphone-transparent.png" fill sizes="(max-width: 800px) 64vw, 300px" />}
      />
      <IncidentsLive />
    </AppShell>
  );
}
