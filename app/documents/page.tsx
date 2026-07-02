import Image from "next/image";
import { AppShell, PageHeader } from "@/components/AppShell";
import { DocumentsLive } from "@/components/DocumentsLive";

export default function DocumentsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Google Drive repository"
        title="Documents"
        description="จัดการเอกสารประกอบการประชุมแบบมีเวอร์ชัน บันทึกการเปิดอ่าน และเก็บหลักฐานใน Google Drive กลาง"
        tone="documents"
        visual={<Image priority alt="กระรอกถือเอกสารประกอบการประชุม" src="/squirrel-documents-transparent.png" fill sizes="(max-width: 800px) 64vw, 300px" />}
      />
      <DocumentsLive />
    </AppShell>
  );
}
