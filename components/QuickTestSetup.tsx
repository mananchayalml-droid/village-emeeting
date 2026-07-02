"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/AppShell";
import { useAuth } from "@/components/AuthGate";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type SetupResult = {
  meetingId: string;
  meetingCode: string;
  lotNo: string;
};

export function QuickTestSetup() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { user, profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SetupResult | null>(null);

  async function createTestSetup() {
    if (!window.confirm("สร้างประชุมทดสอบและเพิ่มบัญชีปัจจุบันเป็นผู้มีสิทธิ์หรือไม่?")) return;

    setSaving(true);
    setError("");
    setResult(null);

    try {
      const start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(19, 0, 0, 0);
      const end = new Date(start);
      end.setHours(20, 0, 0, 0);

      const meetingCode = "TEST-2569-001";
      const { data: existingMeeting, error: meetingQueryError } = await supabase
        .from("meetings")
        .select("id,code,status")
        .eq("code", meetingCode)
        .maybeSingle();
      if (meetingQueryError) throw meetingQueryError;

      let meeting = existingMeeting;
      if (!meeting) {
        const { data, error: meetingInsertError } = await supabase
          .from("meetings")
          .insert({
            code: meetingCode,
            title: "การประชุมทดสอบระบบ",
            description: "ใช้ตรวจสอบการแสดงตน องค์ประชุม และ Dashboard ก่อนใช้งานจริง",
            scheduled_start: start.toISOString(),
            scheduled_end: end.toISOString(),
            status: "identity_open",
            quorum_percent: 50,
            created_by: user.id,
          })
          .select("id,code,status")
          .single();
        if (meetingInsertError) throw meetingInsertError;
        meeting = data;
      } else if (meeting.status === "draft") {
        const { error: meetingUpdateError } = await supabase
          .from("meetings")
          .update({ status: "identity_open" })
          .eq("id", meeting.id);
        if (meetingUpdateError) throw meetingUpdateError;
      }

      const lotNo = `TEST-${user.id.slice(0, 8).toUpperCase()}`;
      const { data: lot, error: lotError } = await supabase
        .from("lots")
        .upsert({
          lot_no: lotNo,
          owner_name: profile?.full_name || user.email || "Test Admin",
          owner_email: user.email,
          vote_weight: 1,
          can_vote: true,
          notes: "ข้อมูลทดสอบระบบ สามารถลบได้ก่อนใช้งานจริง",
        }, { onConflict: "lot_no" })
        .select("id,lot_no")
        .single();
      if (lotError) throw lotError;

      const { data: eligible, error: eligibleError } = await supabase
        .from("meeting_eligible_voters")
        .upsert({
          meeting_id: meeting.id,
          lot_id: lot.id,
          profile_id: user.id,
          representative_name: profile?.full_name || user.email,
          representative_email: user.email,
          vote_weight: 1,
          can_vote: true,
          identity_status: "verified",
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        }, { onConflict: "meeting_id,lot_id" })
        .select("id")
        .single();
      if (eligibleError) throw eligibleError;

      const { error: attendanceError } = await supabase.from("attendance_logs").insert({
        meeting_id: meeting.id,
        eligible_voter_id: eligible.id,
        profile_id: user.id,
        action: "verified",
        metadata: { source: "admin_quick_test_setup", test_data: true },
      });
      if (attendanceError) throw attendanceError;

      await supabase.from("admin_audit_logs").insert({
        actor_profile_id: user.id,
        action: "create_test_setup",
        target_table: "meetings",
        target_id: meeting.id,
        after_data: { meeting_code: meetingCode, lot_no: lotNo, profile_id: user.id },
      });

      setResult({ meetingId: meeting.id, meetingCode, lotNo });
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "ตั้งค่ารอบทดสอบไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel quick-setup">
      <div className="section-title">
        <div><span className="eyebrow">พร้อมทดสอบระบบ</span><h2>ตั้งค่ารอบทดสอบอัตโนมัติ</h2></div>
        <StatusBadge tone="amber">Test data</StatusBadge>
      </div>
      <p>สร้างประชุม <strong>TEST-2569-001</strong> เปิดแสดงตน เพิ่มบัญชีนี้เป็นผู้มีสิทธิ์ และบันทึกหลักฐานการยืนยันตัวตน</p>
      <div className="row-actions">
        <button className="btn primary" disabled={saving} onClick={createTestSetup} type="button">
          {saving ? "กำลังตั้งค่า..." : "สร้างชุดข้อมูลทดสอบ"}
        </button>
        {result ? <Link className="btn" href="/dashboard">ตรวจ Dashboard</Link> : null}
        {result ? <Link className="btn" href="/meetings">ตรวจหน้าการประชุม</Link> : null}
      </div>
      {error ? <p className="form-message error">{error}</p> : null}
      {result ? <p className="form-message success">ตั้งค่าสำเร็จ: {result.meetingCode} · แปลงทดสอบ {result.lotNo}</p> : null}
      <small className="muted">ยังไม่ใส่ Google Meet URL เพื่อป้องกันการใช้ลิงก์สมมติ กรุณาเพิ่มลิงก์ห้องจริงก่อนทดสอบการเข้าประชุม</small>
    </section>
  );
}
