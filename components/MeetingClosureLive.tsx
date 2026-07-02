"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/AppShell";
import { useAuth } from "@/components/AuthGate";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Meeting = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  scheduled_start: string;
  scheduled_end: string | null;
  status: "draft" | "identity_open" | "in_progress" | "closed" | "archived";
  quorum_percent: number;
  google_meet_url: string | null;
  recording_url: string | null;
  created_at: string;
};

type ClosureCheck = { id: string; label: string; passed: boolean; detail: string };

export function MeetingClosureLive() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { user, isAdmin } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [checks, setChecks] = useState<ClosureCheck[]>([]);
  const [checking, setChecking] = useState(false);
  const [closing, setClosing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadMeeting = useCallback(async () => {
    if (!isAdmin) return;
    const { data, error: queryError } = await supabase
      .from("meetings")
      .select("id,code,title,description,scheduled_start,scheduled_end,status,quorum_percent,google_meet_url,recording_url,created_at")
      .order("scheduled_start", { ascending: false })
      .limit(30);
    if (queryError) { setError(queryError.message); return; }
    const rows = (data ?? []) as Meeting[];
    const current = rows.find((row) => row.status === "in_progress")
      ?? rows.find((row) => row.status === "identity_open")
      ?? rows.find((row) => row.status === "draft")
      ?? rows.find((row) => row.status === "closed")
      ?? null;
    setMeeting(current);
  }, [isAdmin, supabase]);

  useEffect(() => { loadMeeting(); }, [loadMeeting]);
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase.channel("meeting-closure")
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, loadMeeting)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, loadMeeting, supabase]);

  async function inspectMeeting(target: Meeting) {
    setChecking(true); setError(""); setMessage("");
    const [eligibleResult, attendanceResult, voteResult, documentResult, incidentResult, trafficResult, quorumResult] = await Promise.all([
      supabase.from("meeting_eligible_voters").select("id,identity_status,vote_weight,can_vote").eq("meeting_id", target.id),
      supabase.from("attendance_logs").select("profile_id,action,created_at").eq("meeting_id", target.id).in("action", ["join_meeting", "leave_meeting"]).order("created_at", { ascending: false }),
      supabase.from("vote_sessions").select("id,status,mode").eq("meeting_id", target.id),
      supabase.from("documents").select("id,status").eq("meeting_id", target.id),
      supabase.from("incident_reports").select("id,status").eq("meeting_id", target.id),
      supabase.from("traffic_logs").select("id", { count: "exact", head: true }).eq("meeting_id", target.id),
      supabase.rpc("get_meeting_quorum", { target_meeting_id: target.id }),
    ]);
    const firstError = eligibleResult.error || attendanceResult.error || voteResult.error || documentResult.error || incidentResult.error || trafficResult.error || quorumResult.error;
    if (firstError) { setError(firstError.message); setChecking(false); return [] as ClosureCheck[]; }

    const latestPresence = new Map<string, string>();
    for (const row of attendanceResult.data ?? []) {
      if (row.profile_id && !latestPresence.has(row.profile_id)) latestPresence.set(row.profile_id, row.action);
    }
    const joinedCount = Array.from(latestPresence.values()).filter((action) => action === "join_meeting").length;
    const eligibleRows = eligibleResult.data ?? [];
    const verifiedCount = eligibleRows.filter((row) => row.identity_status === "verified").length;
    const voteRows = voteResult.data ?? [];
    const unfinishedVotes = voteRows.filter((row) => !["closed", "voided"].includes(row.status)).length;
    const publishedDocuments = (documentResult.data ?? []).filter((row) => row.status === "published").length;
    const unresolvedIncidents = (incidentResult.data ?? []).filter((row) => ["open", "investigating"].includes(row.status)).length;
    const quorumRow = Array.isArray(quorumResult.data) ? quorumResult.data[0] : null;
    const quorumActual = Number(quorumRow?.quorum_percent_actual ?? 0);
    const quorumRequired = Number(quorumRow?.quorum_percent_required ?? target.quorum_percent);

    const nextChecks: ClosureCheck[] = [
      { id: "status", label: "สถานะการประชุม", passed: target.status === "in_progress", detail: target.status === "in_progress" ? "อยู่ในสถานะกำลังประชุม" : "ต้องเปลี่ยนเป็นกำลังประชุมก่อน" },
      { id: "quorum", label: "องค์ประชุม", passed: quorumActual >= quorumRequired, detail: `${quorumActual}% จากเกณฑ์ ${quorumRequired}% · ยืนยันแล้ว ${verifiedCount}/${eligibleRows.length} สิทธิ์` },
      { id: "attendance", label: "ผู้เข้าร่วมบันทึกออกแล้ว", passed: joinedCount === 0, detail: joinedCount === 0 ? "ไม่มีผู้ที่ยังค้างสถานะอยู่ในประชุม" : `ยังมี ${joinedCount} คนที่ต้องกดบันทึกออก` },
      { id: "votes", label: "ปิดวาระลงคะแนนครบ", passed: unfinishedVotes === 0, detail: unfinishedVotes === 0 ? `${voteRows.length} วาระเสร็จสิ้น` : `ยังเปิดหรือเป็นร่าง ${unfinishedVotes} วาระ` },
      { id: "documents", label: "มีเอกสารประกอบที่เผยแพร่", passed: publishedDocuments > 0, detail: `เอกสารเผยแพร่ ${publishedDocuments} รายการ` },
      { id: "recording", label: "มีลิงก์ไฟล์บันทึกการประชุม", passed: Boolean(target.recording_url), detail: target.recording_url ? "บันทึกลิงก์วิดีโอแล้ว" : "ยังไม่ได้บันทึกลิงก์ไฟล์วิดีโอใน Google Drive" },
      { id: "incidents", label: "เหตุขัดข้องได้รับการจัดการ", passed: unresolvedIncidents === 0, detail: unresolvedIncidents === 0 ? "ไม่มีเหตุที่ยังเปิดอยู่" : `ยังมีเหตุที่ต้องจัดการ ${unresolvedIncidents} รายการ` },
      { id: "traffic", label: "มีข้อมูลจราจรอิเล็กทรอนิกส์", passed: (trafficResult.count ?? 0) > 0, detail: `พบ traffic log ${trafficResult.count ?? 0} รายการ` },
    ];
    setChecks(nextChecks);
    setChecking(false);
    return nextChecks;
  }

  async function exportEvidence(target: Meeting) {
    setExporting(true); setError("");
    async function fetchAllTrafficLogs() {
      const rows: Record<string, unknown>[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error: pageError } = await supabase
          .from("traffic_logs")
          .select("*")
          .eq("meeting_id", target.id)
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (pageError) return { data: rows, error: pageError };
        rows.push(...((data ?? []) as Record<string, unknown>[]));
        if ((data ?? []).length < pageSize) break;
      }
      return { data: rows, error: null };
    }
    const [meetingResult, eligibleResult, attendanceResult, documentResult, readResult, agendaResult, announcementResult, voteSessionResult, incidentResult, evidenceResult, trafficResult] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", target.id).single(),
      supabase.from("meeting_eligible_voters").select("*").eq("meeting_id", target.id).order("created_at", { ascending: true }).limit(10000),
      supabase.from("attendance_logs").select("*").eq("meeting_id", target.id).order("created_at", { ascending: true }).limit(10000),
      supabase.from("documents").select("*").eq("meeting_id", target.id).order("created_at", { ascending: true }).limit(10000),
      supabase.from("document_reads").select("*").eq("meeting_id", target.id).order("read_at", { ascending: true }).limit(10000),
      supabase.from("agenda_items").select("*").eq("meeting_id", target.id).order("sort_order", { ascending: true }).limit(10000),
      supabase.from("announcements").select("*").eq("meeting_id", target.id).order("sort_order", { ascending: true }).order("created_at", { ascending: false }).limit(10000),
      supabase.from("vote_sessions").select("*").eq("meeting_id", target.id).order("created_at", { ascending: true }).limit(10000),
      supabase.from("incident_reports").select("*").eq("meeting_id", target.id).order("created_at", { ascending: true }).limit(10000),
      supabase.from("evidence_files").select("*").eq("meeting_id", target.id).order("created_at", { ascending: true }).limit(10000),
      fetchAllTrafficLogs(),
    ]);
    const results = [meetingResult, eligibleResult, attendanceResult, documentResult, readResult, agendaResult, announcementResult, voteSessionResult, incidentResult, evidenceResult, trafficResult];
    const failed = results.find((result) => result.error);
    if (failed?.error) { setError(failed.error.message); setExporting(false); return; }

    const voteSessions = voteSessionResult.data ?? [];
    const openSessionIds = voteSessions.filter((row) => row.mode === "open").map((row) => row.id);
    const openVoteResult = openSessionIds.length > 0
      ? await supabase.from("open_votes").select("*").in("vote_session_id", openSessionIds).order("created_at", { ascending: true }).limit(10000)
      : { data: [], error: null };
    if (openVoteResult.error) { setError(openVoteResult.error.message); setExporting(false); return; }

    const openDetails = await Promise.all(voteSessions.filter((row) => row.mode === "open" && row.status === "closed").map(async (session) => {
      const result = await supabase.rpc("get_closed_open_vote_details", { target_vote_session_id: session.id });
      return { vote_session_id: session.id, rows: result.data ?? [], error: result.error?.message ?? null };
    }));
    const secretSummaries = await Promise.all(voteSessions.filter((row) => row.mode === "secret" && row.status === "closed").map(async (session) => {
      const result = await supabase.rpc("get_closed_secret_vote_summary", { target_vote_session_id: session.id });
      return { vote_session_id: session.id, rows: result.data ?? [], error: result.error?.message ?? null };
    }));

    const lotIds = Array.from(new Set((eligibleResult.data ?? []).map((row) => row.lot_id).filter(Boolean)));
    const lotResult = lotIds.length > 0
      ? await supabase.from("lots").select("id,lot_no,house_no,owner_name,vote_weight,can_vote").in("id", lotIds).limit(10000)
      : { data: [], error: null };
    if (lotResult.error) { setError(lotResult.error.message); setExporting(false); return; }

    const payload = {
      meeting: meetingResult.data,
      lots: lotResult.data ?? [],
      eligible_voters: eligibleResult.data ?? [],
      attendance_logs: attendanceResult.data ?? [],
      documents: documentResult.data ?? [],
      document_reads: readResult.data ?? [],
      agenda_items: agendaResult.data ?? [],
      announcements: announcementResult.data ?? [],
      vote_sessions: voteSessions,
      open_votes: openVoteResult.data ?? [],
      open_vote_house_details: openDetails,
      secret_vote_summaries: secretSummaries,
      incident_reports: incidentResult.data ?? [],
      evidence_files: evidenceResult.data ?? [],
      traffic_logs: trafficResult.data ?? [],
    };
    const generatedAt = new Date().toISOString();
    const csvEscape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const manifest = {
      format: "village-e-meeting-evidence-csv-v1",
      generated_at: generatedAt,
      generated_by: user.id,
      meeting_id: target.id,
      meeting_code: target.code,
      secret_ballot_note: "Secret ballot exports contain aggregate results only and exclude voter identity, receipt tokens, IP, and per-ballot timestamps.",
    };
    const sections: Record<string, unknown> = { manifest, ...payload };
    const csvRows = [["section", "row_number", "id", "meeting_id", "event_time", "label", "status", "record_json"].map(csvEscape).join(",")];
    for (const [section, value] of Object.entries(sections)) {
      const records = Array.isArray(value) ? value : [value];
      records.forEach((record, index) => {
        const row: Record<string, unknown> = record && typeof record === "object" ? record as Record<string, unknown> : { value: record };
        const eventTime = row.created_at ?? row.updated_at ?? row.read_at ?? row.opened_at ?? row.closed_at ?? "";
        const label = row.title ?? row.motion_text ?? row.action ?? row.incident_type ?? row.code ?? row.lot_no ?? "";
        const status = row.status ?? row.identity_status ?? row.choice ?? "";
        csvRows.push([
          section,
          index + 1,
          row.id ?? row.vote_session_id ?? "",
          row.meeting_id ?? target.id,
          eventTime,
          label,
          status,
          JSON.stringify(row),
        ].map(csvEscape).join(","));
      });
    }
    const csvText = `\uFEFF${csvRows.join("\r\n")}`;
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(csvText));
    const checksum = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const timestamp = generatedAt.replaceAll(":", "-");
    const csvFilename = `${target.code}-evidence-${timestamp}.csv`;
    const checksumFilename = `${target.code}-evidence-${timestamp}.sha256.txt`;

    const { error: auditError } = await supabase.from("admin_audit_logs").insert({
      actor_profile_id: user.id,
      action: "export_meeting_evidence_csv",
      target_table: "meetings",
      target_id: target.id,
      after_data: { filename: csvFilename, sha256: checksum, generated_at: generatedAt, csv_row_count: csvRows.length - 1 },
      user_agent: window.navigator.userAgent,
    });
    if (auditError) { setError(`ไม่สามารถบันทึก checksum ลง audit log: ${auditError.message}`); setExporting(false); return; }

    const download = (content: BlobPart, type: string, filename: string) => {
      const url = URL.createObjectURL(new Blob([content], { type }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    };
    download(csvText, "text/csv;charset=utf-8", csvFilename);
    download(`${checksum}  ${csvFilename}\n`, "text/plain;charset=utf-8", checksumFilename);
    setMessage(`ดาวน์โหลด CSV และ checksum แล้ว · SHA-256 ${checksum.slice(0, 16)}...`);
    setExporting(false);
  }

  async function closeMeeting() {
    if (!meeting || meeting.status !== "in_progress") return;
    const latestChecks = await inspectMeeting(meeting);
    if (!latestChecks.length || latestChecks.some((check) => !check.passed)) { setError("ยังปิดประชุมไม่ได้ กรุณาแก้รายการที่ยังไม่ผ่าน"); return; }
    setClosing(true); setError("");
    const { error: closeError } = await supabase.from("meetings").update({ status: "closed", scheduled_end: meeting.scheduled_end ?? new Date().toISOString() }).eq("id", meeting.id).eq("status", "in_progress");
    if (closeError) { setError(closeError.message); setClosing(false); return; }
    await supabase.from("admin_audit_logs").insert({ actor_profile_id: user.id, action: "close_meeting_after_checklist", target_table: "meetings", target_id: meeting.id, before_data: { status: meeting.status }, after_data: { status: "closed" }, user_agent: window.navigator.userAgent });
    const closedMeeting: Meeting = { ...meeting, status: "closed", scheduled_end: meeting.scheduled_end ?? new Date().toISOString() };
    setMeeting(closedMeeting);
    setChecks([]);
    setMessage("ปิดและล็อกการประชุมแล้ว กำลังจัดชุดหลักฐาน");
    setClosing(false);
    await exportEvidence(closedMeeting);
  }

  if (!isAdmin || !meeting) return null;
  const ready = checks.length > 0 && checks.every((check) => check.passed);
  const closed = ["closed", "archived"].includes(meeting.status);

  return <section className="panel closure-panel" id="meeting-closure">
    <div className="section-title"><div><span className="eyebrow">Meeting closeout</span><h2>ตรวจความพร้อมก่อนปิดประชุม</h2><span className="muted">{meeting.code} · {meeting.title}</span></div><StatusBadge tone={closed ? "gray" : ready ? "green" : "amber"}>{closed ? "ปิดและล็อกแล้ว" : ready ? "พร้อมปิด" : "รอตรวจ"}</StatusBadge></div>
    {error ? <p className="form-message error">{error}</p> : null}
    {message ? <p className="form-message success">{message}</p> : null}
    {checks.length > 0 ? <div className="closure-checklist">{checks.map((check) => <div className="closure-check" key={check.id}><StatusBadge tone={check.passed ? "green" : "red"}>{check.passed ? "ผ่าน" : "ต้องแก้"}</StatusBadge><div><strong>{check.label}</strong><span>{check.detail}</span></div></div>)}</div> : null}
    <div className="row-actions">
      {!closed ? <button className="btn" disabled={checking || closing} onClick={() => inspectMeeting(meeting)} type="button">{checking ? "กำลังตรวจ..." : "ตรวจความพร้อม"}</button> : null}
      {!closed ? <button className="btn danger" disabled={!ready || checking || closing} onClick={closeMeeting} type="button">{closing ? "กำลังปิด..." : "ยืนยันปิดประชุม"}</button> : null}
      {closed ? <button className="btn primary" disabled={exporting} onClick={() => exportEvidence(meeting)} type="button">{exporting ? "กำลังจัดชุดหลักฐาน..." : "ดาวน์โหลดหลักฐาน CSV + SHA-256"}</button> : null}
    </div>
    {!closed && meeting.status !== "in_progress" ? <p className="form-message warning">เริ่มประชุมและเปลี่ยนสถานะเป็น “กำลังประชุม” ก่อนใช้ขั้นตอนปิดประชุม</p> : null}
  </section>;
}
