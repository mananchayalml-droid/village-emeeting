"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/AppShell";
import { useAuth } from "@/components/AuthGate";
import { selectFocusMeeting } from "@/lib/meetings/selectFocusMeeting";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Meeting = { id: string; code: string; title: string; status: string; scheduled_start: string };
type DocumentRow = { id: string; meeting_id: string; title: string; document_type: string; version: string; file_url: string; status: string; created_at: string };
type ReadRow = { document_id: string };

export function DocumentsLive() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { user, isAdmin } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [eligibleVoterId, setEligibleVoterId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", file_url: "", version: "v1.0", document_type: "เอกสารประกอบวาระ" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    const { data: meetingRows, error: meetingError } = await supabase
      .from("meetings")
      .select("id,code,title,status,scheduled_start")
      .order("scheduled_start", { ascending: false });
    if (meetingError) { setError(meetingError.message); return; }
    const rows = (meetingRows ?? []) as Meeting[];
    const current = selectFocusMeeting(rows);
    setMeeting(current);
    if (!current) { setDocuments([]); setReads([]); return; }

    const [documentResult, readResult, eligibleResult] = await Promise.all([
      supabase.from("documents").select("id,meeting_id,title,document_type,version,file_url,status,created_at").eq("meeting_id", current.id).order("created_at", { ascending: false }),
      supabase.from("document_reads").select("document_id").eq("meeting_id", current.id),
      supabase.from("meeting_eligible_voters").select("id").eq("meeting_id", current.id).eq("profile_id", user.id).maybeSingle(),
    ]);
    if (documentResult.error) setError(documentResult.error.message);
    else if (readResult.error) setError(readResult.error.message);
    setDocuments(((documentResult.data ?? []) as DocumentRow[]).filter((row) => isAdmin || row.status === "published"));
    setReads((readResult.data ?? []) as ReadRow[]);
    setEligibleVoterId((eligibleResult.data as { id: string } | null)?.id ?? null);
  }, [isAdmin, supabase, user.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel("documents-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "document_reads" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, supabase]);

  async function openDocument(document: DocumentRow) {
    window.open(document.file_url, "_blank", "noopener,noreferrer");
    const { error: readError } = await supabase.from("document_reads").insert({
      document_id: document.id,
      meeting_id: document.meeting_id,
      profile_id: user.id,
      eligible_voter_id: eligibleVoterId,
      user_agent: window.navigator.userAgent,
    });
    if (readError) setError(`เปิดเอกสารแล้ว แต่บันทึกหลักฐานการอ่านไม่สำเร็จ: ${readError.message}`);
    else { setMessage(`บันทึกการเปิดอ่าน “${document.title}” แล้ว`); await load(); }
  }

  async function addDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting || ["closed", "archived"].includes(meeting.status)) return;
    setBusy(true); setError(""); setMessage("");
    const { error: insertError } = await supabase.from("documents").insert({
      meeting_id: meeting.id,
      title: form.title.trim(),
      document_type: form.document_type,
      version: form.version.trim() || "v1.0",
      file_url: form.file_url.trim(),
      status: "published",
      uploaded_by: user.id,
      published_at: new Date().toISOString(),
    });
    if (insertError) setError(insertError.message);
    else { setForm({ ...form, title: "", file_url: "" }); setMessage("เผยแพร่เอกสารแล้ว ผู้เข้าร่วมสามารถเปิดอ่านได้ทันที"); await load(); }
    setBusy(false);
  }

  if (!meeting) return <section className="panel"><h2>ยังไม่มีการประชุมที่เข้าถึงได้</h2></section>;

  return (
    <section className="grid two-column">
      <div className="panel">
        <div className="section-title"><div><h2>เอกสารประกอบประชุม</h2><span className="muted">{meeting.code} · {meeting.title}</span></div><StatusBadge tone="blue">{documents.length} รายการ</StatusBadge></div>
        {error ? <p className="form-message error">{error}</p> : null}
        {message ? <p className="form-message success">{message}</p> : null}
        <div className="grid">
          {documents.map((document) => {
            const readCount = reads.filter((row) => row.document_id === document.id).length;
            return <article className="row-card" key={document.id}>
              <div className="row-header"><div><strong>{document.title}</strong><span className="muted">{document.document_type} · {document.version}</span></div><StatusBadge tone={document.status === "published" ? "green" : "gray"}>{document.status === "published" ? "เผยแพร่แล้ว" : document.status}</StatusBadge></div>
              <div className="row-actions"><button className="btn primary" onClick={() => openDocument(document)} type="button">เปิดเอกสาร</button>{isAdmin ? <span className="badge gray">เปิดอ่าน {readCount} ครั้ง</span> : null}</div>
            </article>;
          })}
          {documents.length === 0 ? <p className="muted">ยังไม่มีเอกสารที่เผยแพร่สำหรับการประชุมนี้</p> : null}
        </div>
      </div>

      {isAdmin ? <div className="panel">
        <div className="section-title"><h2>เพิ่มลิงก์เอกสาร</h2><StatusBadge tone="amber">Admin</StatusBadge></div>
        <form className="grid" onSubmit={addDocument}>
          <label>ชื่อเอกสาร *<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label>Google Drive URL *<input required type="url" value={form.file_url} onChange={(event) => setForm({ ...form, file_url: event.target.value })} placeholder="https://drive.google.com/..." /></label>
          <div className="form-grid"><label>เวอร์ชัน<input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} /></label><label>ประเภท<select value={form.document_type} onChange={(event) => setForm({ ...form, document_type: event.target.value })}><option>เอกสารประกอบวาระ</option><option>งบการเงิน</option><option>ใบมอบฉันทะ</option><option>ข้อบังคับ</option></select></label></div>
          <button className="btn primary" disabled={busy || ["closed", "archived"].includes(meeting.status)} type="submit">{busy ? "กำลังบันทึก..." : "เผยแพร่เอกสาร"}</button>
        </form>
      </div> : null}
    </section>
  );
}
