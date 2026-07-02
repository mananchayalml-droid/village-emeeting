"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/AppShell";
import { useAuth } from "@/components/AuthGate";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type MeetingStatus = "draft" | "identity_open" | "in_progress" | "closed" | "archived";
type IdentityStatus = "pending" | "verified" | "rejected" | "revoked";
type AttendanceAction = "identity_submit" | "verified" | "join_meeting" | "leave_meeting" | "login" | "logout";

type Meeting = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  scheduled_start: string;
  scheduled_end: string | null;
  status: MeetingStatus;
  quorum_percent: number;
  google_meet_url: string | null;
  recording_url: string | null;
  created_at: string;
};

type EligibleVoter = {
  id: string;
  meeting_id: string;
  profile_id: string | null;
  representative_name: string | null;
  representative_email: string | null;
  identity_status: IdentityStatus;
};

type AttendanceLog = {
  meeting_id: string;
  profile_id: string | null;
  eligible_voter_id: string | null;
  action: AttendanceAction;
  created_at: string;
};

type AgendaReport = { id: string; agenda_no: string; title: string };
type VoteSessionReport = { id: string; meeting_id: string; agenda_item_id: string; mode: "open" | "secret"; status: "draft" | "open" | "closed" | "voided"; motion_text: string; ballot_options: string[]; created_at: string };
type OpenVoteReport = { vote_session_id: string; choice: "yes" | "no" | "abstain" | "candidate"; candidate_text: string | null; vote_weight: number };
type SecretVoteSummary = { option_label: string; ballot_count: number; vote_weight_sum: number };
const defaultVoteOptions = ["เห็นชอบ", "ไม่เห็นชอบ", "งดออกเสียง"];

function openVoteLabel(vote: OpenVoteReport) {
  if (vote.choice === "candidate") return vote.candidate_text || "ตัวเลือกอื่น";
  return vote.choice === "yes" ? "เห็นชอบ" : vote.choice === "no" ? "ไม่เห็นชอบ" : "งดออกเสียง";
}

type MeetingForm = {
  code: string;
  title: string;
  description: string;
  scheduled_start: string;
  scheduled_end: string;
  quorum_percent: string;
  google_meet_url: string;
};

const emptyForm: MeetingForm = { code: "", title: "", description: "", scheduled_start: "", scheduled_end: "", quorum_percent: "50", google_meet_url: "" };

const statusLabels: Record<MeetingStatus, string> = {
  draft: "ร่าง",
  identity_open: "เปิดแสดงตน",
  in_progress: "กำลังประชุม",
  closed: "ปิดประชุม",
  archived: "เก็บถาวร",
};

const identityLabels: Record<IdentityStatus, string> = {
  pending: "รอตรวจสิทธิ์",
  verified: "ยืนยันแล้ว",
  rejected: "ไม่ผ่านการตรวจ",
  revoked: "เพิกถอนสิทธิ์",
};

const meetingStatusPriority: Record<MeetingStatus, number> = {
  in_progress: 0,
  identity_open: 1,
  draft: 2,
  closed: 3,
  archived: 4,
};

export function MeetingsLive() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { user, isAdmin } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [eligibleVoters, setEligibleVoters] = useState<EligibleVoter[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [agendaReports, setAgendaReports] = useState<AgendaReport[]>([]);
  const [voteSessions, setVoteSessions] = useState<VoteSessionReport[]>([]);
  const [openVoteReports, setOpenVoteReports] = useState<OpenVoteReport[]>([]);
  const [secretVoteSummaries, setSecretVoteSummaries] = useState<Record<string, SecretVoteSummary[]>>({});
  const [form, setForm] = useState<MeetingForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [claimLotNo, setClaimLotNo] = useState("");
  const [meetUrlDrafts, setMeetUrlDrafts] = useState<Record<string, string>>({});
  const [recordingUrlDrafts, setRecordingUrlDrafts] = useState<Record<string, string>>({});
  const [quorumDrafts, setQuorumDrafts] = useState<Record<string, string>>({});
  const [editingQuorumMeetingId, setEditingQuorumMeetingId] = useState("");
  const [expandedPastMeetings, setExpandedPastMeetings] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function togglePastMeeting(meetingId: string) {
    setExpandedPastMeetings((current) => {
      const next = new Set(current);
      if (next.has(meetingId)) next.delete(meetingId);
      else next.add(meetingId);
      return next;
    });
  }

  const loadMeetings = useCallback(async () => {
    setError("");
    const { data, error: queryError } = await supabase
      .from("meetings")
      .select("id,code,title,description,scheduled_start,scheduled_end,status,quorum_percent,google_meet_url,recording_url,created_at")
      .order("scheduled_start", { ascending: false })
      .order("created_at", { ascending: false });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    const [{ data: eligibleRows, error: eligibleError }, { data: logRows, error: logError }, agendaResult, sessionResult] = await Promise.all([
      supabase
        .from("meeting_eligible_voters")
        .select("id,meeting_id,profile_id,representative_name,representative_email,identity_status")
        .order("created_at", { ascending: true }),
      supabase
        .from("attendance_logs")
        .select("meeting_id,profile_id,eligible_voter_id,action,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("agenda_items").select("id,agenda_no,title").order("sort_order", { ascending: true }),
      supabase.from("vote_sessions").select("id,meeting_id,agenda_item_id,mode,status,motion_text,ballot_options,created_at").order("created_at", { ascending: true }),
    ]);

    const sessionRows = (sessionResult.data ?? []) as VoteSessionReport[];
    const openSessionIds = sessionRows.filter((row) => row.mode === "open").map((row) => row.id);
    const openVoteResult = openSessionIds.length > 0
      ? await supabase.from("open_votes").select("vote_session_id,choice,candidate_text,vote_weight").in("vote_session_id", openSessionIds)
      : { data: [], error: null };
    const closedSecretSessions = sessionRows.filter((row) => row.mode === "secret" && row.status === "closed");
    const secretResults = await Promise.all(closedSecretSessions.map(async (session) => ({
      sessionId: session.id,
      result: await supabase.rpc("get_closed_secret_vote_summary", { target_vote_session_id: session.id }),
    })));
    const nextSecretSummaries: Record<string, SecretVoteSummary[]> = {};
    for (const entry of secretResults) {
      if (!entry.result.error) nextSecretSummaries[entry.sessionId] = (entry.result.data ?? []) as SecretVoteSummary[];
    }

    const nextMeetings = ((data ?? []) as Meeting[]).sort((a, b) => {
      const statusDifference = meetingStatusPriority[a.status] - meetingStatusPriority[b.status];
      if (statusDifference !== 0) return statusDifference;
      const scheduledDifference = new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime();
      if (scheduledDifference !== 0) return scheduledDifference;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setMeetings(nextMeetings);
    setMeetUrlDrafts((current) => {
      const next = { ...current };
      for (const meeting of nextMeetings) {
        if (!(meeting.id in next)) next[meeting.id] = meeting.google_meet_url ?? "";
      }
      return next;
    });
    setRecordingUrlDrafts((current) => {
      const next = { ...current };
      for (const meeting of nextMeetings) {
        if (!(meeting.id in next)) next[meeting.id] = meeting.recording_url ?? "";
      }
      return next;
    });
    setQuorumDrafts((current) => {
      const next = { ...current };
      for (const meeting of nextMeetings) {
        if (!(meeting.id in next)) next[meeting.id] = String(meeting.quorum_percent);
      }
      return next;
    });
    setEligibleVoters((eligibleRows ?? []) as EligibleVoter[]);
    setAttendanceLogs((logRows ?? []) as AttendanceLog[]);
    setAgendaReports((agendaResult.data ?? []) as AgendaReport[]);
    setVoteSessions(sessionRows);
    setOpenVoteReports((openVoteResult.data ?? []) as OpenVoteReport[]);
    setSecretVoteSummaries(nextSecretSummaries);
    if (eligibleError) setError(eligibleError.message);
    else if (logError) setError(logError.message);
    else if (agendaResult.error) setError(agendaResult.error.message);
    else if (sessionResult.error) setError(sessionResult.error.message);
    else if (openVoteResult.error) setError(openVoteResult.error.message);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  useEffect(() => {
    const channel = supabase
      .channel("meetings-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, loadMeetings)
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_eligible_voters" }, loadMeetings)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, loadMeetings)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_items" }, loadMeetings)
      .on("postgres_changes", { event: "*", schema: "public", table: "vote_sessions" }, loadMeetings)
      .on("postgres_changes", { event: "*", schema: "public", table: "open_votes" }, loadMeetings)
      .on("postgres_changes", { event: "*", schema: "public", table: "secret_votes" }, loadMeetings)
      .subscribe();
    const polling = window.setInterval(loadMeetings, 15000);
    return () => { window.clearInterval(polling); supabase.removeChannel(channel); };
  }, [loadMeetings, supabase]);

  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const payload = {
      code: form.code.trim(),
      title: form.title.trim(),
      description: form.description.trim() || null,
      scheduled_start: new Date(form.scheduled_start).toISOString(),
      scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
      quorum_percent: Number(form.quorum_percent || 50),
      google_meet_url: form.google_meet_url.trim() || null,
      status: "draft",
      created_by: user.id,
    };
    const { data, error: insertError } = await supabase.from("meetings").insert(payload).select().single();
    if (insertError) setError(insertError.message);
    else {
      await supabase.from("admin_audit_logs").insert({ actor_profile_id: user.id, action: "create_meeting", target_table: "meetings", target_id: data.id, after_data: data });
      setForm(emptyForm);
      setMessage("สร้างการประชุมใน Supabase สำเร็จ");
      await loadMeetings();
    }
    setSaving(false);
  }

  async function updateStatus(meeting: Meeting, status: MeetingStatus) {
    if (status === "closed" || status === "archived") {
      setError("กรุณาใช้แผง “ตรวจความพร้อมก่อนปิดประชุม” ด้านบน เพื่อป้องกันข้อมูลหลักฐานไม่ครบ");
      return;
    }
    setError("");
    const { error: updateError } = await supabase.from("meetings").update({ status }).eq("id", meeting.id);
    if (updateError) { setError(updateError.message); return; }
    await supabase.from("admin_audit_logs").insert({ actor_profile_id: user.id, action: "update_meeting_status", target_table: "meetings", target_id: meeting.id, before_data: { status: meeting.status }, after_data: { status } });
    await loadMeetings();
  }

  async function updateMeetUrl(meeting: Meeting) {
    const url = (meetUrlDrafts[meeting.id] ?? "").trim();
    if (url && !/^https:\/\/meet\.google\.com\/[a-z0-9-]+$/.test(url)) {
      setError("Google Meet URL ต้องอยู่ในรูปแบบ https://meet.google.com/xxx-yyyy-zzz");
      return;
    }
    setBusyId(`${meeting.id}:meet-url`);
    setError("");
    const { error: updateError } = await supabase.from("meetings").update({ google_meet_url: url || null }).eq("id", meeting.id);
    if (updateError) {
      setError(updateError.message);
      setBusyId("");
      return;
    }
    await supabase.from("admin_audit_logs").insert({
      actor_profile_id: user.id,
      action: "update_google_meet_url",
      target_table: "meetings",
      target_id: meeting.id,
      before_data: { google_meet_url: meeting.google_meet_url },
      after_data: { google_meet_url: url || null },
      user_agent: window.navigator.userAgent,
    });
    setMessage("บันทึก Google Meet URL ใหม่แล้ว");
    await loadMeetings();
    setBusyId("");
  }

  async function updateQuorum(meeting: Meeting) {
    if (meeting.status !== "draft") {
      setError("แก้ไของค์ประชุมได้เฉพาะการประชุมสถานะร่างเท่านั้น");
      return;
    }
    const quorumPercent = Number(quorumDrafts[meeting.id]);
    if (!Number.isFinite(quorumPercent) || quorumPercent < 0 || quorumPercent > 100) {
      setError("องค์ประชุมต้องเป็นตัวเลขระหว่าง 0 ถึง 100 เปอร์เซ็นต์");
      return;
    }
    setBusyId(`${meeting.id}:quorum`);
    setError("");
    setMessage("");
    const { data, error: updateError } = await supabase
      .from("meetings")
      .update({ quorum_percent: quorumPercent })
      .eq("id", meeting.id)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (updateError || !data) {
      setError(updateError?.message ?? "สถานะการประชุมเปลี่ยนแล้ว จึงไม่สามารถแก้ไของค์ประชุมได้");
      setBusyId("");
      return;
    }
    await supabase.from("admin_audit_logs").insert({
      actor_profile_id: user.id,
      action: "update_meeting_quorum",
      target_table: "meetings",
      target_id: meeting.id,
      before_data: { quorum_percent: meeting.quorum_percent },
      after_data: { quorum_percent: quorumPercent },
      user_agent: window.navigator.userAgent,
    });
    setQuorumDrafts((current) => ({ ...current, [meeting.id]: String(quorumPercent) }));
    setEditingQuorumMeetingId("");
    setMessage(`แก้ไของค์ประชุมเป็น ${quorumPercent}% แล้ว`);
    await loadMeetings();
    setBusyId("");
  }

  async function updateRecordingUrl(meeting: Meeting) {
    const url = (recordingUrlDrafts[meeting.id] ?? "").trim();
    if (url) {
      try { new URL(url); } catch { setError("ลิงก์ไฟล์บันทึกการประชุมไม่ถูกต้อง"); return; }
    }
    setBusyId(`${meeting.id}:recording-url`);
    setError("");
    const { error: updateError } = await supabase.from("meetings").update({ recording_url: url || null }).eq("id", meeting.id);
    if (updateError) { setError(updateError.message); setBusyId(""); return; }
    await supabase.from("admin_audit_logs").insert({
      actor_profile_id: user.id,
      action: "update_meeting_recording_url",
      target_table: "meetings",
      target_id: meeting.id,
      before_data: { recording_url: meeting.recording_url },
      after_data: { recording_url: url || null },
      user_agent: window.navigator.userAgent,
    });
    setMessage("บันทึกลิงก์หลักฐานวิดีโอแล้ว");
    await loadMeetings();
    setBusyId("");
  }

  async function recordAttendance(meeting: Meeting, eligible: EligibleVoter, action: "identity_submit" | "join_meeting" | "leave_meeting") {
    setBusyId(`${eligible.id}:${action}`);
    setError("");
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("ไม่พบ session กรุณาเข้าสู่ระบบใหม่");
      setBusyId("");
      return;
    }
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ meetingId: meeting.id, eligibleVoterId: eligible.id, action }),
    });
    const result = await response.json() as { error?: string; warning?: string | null };
    if (!response.ok) setError(result.error || "บันทึกการแสดงตนไม่สำเร็จ");
    else {
      const messages = {
        identity_submit: "ส่งข้อมูลแสดงตนแล้ว กรุณารอ Admin ตรวจสิทธิ์",
        join_meeting: "บันทึกเวลาเข้าประชุมแล้ว สามารถเปิด Google Meet ได้",
        leave_meeting: "บันทึกเวลาออกจากประชุมแล้ว",
      };
      setMessage(result.warning ? `${messages[action]} (traffic log: ${result.warning})` : messages[action]);
      await loadMeetings();
    }
    setBusyId("");
  }

  async function claimMeetingAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claimLotNo.trim()) return;
    setBusyId("claim-access");
    setError("");
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("ไม่พบ session กรุณาเข้าสู่ระบบใหม่");
      setBusyId("");
      return;
    }

    const response = await fetch("/api/identity/auto-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lotNo: claimLotNo.trim() }),
    });
    const result = await response.json() as { status?: string; verified_count?: number; error?: string };
    if (!response.ok) {
      setError(result.error || "ตรวจสิทธิ์อัตโนมัติไม่สำเร็จ");
    } else if (result.status === "verified" || result.status === "already_verified") {
      setMessage(result.status === "verified" ? `ยืนยันสิทธิ์สำเร็จ ${result.verified_count ?? 1} การประชุม` : "บัญชีนี้ยืนยันสิทธิ์แล้ว");
      setClaimLotNo("");
      await loadMeetings();
    } else {
      const claimMessages: Record<string, string> = {
        not_matched: "อีเมลหรือเลขที่บ้าน/แปลงไม่ตรงกับฐานลูกบ้าน",
        ambiguous_match: "พบข้อมูลซ้ำ กรุณาให้ Admin ตรวจสอบ",
        profile_conflict: "สิทธิ์นี้ผูกกับบัญชีอื่นแล้ว กรุณาให้ Admin ตรวจสอบ",
        no_active_eligible_meeting: "พบข้อมูลลูกบ้าน แต่ยังไม่มีสิทธิ์ในประชุมที่เปิดอยู่",
        missing_profile_email: "บัญชีนี้ไม่มีอีเมลใน Profile",
      };
      setError(claimMessages[result.status ?? ""] || "ยังไม่สามารถยืนยันสิทธิ์อัตโนมัติได้ กรุณาให้ Admin ตรวจสอบ");
    }
    setBusyId("");
  }

  async function reviewIdentity(eligible: EligibleVoter, status: "verified" | "rejected") {
    const submittedProfileId = attendanceLogs.find((log) => log.eligible_voter_id === eligible.id && log.action === "identity_submit" && log.profile_id)?.profile_id;
    const targetProfileId = eligible.profile_id ?? submittedProfileId;
    if (!targetProfileId) {
      setError("ผู้เข้าร่วมยังไม่ได้ Login และผูกบัญชีกับสิทธิ์นี้");
      return;
    }
    setBusyId(`${eligible.id}:${status}`);
    setError("");
    const before = { identity_status: eligible.identity_status };
    const after = {
      profile_id: targetProfileId,
      identity_status: status,
      verified_by: status === "verified" ? user.id : null,
      verified_at: status === "verified" ? new Date().toISOString() : null,
    };
    const { error: updateError } = await supabase.from("meeting_eligible_voters").update(after).eq("id", eligible.id);
    if (updateError) {
      setError(updateError.message);
      setBusyId("");
      return;
    }
    if (status === "verified") {
      await supabase.from("attendance_logs").insert({
        meeting_id: eligible.meeting_id,
        eligible_voter_id: eligible.id,
        profile_id: targetProfileId,
        action: "verified",
        user_agent: window.navigator.userAgent,
        metadata: { verified_by: user.id, source: "admin_review" },
      });
    }
    await Promise.all([
      supabase.from("traffic_logs").insert({
        meeting_id: eligible.meeting_id,
        eligible_voter_id: eligible.id,
        profile_id: user.id,
        action: `identity_${status}`,
        resource_type: "eligible_voter",
        resource_id: eligible.id,
        user_agent: window.navigator.userAgent,
        metadata: { target_profile_id: targetProfileId },
      }),
      supabase.from("admin_audit_logs").insert({
        actor_profile_id: user.id,
        action: `identity_${status}`,
        target_table: "meeting_eligible_voters",
        target_id: eligible.id,
        before_data: before,
        after_data: after,
        user_agent: window.navigator.userAgent,
      }),
    ]);
    setMessage(status === "verified" ? "ยืนยันตัวตนผู้เข้าร่วมแล้ว" : "บันทึกผลไม่ผ่านการตรวจแล้ว");
    await loadMeetings();
    setBusyId("");
  }

  async function deleteDraft(meeting: Meeting) {
    if (meeting.status !== "draft" || !window.confirm(`ยืนยันลบร่าง ${meeting.title}?`)) return;
    const { error: deleteError } = await supabase.from("meetings").delete().eq("id", meeting.id);
    if (deleteError) { setError(deleteError.message); return; }
    await supabase.from("admin_audit_logs").insert({ actor_profile_id: user.id, action: "delete_meeting_draft", target_table: "meetings", target_id: meeting.id, before_data: meeting });
    await loadMeetings();
  }

  if (loading) return <section className="panel"><h2>กำลังโหลดการประชุม...</h2></section>;

  const submittedEligibleIds = new Set(attendanceLogs.filter((log) => log.action === "identity_submit").map((log) => log.eligible_voter_id));

  return (
    <section className="grid two-column meetings-layout">
      <div className="panel">
        <div className="section-title"><h2>รายการประชุม</h2><StatusBadge tone="blue">{meetings.length} รายการ</StatusBadge></div>
        {error ? <p className="form-message error">{error}</p> : null}
        {message ? <p className="form-message success">{message}</p> : null}
        <div className="grid">
          {meetings.map((meeting) => {
            const locked = meeting.status === "closed" || meeting.status === "archived";
            const showDetails = !locked || expandedPastMeetings.has(meeting.id);
            const detailsId = `meeting-details-${meeting.id}`;
            const meetingEligible = eligibleVoters.filter((row) => row.meeting_id === meeting.id);
            const normalizedUserEmail = user.email?.trim().toLowerCase();
            const ownEligible = meetingEligible.find((row) => row.profile_id === user.id)
              ?? meetingEligible.find((row) => normalizedUserEmail && row.representative_email?.trim().toLowerCase() === normalizedUserEmail);
            const ownLogs = attendanceLogs.filter((log) => log.meeting_id === meeting.id && log.profile_id === user.id);
            const meetingVoteSessions = voteSessions.filter((session) => session.meeting_id === meeting.id);
            const submitted = ownEligible ? submittedEligibleIds.has(ownEligible.id) : false;
            const latestPresence = ownLogs.find((log) => log.action === "join_meeting" || log.action === "leave_meeting")?.action;
            const joined = latestPresence === "join_meeting";
            return (
              <article className="row-card meeting-card" key={meeting.id}>
                <div className="row-header"><div><strong>{meeting.title}</strong><span className="muted">{meeting.code}</span></div><StatusBadge tone={meeting.status === "in_progress" ? "green" : meeting.status === "draft" ? "gray" : "blue"}>{statusLabels[meeting.status]}</StatusBadge></div>
                <span>{new Date(meeting.scheduled_start).toLocaleString("th-TH")} · องค์ประชุม {meeting.quorum_percent}%</span>

                {locked ? (
                  <div className="meeting-history-toggle">
                    <button
                      aria-controls={detailsId}
                      aria-expanded={showDetails}
                      className="btn compact"
                      onClick={() => togglePastMeeting(meeting.id)}
                      type="button"
                    >
                      {showDetails ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                    </button>
                  </div>
                ) : null}

                {showDetails ? <div className="meeting-card-details" id={detailsId}>
                {ownEligible ? (
                  <div className="identity-strip">
                    <div><span className="muted">สถานะแสดงตน</span><strong>{identityLabels[ownEligible.identity_status]}</strong></div>
                    <StatusBadge tone={ownEligible.identity_status === "verified" ? "green" : ownEligible.identity_status === "rejected" ? "red" : "amber"}>{submitted && ownEligible.identity_status === "pending" ? "ส่งตรวจแล้ว" : identityLabels[ownEligible.identity_status]}</StatusBadge>
                  </div>
                ) : <p className="form-message warning">บัญชีนี้ยังไม่ผูกกับรายชื่อผู้มีสิทธิ์ในรอบประชุม จึงยังบันทึกเวลาเข้า–ออกไม่ได้</p>}

                {!ownEligible && !locked && ["identity_open", "in_progress"].includes(meeting.status) ? (
                  <form className="identity-claim inline-identity-claim" onSubmit={claimMeetingAccess}>
                    <div>
                      <h3>ยืนยันสิทธิ์ของบัญชีนี้</h3>
                      <p>กรอกบ้านเลขที่หรือเลขแปลง ระบบจะตรวจร่วมกับอีเมลที่ Login</p>
                    </div>
                    <label>บ้านเลขที่/แปลง
                      <input required value={claimLotNo} onChange={(event) => setClaimLotNo(event.target.value)} placeholder="เช่น 554/96" />
                    </label>
                    <button className="btn primary" disabled={Boolean(busyId)} type="submit">{busyId === "claim-access" ? "กำลังยืนยัน..." : "ยืนยันการแสดงตน"}</button>
                  </form>
                ) : null}

                <div className="row-actions">
                  {ownEligible && ownEligible.identity_status === "pending" && !submitted && ["identity_open", "in_progress"].includes(meeting.status) ? (
                    <button className="btn" disabled={Boolean(busyId)} onClick={() => recordAttendance(meeting, ownEligible, "identity_submit")} type="button">ส่งข้อมูลแสดงตน</button>
                  ) : null}
                  {ownEligible?.identity_status === "verified" && meeting.status === "in_progress" && !joined ? (
                    <button className="btn primary" disabled={Boolean(busyId)} onClick={() => recordAttendance(meeting, ownEligible, "join_meeting")} type="button">บันทึกเข้าประชุม</button>
                  ) : null}
                  {ownEligible?.identity_status === "verified" && meeting.status === "in_progress" && joined ? (
                    <button className="btn warn" disabled={Boolean(busyId)} onClick={() => recordAttendance(meeting, ownEligible, "leave_meeting")} type="button">บันทึกออกจากประชุม</button>
                  ) : null}
                  {meeting.google_meet_url && ownEligible?.identity_status === "verified" && joined && meeting.status === "in_progress" ? <a className="btn primary" href={meeting.google_meet_url} rel="noreferrer" target="_blank">เปิด Google Meet</a> : null}
                  {meeting.google_meet_url && ownEligible?.identity_status === "verified" && meeting.status === "in_progress" && !joined ? <span className="badge amber">บันทึกเข้าประชุมก่อนเปิด Meet</span> : null}
                  {isAdmin ? (
                    <select aria-label={`สถานะ ${meeting.title}`} disabled={locked} value={meeting.status} onChange={(event) => updateStatus(meeting, event.target.value as MeetingStatus)}>
                      {Object.entries(statusLabels).map(([value, label]) => <option disabled={value === "closed" || value === "archived"} key={value} value={value}>{value === "closed" ? `${label} (ใช้แผงด้านบน)` : label}</option>)}
                    </select>
                  ) : null}
                  {isAdmin && meeting.status === "draft" ? <button className="btn" type="button" onClick={() => setEditingQuorumMeetingId((current) => current === meeting.id ? "" : meeting.id)}>{editingQuorumMeetingId === meeting.id ? "ปิดการแก้ไข" : "แก้ไของค์ประชุม"}</button> : null}
                  {isAdmin && meeting.status === "draft" ? <button className="btn danger" type="button" onClick={() => deleteDraft(meeting)}>ลบร่าง</button> : null}
                </div>

                {isAdmin && meeting.status === "draft" && editingQuorumMeetingId === meeting.id ? (
                  <form className="quorum-editor" onSubmit={(event) => { event.preventDefault(); updateQuorum(meeting); }}>
                    <label>องค์ประชุมขั้นต่ำ (%)
                      <input min="0" max="100" step="0.01" type="number" value={quorumDrafts[meeting.id] ?? String(meeting.quorum_percent)} onChange={(event) => setQuorumDrafts((current) => ({ ...current, [meeting.id]: event.target.value }))} />
                    </label>
                    <button className="btn primary" disabled={Boolean(busyId)} type="submit">{busyId === `${meeting.id}:quorum` ? "กำลังบันทึก..." : "บันทึกองค์ประชุม"}</button>
                    <small>แก้ไขได้ก่อนเปลี่ยนสถานะเป็น “เปิดแสดงตน” เท่านั้น</small>
                  </form>
                ) : null}

                {isAdmin && !locked ? (
                  <div className="meet-link-editor">
                    <label>Google Meet URL
                      <input type="url" value={meetUrlDrafts[meeting.id] ?? ""} onChange={(event) => setMeetUrlDrafts((current) => ({ ...current, [meeting.id]: event.target.value }))} placeholder="https://meet.google.com/xxx-yyyy-zzz" />
                    </label>
                    <div className="row-actions">
                      <a className="btn compact" href="https://meet.google.com/new" rel="noreferrer" target="_blank">สร้างห้อง Meet จริง</a>
                      <button className="btn primary compact" disabled={Boolean(busyId)} onClick={() => updateMeetUrl(meeting)} type="button">บันทึกลิงก์</button>
                    </div>
                    {meeting.google_meet_url?.includes("abc-defg-hij") ? <p className="form-message warning">ลิงก์นี้เป็นข้อมูลตัวอย่างจาก seed กรุณาเปลี่ยนเป็นห้องจริง</p> : null}
                    <label>ไฟล์บันทึกการประชุมใน Google Drive
                      <input type="url" value={recordingUrlDrafts[meeting.id] ?? ""} onChange={(event) => setRecordingUrlDrafts((current) => ({ ...current, [meeting.id]: event.target.value }))} placeholder="วางลิงก์ไฟล์วิดีโอหลังอัปโหลดจากเครื่องบันทึกหน้าจอ" />
                    </label>
                    <div className="row-actions">
                      {meeting.recording_url ? <a className="btn compact" href={meeting.recording_url} rel="noreferrer" target="_blank">เปิดไฟล์บันทึก</a> : null}
                      <button className="btn primary compact" disabled={Boolean(busyId)} onClick={() => updateRecordingUrl(meeting)} type="button">บันทึกลิงก์วิดีโอ</button>
                    </div>
                  </div>
                ) : null}
                {locked ? <p className="form-message warning">การประชุมนี้ปิดและล็อกแล้ว ไม่สามารถเพิ่ม แก้ไข หรือลบข้อมูลได้</p> : null}

                {locked ? <section className="meeting-vote-report">
                  <div className="section-title"><h3>ผลการลงคะแนนในที่ประชุม</h3><StatusBadge tone="gray">{meetingVoteSessions.length} วาระ</StatusBadge></div>
                  {meetingVoteSessions.map((session) => {
                    const agenda = agendaReports.find((row) => row.id === session.agenda_item_id);
                    const isSecret = session.mode === "secret";
                    const sessionOpenVotes = openVoteReports.filter((row) => row.vote_session_id === session.id);
                    const sessionSecretSummary = secretVoteSummaries[session.id] ?? [];
                    const ballotOptions = session.ballot_options?.length ? session.ballot_options : defaultVoteOptions;
                    const results = ballotOptions.map((optionLabel, optionIndex) => {
                      if (isSecret) {
                        const summary = sessionSecretSummary.find((row) => row.option_label === optionLabel);
                        return { optionLabel, optionIndex, ballots: Number(summary?.ballot_count ?? 0), weight: Number(summary?.vote_weight_sum ?? 0), percent: 0 };
                      }
                      const rows = sessionOpenVotes.filter((row) => openVoteLabel(row) === optionLabel);
                      return { optionLabel, optionIndex, ballots: rows.length, weight: rows.reduce((sum, row) => sum + Number(row.vote_weight), 0), percent: 0 };
                    });
                    const totalWeight = results.reduce((sum, result) => sum + result.weight, 0);
                    for (const result of results) result.percent = totalWeight > 0 ? (result.weight / totalWeight) * 100 : 0;
                    return <div className="meeting-vote-result" key={session.id}>
                      <div className="meeting-vote-heading"><div><strong>วาระ {agenda?.agenda_no || "-"}: {session.motion_text}</strong><span>{isSecret ? "โหวตลับ" : "โหวตเปิดเผย"}</span></div><StatusBadge tone={session.status === "closed" ? "green" : session.status === "voided" ? "red" : "amber"}>{session.status === "closed" ? "ปิดรับคะแนน" : session.status === "voided" ? "ยกเลิก" : "ไม่เสร็จสิ้น"}</StatusBadge></div>
                      {session.status === "voided" ? <p className="muted">วาระนี้ถูกยกเลิก ไม่นำคะแนนไปรวมในมติ</p> : <div className="meeting-vote-bars">{results.map((result) => <div className={`meeting-vote-bar option-${result.optionIndex}`} key={result.optionLabel}><div><span>{result.optionLabel}</span><strong>{result.percent.toFixed(2)}%</strong></div><div className="vote-chart-track"><span style={{ width: `${result.percent}%` }} /></div><small>{result.ballots} คะแนน · น้ำหนักเสียง {result.weight.toLocaleString("th-TH")}</small></div>)}</div>}
                      {isSecret && session.status === "closed" ? <small className="secret-report-note">ไม่มีการบันทึกข้อมูลของผู้ลงคะแนน เนื่องจากเป็นการโหวตแบบลับ</small> : null}
                    </div>;
                  })}
                  {meetingVoteSessions.length === 0 ? <p className="muted">ไม่มีวาระลงคะแนนในการประชุมนี้</p> : null}
                </section> : null}

                {isAdmin && meetingEligible.length > 0 ? (
                  <div className="identity-review">
                    <div className="section-title"><h3>ตรวจการแสดงตน</h3><StatusBadge tone="gray">{meetingEligible.length} คน</StatusBadge></div>
                    {meetingEligible.map((eligible) => {
                      const hasSubmitted = submittedEligibleIds.has(eligible.id);
                      const submittedProfileId = attendanceLogs.find((log) => log.eligible_voter_id === eligible.id && log.action === "identity_submit" && log.profile_id)?.profile_id;
                      const reviewProfileId = eligible.profile_id ?? submittedProfileId;
                      return (
                        <div className="identity-person" key={eligible.id}>
                          <div><strong>{eligible.representative_name || eligible.representative_email || eligible.profile_id || "ยังไม่ผูกบัญชี"}</strong><span className="muted">{eligible.representative_email || eligible.profile_id || "ไม่มีอีเมล"}</span></div>
                          <div className="row-actions">
                            <StatusBadge tone={eligible.identity_status === "verified" ? "green" : eligible.identity_status === "rejected" ? "red" : "amber"}>{hasSubmitted && eligible.identity_status === "pending" ? "รอตรวจ" : identityLabels[eligible.identity_status]}</StatusBadge>
                            {eligible.identity_status === "pending" && reviewProfileId && !locked ? <button className="btn compact" disabled={Boolean(busyId)} onClick={() => reviewIdentity(eligible, "verified")} type="button">ยืนยัน</button> : null}
                            {eligible.identity_status === "pending" && reviewProfileId && !locked ? <button className="btn danger compact" disabled={Boolean(busyId)} onClick={() => reviewIdentity(eligible, "rejected")} type="button">ไม่ผ่าน</button> : null}
                            {eligible.identity_status === "pending" && !reviewProfileId ? <span className="badge gray">รอผู้ใช้ผูกบัญชี</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                </div> : null}
              </article>
            );
          })}
          {meetings.length === 0 ? (
            <div className="identity-claim">
              <h3>ยังไม่พบสิทธิ์ประชุม</h3>
              <p>กรอกเลขที่บ้านหรือเลขแปลงอีกครั้ง ระบบจะตรวจคู่กับอีเมลที่ Login โดยอัตโนมัติ</p>
              <form className="grid" onSubmit={claimMeetingAccess}>
                <label>เลขที่บ้าน/แปลง<input required value={claimLotNo} onChange={(event) => setClaimLotNo(event.target.value)} placeholder="เช่น 999 หรือ 554/999" /></label>
                <button className="btn primary" disabled={Boolean(busyId)} type="submit">{busyId === "claim-access" ? "กำลังตรวจสิทธิ์..." : "ตรวจสิทธิ์อีกครั้ง"}</button>
              </form>
            </div>
          ) : null}
        </div>
      </div>

      {isAdmin ? (
        <div className="panel">
          <div className="section-title"><h2>สร้างประชุมใหม่</h2><StatusBadge tone="amber">Admin</StatusBadge></div>
          <form className="grid" onSubmit={createMeeting}>
            <div className="form-grid">
              <label>รหัสประชุม *<input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="AGM-2569-001" /></label>
              <label>ชื่อประชุม *<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
              <label>วันเวลาเริ่ม *<input required type="datetime-local" value={form.scheduled_start} onChange={(event) => setForm({ ...form, scheduled_start: event.target.value })} /></label>
              <label>วันเวลาสิ้นสุด<input type="datetime-local" value={form.scheduled_end} onChange={(event) => setForm({ ...form, scheduled_end: event.target.value })} /></label>
              <label>องค์ประชุม %<input min="0" max="100" type="number" value={form.quorum_percent} onChange={(event) => setForm({ ...form, quorum_percent: event.target.value })} /></label>
              <label>Google Meet URL<input type="url" value={form.google_meet_url} onChange={(event) => setForm({ ...form, google_meet_url: event.target.value })} placeholder="https://meet.google.com/..." /></label>
            </div>
            <label>รายละเอียด<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <button className="btn primary" disabled={saving} type="submit">{saving ? "กำลังบันทึก..." : "สร้างการประชุม"}</button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
