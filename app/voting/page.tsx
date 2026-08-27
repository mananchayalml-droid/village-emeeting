import { AppShell, PageHeader } from "@/components/AppShell";
import { VotingLive } from "@/components/VotingLive";

export default function VotingPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Open and secret ballot"
        title="Voting"
        description="เปิดวาระ ลงคะแนนแบบเปิดเผย และเก็บหลักฐานคะแนนตามสิทธิ์ของแต่ละแปลง"
        tone="voting"
      />

      <VotingLive />
    </AppShell>
  );
}
