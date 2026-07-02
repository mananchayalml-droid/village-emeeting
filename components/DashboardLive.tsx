"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/AppShell";
import { useAuth } from "@/components/AuthGate";
import { selectFocusMeeting } from "@/lib/meetings/selectFocusMeeting";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Meeting = {
  id: string;
  code: string;
  title: string;
  scheduled_start: string;
  scheduled_end: string | null;
  status: "draft" | "identity_open" | "in_progress" | "closed" | "archived";
  quorum_percent: number;
};

type Quorum = {
  eligible_count: number;
  verified_count: number;
  quorum_percent_actual: number;
  quorum_percent_required: number;
};

type Agenda = { id: string; agenda_no: string; title: string; description: string | null; image_url: string | null; content_url: string | null; content_type: "image" | "pdf" | null; requires_vote: boolean; sort_order: number };
type Announcement = { id: string; announcement_type: "announcement" | "news"; title: string; content: string | null; attachment_url: string | null; attachment_type: "image" | "pdf" | null; sort_order: number; is_published: boolean; created_at: string };
type DocumentRow = { id: string; title: string; version: string };
type Incident = { id: string; incident_type: string; detail: string; status: string; created_at: string };
type VoteSession = {
  id: string;
  agenda_item_id: string;
  motion_text: string;
  mode: "open" | "secret";
  status: "draft" | "open" | "closed" | "voided";
  ballot_options: string[] | null;
  created_at: string;
};
type OpenVote = { vote_session_id: string; choice: "yes" | "no" | "abstain" | "candidate"; candidate_text: string | null; vote_weight: number };
type SecretSummary = { option_label?: string; choice?: "yes" | "no" | "abstain"; ballot_count: number; vote_weight_sum: number };
type ResultRow = { label: string; ballots: number; weight: number; percent: number };

const statusLabels: Record<Meeting["status"], string> = {
  draft: "เตรียมการประชุม",
  identity_open: "เปิดลงทะเบียน",
  in_progress: "กำลังประชุม",
  closed: "ประชุมเสร็จแล้ว",
  archived: "เก็บเป็นหลักฐาน",
};
const legacyChoiceLabel = { yes: "เห็นชอบ", no: "ไม่เห็นชอบ", abstain: "งดออกเสียง" } as const;
const defaultOptions = ["เห็นชอบ", "ไม่เห็นชอบ", "งดออกเสียง"];

function formatMeetingDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function incidentLabel(status: string) {
  if (status === "resolved" || status === "closed") return "แก้ไขแล้ว";
  if (status === "investigating") return "กำลังตรวจสอบ";
  return "รอดำเนินการ";
}

function googleDriveFileId(value: string) {
  const trimmed = value.trim();
  const driveFileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveFileMatch) return driveFileMatch[1];
  try {
    const url = new URL(trimmed);
    return url.hostname === "drive.google.com" ? url.searchParams.get("id") : null;
  } catch {
    return null;
  }
}

function agendaAttachmentUrl(value: string, type: "image" | "pdf") {
  const driveId = googleDriveFileId(value);
  if (!driveId) return value.trim();
  return type === "pdf"
    ? `https://drive.google.com/file/d/${driveId}/preview`
    : `https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`;
}

function AgendaAttachment({ url, type, title, preview = false }: { url: string; type: "image" | "pdf"; title: string; preview?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const embeddedUrl = agendaAttachmentUrl(url, type);
  const driveId = googleDriveFileId(url);
  useEffect(() => { setImageFailed(false); }, [type, url]);
  return <div className={`agenda-attachment agenda-attachment-${type}${preview ? " agenda-attachment-preview" : ""}`}>
    {type === "pdf"
      ? <iframe loading="lazy" referrerPolicy="no-referrer" src={embeddedUrl} title={`PDF ${title}`} />
      : imageFailed && driveId
        ? <iframe loading="lazy" referrerPolicy="no-referrer" src={`https://drive.google.com/file/d/${driveId}/preview`} title={`รูปภาพ ${title}`} />
        : imageFailed
          ? <p className="agenda-attachment-error">ไม่สามารถแสดงรูปจากลิงก์นี้ได้ กรุณาตรวจ URL และสิทธิ์การเข้าถึงไฟล์</p>
          : <img alt={title} loading="lazy" onError={() => setImageFailed(true)} src={embeddedUrl} />}
    {imageFailed ? <small className="agenda-attachment-warning">กำลังใช้หน้าพรีวิวแทนรูปโดยตรง หากยังไม่แสดง ให้ตั้งสิทธิ์ Google Drive เป็น “ทุกคนที่มีลิงก์ดูได้”</small> : null}
    <a href={url} rel="noreferrer" target="_blank">เปิด{type === "pdf" ? " PDF" : "รูปภาพ"}เต็มหน้าจอ</a>
  </div>;
}

export function DashboardLive() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { user, isAdmin } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [quorum, setQuorum] = useState<Quorum | null>(null);
  const [joinedCount, setJoinedCount] = useState(0);
  const [attendedCount, setAttendedCount] = useState(0);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [readDocumentIds, setReadDocumentIds] = useState<Set<string>>(() => new Set());
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [sessions, setSessions] = useState<VoteSession[]>([]);
  const [voteResults, setVoteResults] = useState<Record<string, ResultRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState("");
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ announcement_type: "announcement" as "announcement" | "news", title: "", content: "", attachment_url: "", attachment_type: "image" as "image" | "pdf" });

  const loadDashboard = useCallback(async () => {
    setError("");
    const { data: meetingRows, error: meetingError } = await supabase
      .from("meetings")
      .select("id,code,title,scheduled_start,scheduled_end,status,quorum_percent")
      .order("scheduled_start", { ascending: false })
      .limit(20);

    if (meetingError) { setError(meetingError.message); setLoading(false); return; }
    const meetingList = (meetingRows ?? []) as Meeting[];
    const current = selectFocusMeeting(meetingList);
    setMeeting(current);

    if (!current) {
      setQuorum(null); setJoinedCount(0); setAttendedCount(0); setAgendas([]); setAnnouncements([]); setDocuments([]); setReadDocumentIds(new Set()); setIncidents([]); setSessions([]); setVoteResults({});
      setUpdatedAt(new Date()); setLoading(false); return;
    }

    const [quorumResult, agendaResult, announcementResult, documentResult, readResult, incidentResult, sessionResult, attendanceResult] = await Promise.all([
      supabase.rpc("get_meeting_quorum", { target_meeting_id: current.id }),
      supabase.from("agenda_items").select("id,agenda_no,title,description,image_url,content_url,content_type,requires_vote,sort_order").eq("meeting_id", current.id).order("sort_order", { ascending: true }),
      supabase.from("announcements").select("id,announcement_type,title,content,attachment_url,attachment_type,sort_order,is_published,created_at").eq("meeting_id", current.id).eq("is_published", true).order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
      supabase.from("documents").select("id,title,version").eq("meeting_id", current.id).eq("status", "published").order("published_at", { ascending: true }),
      supabase.from("document_reads").select("document_id").eq("meeting_id", current.id),
      supabase.from("incident_reports").select("id,incident_type,detail,status,created_at").eq("meeting_id", current.id).order("created_at", { ascending: false }),
      supabase.from("vote_sessions").select("id,agenda_item_id,motion_text,mode,status,ballot_options,created_at").eq("meeting_id", current.id).order("created_at", { ascending: false }),
      supabase.from("attendance_logs").select("profile_id,action,created_at").eq("meeting_id", current.id).in("action", ["join_meeting", "leave_meeting"]).order("created_at", { ascending: false }),
    ]);

    if (quorumResult.error) setError(`ไม่สามารถอ่านองค์ประชุมได้: ${quorumResult.error.message}`);
    if (announcementResult.error) setError(announcementResult.error.message.includes("announcements") ? "กรุณารัน 020_announcements.sql ใน Supabase เพื่อเปิดใช้ประกาศ/ข่าวประชาสัมพันธ์" : announcementResult.error.message);
    const quorumRow = Array.isArray(quorumResult.data) ? quorumResult.data[0] : null;
    setQuorum(quorumRow ? {
      eligible_count: Number(quorumRow.eligible_count ?? 0),
      verified_count: Number(quorumRow.verified_count ?? 0),
      quorum_percent_actual: Number(quorumRow.quorum_percent_actual ?? 0),
      quorum_percent_required: Number(quorumRow.quorum_percent_required ?? current.quorum_percent),
    } : null);

    const nextSessions = (sessionResult.data ?? []) as VoteSession[];
    const resultMap: Record<string, ResultRow[]> = {};
    const closedOpenIds = nextSessions.filter((item) => item.mode === "open" && item.status === "closed").map((item) => item.id);
    if (closedOpenIds.length > 0) {
      const openVoteResult = await supabase.from("open_votes").select("vote_session_id,choice,candidate_text,vote_weight").in("vote_session_id", closedOpenIds);
      const openVotes = (openVoteResult.data ?? []) as OpenVote[];
      for (const session of nextSessions.filter((item) => closedOpenIds.includes(item.id))) {
        const options = session.ballot_options?.length ? session.ballot_options : defaultOptions;
        const rows = options.map((label) => {
          const votes = openVotes.filter((vote) => vote.vote_session_id === session.id && (vote.choice === "candidate" ? vote.candidate_text : legacyChoiceLabel[vote.choice]) === label);
          return { label, ballots: votes.length, weight: votes.reduce((sum, vote) => sum + Number(vote.vote_weight), 0), percent: 0 };
        });
        const total = rows.reduce((sum, row) => sum + row.weight, 0);
        resultMap[session.id] = rows.map((row) => ({ ...row, percent: total ? (row.weight / total) * 100 : 0 }));
      }
    }
    for (const session of nextSessions.filter((item) => item.mode === "secret" && item.status === "closed")) {
      const summary = await supabase.rpc("get_closed_secret_vote_summary", { target_vote_session_id: session.id });
      if (!summary.error) {
        const rows = ((summary.data ?? []) as SecretSummary[]).map((row) => ({
          label: row.option_label ?? (row.choice ? legacyChoiceLabel[row.choice] : "ตัวเลือก"),
          ballots: Number(row.ballot_count ?? 0), weight: Number(row.vote_weight_sum ?? 0), percent: 0,
        }));
        const total = rows.reduce((sum, row) => sum + row.weight, 0);
        resultMap[session.id] = rows.map((row) => ({ ...row, percent: total ? (row.weight / total) * 100 : 0 }));
      }
    }

    const latestPresence = new Map<string, string>();
    for (const row of attendanceResult.data ?? []) if (row.profile_id && !latestPresence.has(row.profile_id)) latestPresence.set(row.profile_id, row.action);
    setJoinedCount(Array.from(latestPresence.values()).filter((action) => action === "join_meeting").length);
    setAttendedCount(new Set((attendanceResult.data ?? []).filter((row) => row.action === "join_meeting" && row.profile_id).map((row) => row.profile_id as string)).size);
    setAgendas((agendaResult.data ?? []) as Agenda[]);
    setAnnouncements((announcementResult.data ?? []) as Announcement[]);
    setDocuments((documentResult.data ?? []) as DocumentRow[]);
    setReadDocumentIds(new Set((readResult.data ?? []).map((row) => row.document_id)));
    setIncidents((incidentResult.data ?? []) as Incident[]);
    setSessions(nextSessions);
    setVoteResults(resultMap);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    const channel = supabase.channel("village-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, loadDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_eligible_voters" }, loadDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, loadDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, loadDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "document_reads" }, loadDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_items" }, loadDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, loadDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "vote_sessions" }, loadDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "open_votes" }, loadDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "secret_votes" }, loadDashboard)
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_reports" }, loadDashboard)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadDashboard, supabase]);

  function resetAnnouncementForm() {
    setEditingAnnouncementId("");
    setAnnouncementForm({ announcement_type: "announcement", title: "", content: "", attachment_url: "", attachment_type: "image" });
    setShowAnnouncementForm(false);
  }

  function editAnnouncement(announcement: Announcement) {
    setEditingAnnouncementId(announcement.id);
    setAnnouncementForm({
      announcement_type: announcement.announcement_type,
      title: announcement.title,
      content: announcement.content ?? "",
      attachment_url: announcement.attachment_url ?? "",
      attachment_type: announcement.attachment_type ?? "image",
    });
    setShowAnnouncementForm(true);
  }

  async function saveAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!meeting || !isAdmin || !["draft", "identity_open"].includes(meeting.status)) return;
    const attachmentUrl = announcementForm.attachment_url.trim();
    if (attachmentUrl) {
      try {
        const parsed = new URL(attachmentUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid protocol");
      } catch {
        setError("URL ไฟล์แนบไม่ถูกต้อง กรุณาใช้ลิงก์ http หรือ https");
        return;
      }
    }
    setAnnouncementBusy(true);
    setError("");
    const payload = {
      meeting_id: meeting.id,
      announcement_type: announcementForm.announcement_type,
      title: announcementForm.title.trim(),
      content: announcementForm.content.trim() || null,
      attachment_url: attachmentUrl || null,
      attachment_type: attachmentUrl ? announcementForm.attachment_type : null,
      sort_order: editingAnnouncementId ? undefined : announcements.length + 1,
      is_published: true,
      created_by: user.id,
    };
    const query = editingAnnouncementId
      ? supabase.from("announcements").update(payload).eq("id", editingAnnouncementId).eq("meeting_id", meeting.id).select().single()
      : supabase.from("announcements").insert(payload).select().single();
    const { data, error: saveError } = await query;
    if (saveError) {
      setError(saveError.message.includes("announcements") ? "กรุณารัน 020_announcements.sql ใน Supabase ก่อน" : saveError.message);
      setAnnouncementBusy(false);
      return;
    }
    await supabase.from("admin_audit_logs").insert({
      actor_profile_id: user.id,
      action: editingAnnouncementId ? "update_announcement" : "create_announcement",
      target_table: "announcements",
      target_id: data.id,
      after_data: data,
      user_agent: window.navigator.userAgent,
    });
    resetAnnouncementForm();
    await loadDashboard();
    setAnnouncementBusy(false);
  }

  async function deleteAnnouncement(announcement: Announcement) {
    if (!meeting || !isAdmin || !["draft", "identity_open"].includes(meeting.status)) return;
    if (!window.confirm(`ยืนยันลบประกาศ “${announcement.title}”?`)) return;
    setAnnouncementBusy(true);
    const { error: deleteError } = await supabase.from("announcements").delete().eq("id", announcement.id).eq("meeting_id", meeting.id);
    if (deleteError) setError(deleteError.message);
    else {
      await supabase.from("admin_audit_logs").insert({ actor_profile_id: user.id, action: "delete_announcement", target_table: "announcements", target_id: announcement.id, before_data: announcement });
      await loadDashboard();
    }
    setAnnouncementBusy(false);
  }

  if (loading) return <section className="panel overview-loading"><span className="overview-loader" /><div><h2>กำลังเตรียมภาพรวมการประชุม</h2><p>รวบรวมองค์ประชุม วาระ เอกสาร และผลลงคะแนนล่าสุด</p></div></section>;
  if (!meeting) return <section className="panel"><h2>ยังไม่มีข้อมูลการประชุมสำหรับแสดง</h2><p>เมื่อ Admin สร้างการประชุม รายละเอียดและความพร้อมจะปรากฏที่หน้านี้</p></section>;

  const isLiveMeeting = meeting.status === "in_progress";
  const isUpcomingMeeting = meeting.status === "draft" || meeting.status === "identity_open";
  const actualQuorum = quorum?.quorum_percent_actual ?? 0;
  const requiredQuorum = quorum?.quorum_percent_required ?? meeting.quorum_percent;
  const quorumPassed = actualQuorum >= requiredQuorum;
  const minimumPeople = Math.ceil(((quorum?.eligible_count ?? 0) * requiredQuorum) / 100);
  const missingPeople = Math.max(0, minimumPeople - (quorum?.verified_count ?? 0));
  const openSessions = sessions.filter((item) => item.status === "open");
  const closedSessions = sessions.filter((item) => item.status === "closed");
  const openIncidents = incidents.filter((item) => !["resolved", "closed"].includes(item.status));
  const unreadDocuments = Math.max(0, documents.length - readDocumentIds.size);
  const votingAgendaCount = agendas.filter((item) => item.requires_vote).length;
  const latestClosedVote = closedSessions.find((item) => voteResults[item.id]?.length);
  const latestResults = latestClosedVote ? voteResults[latestClosedVote.id] : [];

  return <section className="resident-dashboard" aria-label="ภาพรวมการประชุมสำหรับลูกบ้าน">
    {error ? <p className="form-message error">{error}</p> : null}

    <section className="panel live-meeting-strip overview-meeting-heading">
      <div><span className={`overview-context-label ${isLiveMeeting ? "live" : isUpcomingMeeting ? "upcoming" : "history"}`}>{isLiveMeeting ? "การประชุมปัจจุบัน · อัปเดตสด" : isUpcomingMeeting ? "การประชุมที่กำลังจะมาถึง" : "สรุปการประชุมครั้งล่าสุด"}</span><span className="eyebrow">{meeting.code}</span><h2>{meeting.title}</h2><p>{isLiveMeeting ? "เริ่มประชุม " : isUpcomingMeeting ? "กำหนดประชุม " : "จัดประชุมเมื่อ "}{formatMeetingDate(meeting.scheduled_start)}</p></div>
      <div><StatusBadge tone={isLiveMeeting ? "green" : isUpcomingMeeting ? "amber" : "blue"}>{statusLabels[meeting.status]}</StatusBadge><small className="muted">{isLiveMeeting ? `ข้อมูลล่าสุด ${updatedAt?.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : isUpcomingMeeting ? `ข้อมูลเตรียมการล่าสุด ${updatedAt?.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : "ข้อมูลจากหลักฐานการประชุมที่บันทึกไว้"}</small></div>
    </section>

    <section className="overview-hero-grid">
      <article className="panel quorum-overview">
        <div className="quorum-ring" style={{ "--quorum": `${Math.min(actualQuorum, 100)}%` } as React.CSSProperties}>
          <div><strong>{actualQuorum.toFixed(actualQuorum % 1 ? 1 : 0)}%</strong><span>องค์ประชุม</span></div>
        </div>
        <div className="quorum-copy">
          <span className={`overview-signal ${quorumPassed && !isUpcomingMeeting ? "good" : "waiting"}`}>{isLiveMeeting ? (quorumPassed ? "องค์ประชุมครบแล้ว" : `ยังขาดอีก ${missingPeople} คน`) : isUpcomingMeeting ? (meeting.status === "identity_open" ? "เปิดให้ยืนยันตัวตนแล้ว" : "อยู่ระหว่างเตรียมการประชุม") : (quorumPassed ? "องค์ประชุมผ่านตามข้อกำหนด" : "องค์ประชุมไม่ผ่านตามข้อกำหนด")}</span>
          <h3>{quorum?.verified_count ?? 0} จาก {quorum?.eligible_count ?? 0} สิทธิ์ยืนยันตัวตนแล้ว</h3>
          <p>ข้อบังคับกำหนดองค์ประชุมอย่างน้อย {requiredQuorum}%</p>
          <div className="quorum-threshold"><span style={{ width: `${Math.min(actualQuorum, 100)}%` }} /><i style={{ left: `${Math.min(requiredQuorum, 100)}%` }} /></div>
        </div>
      </article>

      <div className="overview-metrics" aria-label="ตัวเลขสำคัญ">
        <a aria-label="เปิดหน้าการประชุมและตรวจการยืนยันตัวตน" className="overview-metric metric-attendance" href="/meetings"><span>{isLiveMeeting ? "อยู่ในห้องประชุม" : isUpcomingMeeting ? "ยืนยันตัวตนแล้ว" : "ผู้เข้าร่วมประชุม"}</span><strong>{isLiveMeeting ? joinedCount : isUpcomingMeeting ? (quorum?.verified_count ?? 0) : attendedCount}</strong><small>{isLiveMeeting ? "คนออนไลน์ขณะนี้" : isUpcomingMeeting ? `จากผู้มีสิทธิ์ ${quorum?.eligible_count ?? 0} ราย` : "คนที่บันทึกเข้าประชุม"}</small><span className="metric-link-label">เปิดดู <b aria-hidden="true">→</b></span></a>
        <a aria-label="เปิดหน้าลงคะแนน" className="overview-metric metric-vote" href="/voting"><span>วาระลงคะแนน</span><strong>{isUpcomingMeeting ? votingAgendaCount : openSessions.length}</strong><small>{isUpcomingMeeting ? (votingAgendaCount ? "วาระที่เตรียมไว้" : "ยังไม่ได้กำหนด") : openSessions.length ? "กำลังเปิดรับคะแนน" : `สรุปแล้ว ${closedSessions.length} วาระ`}</small><span className="metric-link-label">เปิดดู <b aria-hidden="true">→</b></span></a>
        <a aria-label="เปิดหน้าเอกสารการประชุม" className="overview-metric metric-document" href="/documents"><span>เอกสารประชุม</span><strong>{documents.length}</strong><small>{isAdmin ? `มีการเปิดอ่าน ${readDocumentIds.size} ฉบับ` : unreadDocuments ? `ยังไม่ได้อ่าน ${unreadDocuments} ฉบับ` : "อ่านครบแล้ว"}</small><span className="metric-link-label">เปิดดู <b aria-hidden="true">→</b></span></a>
        <a aria-label="เปิดหน้าเหตุขัดข้อง" className="overview-metric metric-incident" href="/incidents"><span>เหตุที่ติดตามอยู่</span><strong>{openIncidents.length}</strong><small>{openIncidents.length ? "กำลังดำเนินการแก้ไข" : "ไม่มีเหตุค้าง"}</small><span className="metric-link-label">เปิดดู <b aria-hidden="true">→</b></span></a>
      </div>
    </section>

    <section className="overview-main-grid">
      <article className="panel agenda-overview">
        <div className="section-title"><div><span className="eyebrow">ข้อมูลจากนิติบุคคล</span><h2>ประกาศ / ข่าวประชาสัมพันธ์</h2></div><div className="row-actions">{isAdmin && ["draft", "identity_open"].includes(meeting.status) ? <button className="btn compact" onClick={() => { if (showAnnouncementForm) resetAnnouncementForm(); else setShowAnnouncementForm(true); }} type="button">{showAnnouncementForm ? "ปิดแบบฟอร์ม" : "+ เพิ่มประกาศ"}</button> : null}<StatusBadge tone="blue">{announcements.length} รายการ</StatusBadge></div></div>
        {showAnnouncementForm && isAdmin ? <form className="agenda-content-form" onSubmit={saveAnnouncement}>
          <div className="agenda-content-fields">
            <label>ประเภท *<select value={announcementForm.announcement_type} onChange={(event) => setAnnouncementForm((current) => ({ ...current, announcement_type: event.target.value as "announcement" | "news" }))}><option value="announcement">ประกาศ</option><option value="news">ข่าวประชาสัมพันธ์</option></select></label>
            <label>หัวข้อ *<input required value={announcementForm.title} onChange={(event) => setAnnouncementForm((current) => ({ ...current, title: event.target.value }))} placeholder="ชื่อประกาศหรือข่าว" /></label>
            <label className="agenda-description-field">เนื้อหา<textarea value={announcementForm.content} onChange={(event) => setAnnouncementForm((current) => ({ ...current, content: event.target.value }))} placeholder="สรุปข้อมูลสำคัญที่ลูกบ้านควรรู้" /></label>
            <label className="agenda-attachment-type-field">ชนิดไฟล์แนบ<select value={announcementForm.attachment_type} onChange={(event) => setAnnouncementForm((current) => ({ ...current, attachment_type: event.target.value as "image" | "pdf" }))}><option value="image">รูปภาพ</option><option value="pdf">ไฟล์ PDF</option></select></label>
            <label className="agenda-attachment-url-field">ลิงก์ไฟล์จาก Google Drive หรือ URL<input type="url" value={announcementForm.attachment_url} onChange={(event) => setAnnouncementForm((current) => ({ ...current, attachment_url: event.target.value }))} placeholder="https://drive.google.com/file/d/..." /><small>ตั้งสิทธิ์ไฟล์เป็น “ทุกคนที่มีลิงก์ดูได้” ส่วนเอกสารทางการให้เพิ่มในหน้าเอกสาร</small></label>
          </div>
          {announcementForm.attachment_url ? <AgendaAttachment preview title="ตัวอย่างไฟล์แนบประกาศ" type={announcementForm.attachment_type} url={announcementForm.attachment_url} /> : null}
          <div className="row-actions"><button className="btn primary" disabled={announcementBusy} type="submit">{announcementBusy ? "กำลังบันทึก..." : editingAnnouncementId ? "บันทึกการแก้ไข" : "เผยแพร่ประกาศ"}</button>{editingAnnouncementId ? <button className="btn" onClick={resetAnnouncementForm} type="button">ยกเลิก</button> : null}</div>
        </form> : null}
        <div className="agenda-timeline">
          {announcements.map((announcement, index) => {
            return <div className="agenda-timeline-row" key={announcement.id}>
              <span className="agenda-number">{index + 1}</span>
              <div className="agenda-content"><strong>{announcement.title}</strong>{announcement.content ? <p>{announcement.content}</p> : null}{announcement.attachment_url && announcement.attachment_type ? <AgendaAttachment title={`${announcement.announcement_type === "news" ? "ข่าวประชาสัมพันธ์" : "ประกาศ"} ${announcement.title}`} type={announcement.attachment_type} url={announcement.attachment_url} /> : null}<small>เผยแพร่ {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(announcement.created_at))}</small>{isAdmin && ["draft", "identity_open"].includes(meeting.status) ? <div className="row-actions agenda-admin-actions"><button className="btn compact" disabled={announcementBusy} onClick={() => editAnnouncement(announcement)} type="button">แก้ไข</button><button className="btn danger compact" disabled={announcementBusy} onClick={() => deleteAnnouncement(announcement)} type="button">ลบ</button></div> : null}</div>
              <StatusBadge tone={announcement.announcement_type === "news" ? "blue" : "amber"}>{announcement.announcement_type === "news" ? "ข่าวประชาสัมพันธ์" : "ประกาศ"}</StatusBadge>
            </div>;
          })}
          {announcements.length === 0 ? <p className="overview-empty">ยังไม่มีประกาศหรือข่าวประชาสัมพันธ์</p> : null}
        </div>
      </article>

      <article className="panel now-overview">
        <div className="section-title"><div><span className="eyebrow">สรุปสั้น ๆ</span><h2>{isLiveMeeting ? "สิ่งที่ควรรู้ตอนนี้" : isUpcomingMeeting ? "ความพร้อมก่อนประชุม" : "สรุปจากการประชุมครั้งนี้"}</h2></div></div>
        <ol className="now-list">
          <li className={isUpcomingMeeting ? (meeting.status === "identity_open" ? "done" : "attention") : quorumPassed ? "done" : "attention"}><span>1</span><div><strong>{isLiveMeeting ? (quorumPassed ? "เริ่มประชุมและลงมติได้" : "กำลังรอองค์ประชุม") : isUpcomingMeeting ? (meeting.status === "identity_open" ? "เปิดให้ลูกบ้านยืนยันตัวตนแล้ว" : "ยังไม่เปิดแสดงตน") : (quorumPassed ? "องค์ประชุมผ่านตามข้อบังคับ" : "องค์ประชุมไม่ผ่านตามข้อบังคับ")}</strong><small>{isLiveMeeting ? (quorumPassed ? `ยืนยันตัวตนแล้ว ${actualQuorum.toFixed(1)}%` : `ต้องการผู้ยืนยันเพิ่ม ${missingPeople} คน`) : `ยืนยันตัวตน ${quorum?.verified_count ?? 0} จาก ${quorum?.eligible_count ?? 0} สิทธิ์`}</small></div></li>
          <li className={isLiveMeeting && openSessions.length ? "attention" : "done"}><span>2</span><div><strong>{isLiveMeeting ? (openSessions.length ? `มี ${openSessions.length} วาระรอลงคะแนน` : "ไม่มีวาระที่ต้องลงคะแนนตอนนี้") : isUpcomingMeeting ? `เตรียมวาระแล้ว ${agendas.length} วาระ` : `สรุปผลลงคะแนนแล้ว ${closedSessions.length} วาระ`}</strong><small>{isLiveMeeting ? (openSessions[0]?.motion_text ?? `สรุปผลแล้ว ${closedSessions.length} วาระ`) : isUpcomingMeeting ? `มีวาระที่ต้องลงคะแนน ${votingAgendaCount} วาระ` : (latestClosedVote?.motion_text ?? "ไม่มีวาระลงคะแนน")}</small></div></li>
          <li className={isUpcomingMeeting ? (documents.length ? "done" : "attention") : openIncidents.length ? "attention" : "done"}><span>3</span><div><strong>{isLiveMeeting ? (openIncidents.length ? `กำลังติดตาม ${openIncidents.length} เหตุขัดข้อง` : "ระบบประชุมทำงานปกติ") : isUpcomingMeeting ? `เผยแพร่เอกสารแล้ว ${documents.length} ฉบับ` : `บันทึกเหตุขัดข้อง ${incidents.length} รายการ`}</strong><small>{isLiveMeeting ? (openIncidents[0]?.incident_type ?? "ยังไม่มีรายงานปัญหาค้างอยู่") : isUpcomingMeeting ? (documents.length ? "ผู้เข้าร่วมสามารถเปิดอ่านได้ก่อนประชุม" : "Admin ยังไม่ได้เผยแพร่เอกสาร") : (openIncidents.length ? `ยังมี ${openIncidents.length} รายการที่สถานะยังไม่ปิด` : "เหตุทั้งหมดได้รับการบันทึกหรือแก้ไขแล้ว")}</small></div></li>
        </ol>
      </article>
    </section>

    <section className="overview-main-grid overview-secondary-grid">
      <article className="panel vote-overview-panel">
        <div className="section-title"><div><span className="eyebrow">มติของที่ประชุม</span><h2>{latestClosedVote ? "ผลลงคะแนนล่าสุด" : "สถานะการลงคะแนน"}</h2></div>{latestClosedVote ? <StatusBadge tone="gray">{latestClosedVote.mode === "secret" ? "โหวตลับ" : "เปิดเผย"}</StatusBadge> : null}</div>
        {latestClosedVote ? <>
          <h3 className="vote-overview-motion">{latestClosedVote.motion_text}</h3>
          <div className="overview-vote-bars">{latestResults.map((result, index) => <div className={`overview-vote-row result-${index + 1}`} key={result.label}>
            <div><span>{result.label}</span><strong>{result.percent.toFixed(1)}%</strong></div>
            <div className="overview-bar-track"><span style={{ width: `${result.percent}%` }} /></div>
            <small>{result.ballots} บัตร · น้ำหนักเสียง {result.weight.toLocaleString("th-TH")}</small>
          </div>)}</div>
        </> : openSessions.length ? <div className="overview-vote-open"><strong>กำลังเปิดรับคะแนน</strong><p>{openSessions[0].motion_text}</p><a className="btn primary" href="/voting">ไปหน้าลงคะแนน</a></div> : <p className="overview-empty">ยังไม่มีผลลงคะแนนในการประชุมนี้</p>}
      </article>

      <article className="panel document-overview-panel">
        <div className="section-title"><div><span className="eyebrow">เอกสารสำคัญ</span><h2>อ่านก่อนพิจารณา</h2></div><a className="btn compact" href="/documents">ดูทั้งหมด</a></div>
        <div className="document-overview-list">{documents.slice(0, 4).map((document, index) => <div className="document-overview-row" key={document.id}>
          <span className="document-symbol" aria-hidden="true">{index + 1}</span>
          <div><strong>{document.title}</strong><small>{document.version}</small></div>
          <StatusBadge tone={readDocumentIds.has(document.id) ? "green" : "amber"}>{readDocumentIds.has(document.id) ? (isAdmin ? "มีการอ่านแล้ว" : "อ่านแล้ว") : "ควรอ่าน"}</StatusBadge>
        </div>)}{documents.length === 0 ? <p className="overview-empty">ยังไม่มีเอกสารเผยแพร่</p> : null}</div>
      </article>
    </section>

    <article className="panel incident-overview-panel">
      <div className="section-title"><div><span className="eyebrow">{isUpcomingMeeting ? "ความพร้อมด้านระบบ" : "สถานการณ์ระหว่างประชุม"}</span><h2>{isUpcomingMeeting ? "เหตุที่แจ้งก่อนเริ่มประชุม" : "เหตุขัดข้องและการแก้ไข"}</h2></div><a className="btn compact" href="/incidents">แจ้งเหตุหรือดูรายละเอียด</a></div>
      <div className="incident-overview-list">{incidents.slice(0, 3).map((incident) => <div className="incident-overview-row" key={incident.id}>
        <span className={`incident-dot ${["resolved", "closed"].includes(incident.status) ? "resolved" : "open"}`} />
        <div><strong>{incident.incident_type}</strong><small>{incident.detail}</small></div>
        <div><StatusBadge tone={["resolved", "closed"].includes(incident.status) ? "green" : "amber"}>{incidentLabel(incident.status)}</StatusBadge><small>{new Date(incident.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</small></div>
      </div>)}{incidents.length === 0 ? <p className="overview-empty">ยังไม่มีเหตุขัดข้องในการประชุมนี้</p> : null}</div>
    </article>
  </section>;
}
