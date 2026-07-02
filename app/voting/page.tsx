import Image from "next/image";
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
        visual={<Image priority alt="กระรอกยกมือขวาลงคะแนน" src="/squirrel-voting-raised-hand-transparent.png" fill sizes="(max-width: 800px) 64vw, 300px" />}
      />

      <VotingLive />
    </AppShell>
  );
}
