"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/AppShell";
import { useAuth } from "@/components/AuthGate";
import { selectFocusMeeting } from "@/lib/meetings/selectFocusMeeting";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Meeting = { id: string; code: string; title: string; status: string; scheduled_start: string };
type Incident = { id: string; meeting_id: string; reporter_name: string | null; incident_type: string; detail: string; status: "open" | "investigating" | "resolved" | "closed"; admin_response: string | null; admin_response_name: string | null; admin_responded_at: string | null; created_at: string };
const statusLabel = { open: "เปิดอยู่", investigating: "กำลังตรวจสอบ", resolved: "แก้ไขแล้ว", closed: "ปิดเหตุ" };

export function IncidentsLive() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { user, profile, isAdmin } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [eligibleVoterId, setEligibleVoterId] = useState<string | null>(null);
  const [form, setForm] = useState({ incident_type: "เสียงขาดหาย", detail: "" });
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data: meetingRows, error: meetingError } = await supabase.from("meetings").select("id,code,title,status,scheduled_start").order("scheduled_start", { ascending: false });
    if (meetingError) { setError(meetingError.message); return; }
    const rows = (meetingRows ?? []) as Meeting[];
    const current = selectFocusMeeting(rows);
    setMeeting(current);
    if (!current) { setIncidents([]); return; }
    const [incidentResult, eligibleResult] = await Promise.all([
      supabase.from("incident_reports").select("id,meeting_id,reporter_name,incident_type,detail,status,admin_response,admin_response_name,admin_responded_at,created_at").eq("meeting_id", current.id).order("created_at", { ascending: false }),
      supabase.from("meeting_eligible_voters").select("id").eq("meeting_id", current.id).eq("profile_id", user.id).maybeSingle(),
    ]);
    if (incidentResult.error) setError(incidentResult.error.message);
    setIncidents((incidentResult.data ?? []) as Incident[]);
    setEligibleVoterId((eligibleResult.data as { id: string } | null)?.id ?? null);
  }, [supabase, user.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel("incidents-live").on("postgres_changes", { event: "*", schema: "public", table: "incident_reports" }, load).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, supabase]);

  async function reportIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting) return;
    setBusy(true); setError(""); setMessage("");
    const { error: insertError } = await supabase.from("incident_reports").insert({
      meeting_id: meeting.id,
      reporter_profile_id: user.id,
      eligible_voter_id: eligibleVoterId,
      reporter_name: profile?.full_name || user.email || "ผู้เข้าร่วม",
      incident_type: form.incident_type,
      detail: form.detail.trim(),
      status: "open",
      user_agent: window.navigator.userAgent,
    });
    if (insertError) setError(insertError.message);
    else { setForm({ ...form, detail: "" }); setMessage("บันทึกเหตุขัดข้องและเวลาแจ้งเป็นหลักฐานแล้ว"); await load(); }
    setBusy(false);
  }

  async function resolveIncident(incident: Incident) {
    setBusy(true); setError("");
    const { error: updateError } = await supabase.from("incident_reports").update({ status: "resolved", resolved_by: user.id, resolved_at: new Date().toISOString(), resolution_note: "Admin ยืนยันว่าแก้ไขแล้ว" }).eq("id", incident.id);
    if (updateError) setError(updateError.message);
    else { setMessage("ปิดการแก้ไขเหตุขัดข้องแล้ว"); await load(); }
    setBusy(false);
  }

  async function replyIncident(incident: Incident) {
    const response = replyDrafts[incident.id]?.trim();
    if (!response || !isAdmin || !meeting) return;
    setBusy(true); setError(""); setMessage("");
    const payload = {
      admin_response: response,
      admin_response_by: user.id,
      admin_response_name: profile?.full_name || user.email || "Admin",
      admin_responded_at: new Date().toISOString(),
      status: incident.status === "open" ? "investigating" : incident.status,
    };
    const { data, error: updateError } = await supabase.from("incident_reports").update(payload).eq("id", incident.id).select().single();
    if (updateError) {
      setError(updateError.message.includes("admin_response") ? "กรุณารัน 019_incident_admin_response.sql ใน Supabase ก่อน" : updateError.message);
    } else {
      await supabase.from("admin_audit_logs").insert({ actor_profile_id: user.id, action: "reply_incident", target_table: "incident_reports", target_id: incident.id, before_data: { admin_response: incident.admin_response, status: incident.status }, after_data: data, user_agent: window.navigator.userAgent });
      setReplyDrafts((current) => ({ ...current, [incident.id]: "" }));
      setMessage("ส่งคำตอบจากผู้ดูแลแล้ว");
      await load();
    }
    setBusy(false);
  }

  if (!meeting) return <section className="panel"><h2>ยังไม่มีการประชุมที่เข้าถึงได้</h2></section>;
  const locked = ["closed", "archived"].includes(meeting.status);
  return <section className="grid two-column">
    <div className="panel"><div className="section-title"><div><h2>เหตุขัดข้อง</h2><span className="muted">{meeting.code} · {meeting.title}</span></div><StatusBadge tone="amber">{incidents.length} รายการ</StatusBadge></div>
      {error ? <p className="form-message error">{error}</p> : null}{message ? <p className="form-message success">{message}</p> : null}
      <div className="grid">{incidents.map((incident) => <article className="row-card incident-card" key={incident.id}><div className="row-header"><strong>{incident.incident_type}</strong><StatusBadge tone={incident.status === "resolved" || incident.status === "closed" ? "green" : "amber"}>{statusLabel[incident.status]}</StatusBadge></div><span>{incident.detail}</span><span className="muted">{new Date(incident.created_at).toLocaleString("th-TH")} · {incident.reporter_name || "ผู้เข้าร่วม"}</span>{incident.admin_response ? <div className="incident-admin-response"><strong>คำตอบจากผู้ดูแล</strong><p>{incident.admin_response}</p><small>{incident.admin_response_name || "Admin"}{incident.admin_responded_at ? ` · ${new Date(incident.admin_responded_at).toLocaleString("th-TH")}` : ""}</small></div> : null}{isAdmin && !locked ? <div className="incident-reply-form"><label>ตอบกลับผู้แจ้ง<textarea value={replyDrafts[incident.id] ?? ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [incident.id]: event.target.value }))} placeholder={incident.admin_response ? "พิมพ์คำตอบใหม่เพื่ออัปเดตข้อความเดิม" : "แจ้งผลตรวจสอบ ขอข้อมูลเพิ่ม หรือแนะนำวิธีแก้ไข"} /></label><div className="row-actions"><button className="btn primary compact" disabled={busy || !replyDrafts[incident.id]?.trim()} onClick={() => replyIncident(incident)} type="button">ส่งคำตอบ</button>{["open", "investigating"].includes(incident.status) ? <button className="btn compact" disabled={busy} onClick={() => resolveIncident(incident)} type="button">ทำเครื่องหมายว่าแก้ไขแล้ว</button> : null}</div></div> : null}</article>)}{incidents.length === 0 ? <p className="muted">ยังไม่มีการแจ้งเหตุในการประชุมนี้</p> : null}</div>
    </div>
    <div className="panel"><div className="section-title"><h2>แจ้งเหตุใหม่</h2><StatusBadge tone="red">หลักฐาน</StatusBadge></div><form className="grid" onSubmit={reportIncident}><label>ประเภท<select value={form.incident_type} onChange={(event) => setForm({ ...form, incident_type: event.target.value })}><option>เสียงขาดหาย</option><option>ภาพไม่ขึ้น</option><option>เปิดเอกสารไม่ได้</option><option>ลงคะแนนไม่ได้</option><option>หลุดจากการประชุม</option><option>อื่น ๆ</option></select></label><label>รายละเอียด *<textarea required value={form.detail} onChange={(event) => setForm({ ...form, detail: event.target.value })} placeholder="ระบุอาการและช่วงเวลาที่เกิดเหตุ" /></label><button className="btn primary" disabled={busy || locked} type="submit">{busy ? "กำลังบันทึก..." : "บันทึกเหตุขัดข้อง"}</button></form></div>
  </section>;
}
