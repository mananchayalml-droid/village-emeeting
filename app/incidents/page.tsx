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
      />
      <IncidentsLive />
    </AppShell>
  );
}
