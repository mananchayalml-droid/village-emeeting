"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/AppShell";
import { useAuth } from "@/components/AuthGate";
import { selectFocusMeeting } from "@/lib/meetings/selectFocusMeeting";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Meeting = { id: string; code: string; title: string; status: string; scheduled_start: string };
type Agenda = { id: string; agenda_no: string; title: string };
type VoteSession = { id: string; agenda_item_id: string; motion_text: string; mode: "open" | "secret"; status: "draft" | "open" | "closed" | "voided"; ballot_options: string[]; created_at: string };
type EligibleVoter = { id: string; lot_id: string; profile_id: string | null; representative_email: string | null; vote_weight: number; can_vote: boolean; identity_status: string };
type OpenVote = { id: string; vote_session_id: string; eligible_voter_id: string; choice: "yes" | "no" | "abstain" | "candidate"; candidate_text: string | null; vote_weight: number };
type VoteDetail = { house_no: string | null; lot_no: string; choice: OpenVote["choice"]; option_label: string; vote_weight: number; voted_at: string };
type SecretReceipt = { vote_session_id: string; eligible_voter_id: string; used_at: string | null };
type SecretSummary = { option_label: string; ballot_count: number; vote_weight_sum: number };
const defaultBallotOptions = ["เห็นชอบ", "ไม่เห็นชอบ", "งดออกเสียง"];
const legacyChoiceLabel: Record<"yes" | "no" | "abstain", string> = { yes: "เห็นชอบ", no: "ไม่เห็นชอบ", abstain: "งดออกเสียง" };

function voteOptionLabel(vote: Pick<OpenVote, "choice" | "candidate_text">) {
  return vote.choice === "candidate" ? vote.candidate_text || "ตัวเลือกอื่น" : legacyChoiceLabel[vote.choice];
}

export function VotingLive() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { user, isAdmin } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [sessions, setSessions] = useState<VoteSession[]>([]);
  const [votes, setVotes] = useState<OpenVote[]>([]);
  const [voteDetails, setVoteDetails] = useState<Record<string, VoteDetail[]>>({});
  const [secretReceipts, setSecretReceipts] = useState<SecretReceipt[]>([]);
  const [secretSummaries, setSecretSummaries] = useState<Record<string, SecretSummary[]>>({});
  const [eligible, setEligible] = useState<EligibleVoter | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(() => new Set());
  const [detailSearches, setDetailSearches] = useState<Record<string, string>>({});
  const [detailChoiceFilters, setDetailChoiceFilters] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ agenda_no: "1", title: "", required_rule: "majority", ballot_options: [...defaultBallotOptions] });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    const { data: meetingRows, error: meetingError } = await supabase.from("meetings").select("id,code,title,status,scheduled_start").order("scheduled_start", { ascending: false });
    if (meetingError) { setError(meetingError.message); return; }
    const rows = (meetingRows ?? []) as Meeting[];
    const current = selectFocusMeeting(rows);
    setMeeting(current);
    if (!current) { setAgendas([]); setSessions([]); setVotes([]); return; }
    const [agendaResult, sessionResult, eligibleResult] = await Promise.all([
      supabase.from("agenda_items").select("id,agenda_no,title").eq("meeting_id", current.id).order("sort_order", { ascending: true }),
      supabase.from("vote_sessions").select("id,agenda_item_id,motion_text,mode,status,ballot_options,created_at").eq("meeting_id", current.id).order("created_at", { ascending: false }),
      supabase.from("meeting_eligible_voters").select("id,lot_id,profile_id,representative_email,vote_weight,can_vote,identity_status").eq("meeting_id", current.id),
    ]);
    if (agendaResult.error) setError(agendaResult.error.message);
    else if (sessionResult.error) setError(sessionResult.error.message);
    const nextSessions = (sessionResult.data ?? []) as VoteSession[];
    let voteRows: OpenVote[] = [];
    const openSessionIds = nextSessions.filter((row) => row.mode === "open").map((row) => row.id);
    if (openSessionIds.length > 0) {
      const voteResult = await supabase.from("open_votes").select("id,vote_session_id,eligible_voter_id,choice,candidate_text,vote_weight").in("vote_session_id", openSessionIds);
      if (voteResult.error) setError(voteResult.error.message);
      else voteRows = (voteResult.data ?? []) as OpenVote[];
    }
    let receiptRows: SecretReceipt[] = [];
    const secretSessionIds = nextSessions.filter((row) => row.mode === "secret").map((row) => row.id);
    if (secretSessionIds.length > 0) {
      const receiptResult = await supabase.from("secret_ballot_tokens").select("vote_session_id,eligible_voter_id,used_at").in("vote_session_id", secretSessionIds);
      if (receiptResult.error) setError(receiptResult.error.message);
      else receiptRows = (receiptResult.data ?? []) as SecretReceipt[];
    }
    const closedOpenSessions = nextSessions.filter((row) => row.mode === "open" && row.status === "closed");
    const detailResults = await Promise.all(closedOpenSessions.map(async (session) => ({
      sessionId: session.id,
      result: await supabase.rpc("get_closed_open_vote_details", { target_vote_session_id: session.id }),
    })));
    const nextVoteDetails: Record<string, VoteDetail[]> = {};
    for (const entry of detailResults) {
      if (!entry.result.error) nextVoteDetails[entry.sessionId] = (entry.result.data ?? []) as VoteDetail[];
    }
    const closedSecretSessions = nextSessions.filter((row) => row.mode === "secret" && row.status === "closed");
    const secretResultEntries = await Promise.all(closedSecretSessions.map(async (session) => ({
      sessionId: session.id,
      result: await supabase.rpc("get_closed_secret_vote_summary", { target_vote_session_id: session.id }),
    })));
    const nextSecretSummaries: Record<string, SecretSummary[]> = {};
    for (const entry of secretResultEntries) {
      if (!entry.result.error) nextSecretSummaries[entry.sessionId] = (entry.result.data ?? []) as SecretSummary[];
    }
    setAgendas((agendaResult.data ?? []) as Agenda[]);
    setSessions(nextSessions);
    setVotes(voteRows);
    setVoteDetails(nextVoteDetails);
    setSecretReceipts(receiptRows);
    setSecretSummaries(nextSecretSummaries);
    const eligibleRows = (eligibleResult.data ?? []) as EligibleVoter[];
    const normalizedEmail = user.email?.trim().toLowerCase();
    setEligible(eligibleRows.find((row) => row.profile_id === user.id)
      ?? eligibleRows.find((row) => normalizedEmail && row.representative_email?.trim().toLowerCase() === normalizedEmail)
      ?? null);
  }, [supabase, user.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel("voting-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_items" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vote_sessions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "open_votes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "secret_ballot_tokens" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "secret_votes" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, supabase]);

  async function openVote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const mode: VoteSession["mode"] = submitter?.value === "secret" ? "secret" : "open";
    if (!meeting || meeting.status !== "in_progress") { setError("ต้องตั้งสถานะการประชุมเป็น กำลังประชุม ก่อนเปิดโหวต"); return; }
    const ballotOptions = form.ballot_options.map((option) => option.trim()).filter(Boolean);
    if (ballotOptions.length < 2) { setError("กรุณาระบุตัวเลือกอย่างน้อย 2 ตัวเลือก"); return; }
    if (new Set(ballotOptions).size !== ballotOptions.length) { setError("ข้อความตัวเลือกต้องไม่ซ้ำกัน"); return; }
    setBusy("create"); setError(""); setMessage("");
    const existingAgenda = agendas.find((row) => row.agenda_no === form.agenda_no.trim());
    let agendaId = existingAgenda?.id ?? "";
    let createdAgenda = false;
    if (!agendaId) {
      const { data: agenda, error: agendaError } = await supabase.from("agenda_items").insert({ meeting_id: meeting.id, agenda_no: form.agenda_no.trim(), title: form.title.trim(), requires_vote: true, is_secret_agenda: mode === "secret", sort_order: Number(form.agenda_no) || agendas.length + 1 }).select("id").single();
      if (agendaError) { setError(agendaError.message); setBusy(""); return; }
      agendaId = agenda.id;
      createdAgenda = true;
    }
    const { error: sessionError } = await supabase.from("vote_sessions").insert({ meeting_id: meeting.id, agenda_item_id: agendaId, mode, status: "open", motion_text: form.title.trim(), required_rule: form.required_rule, ballot_options: ballotOptions, opened_by: user.id, opened_at: new Date().toISOString() });
    if (sessionError) { if (createdAgenda) await supabase.from("agenda_items").delete().eq("id", agendaId); setError(sessionError.message); }
    else { setForm({ ...form, agenda_no: String((Number(form.agenda_no) || agendas.length) + 1), title: "", ballot_options: [...defaultBallotOptions] }); setMessage(mode === "secret" ? "เปิดโหวตลับแล้ว บัตรลงคะแนนจะไม่บันทึกบ้านหรือผู้ใช้" : "เปิดโหวตแบบเปิดเผยแล้ว ผู้มีสิทธิ์จะเห็นตัวเลือกทันที"); await load(); }
    setBusy("");
  }

  async function castVote(session: VoteSession, optionLabel: string) {
    if (!eligible || !eligible.can_vote || eligible.identity_status !== "verified") { setError("บัญชีนี้ยังไม่ผ่านการยืนยันสิทธิ์ลงคะแนน"); return; }
    setBusy(session.id); setError(""); setMessage("");
    const { error: voteError } = await supabase.from("open_votes").insert({ vote_session_id: session.id, eligible_voter_id: eligible.id, lot_id: eligible.lot_id, profile_id: user.id, choice: "candidate", candidate_text: optionLabel, vote_weight: eligible.vote_weight, user_agent: window.navigator.userAgent });
    if (voteError) setError(voteError.code === "23505" ? "คุณลงคะแนนในวาระนี้แล้ว" : voteError.message);
    else { setMessage(`บันทึกคะแนน “${optionLabel}” แล้ว`); await load(); }
    setBusy("");
  }

  async function castSecretVote(session: VoteSession, optionLabel: string) {
    if (!eligible || !eligible.can_vote || eligible.identity_status !== "verified") { setError("บัญชีนี้ยังไม่ผ่านการยืนยันสิทธิ์ลงคะแนน"); return; }
    setBusy(session.id); setError(""); setMessage("");
    const { data, error: voteError } = await supabase.rpc("cast_anonymous_secret_vote", {
      target_vote_session_id: session.id,
      target_eligible_voter_id: eligible.id,
      selected_option: optionLabel,
    });
    if (voteError) setError(voteError.message.includes("cast_anonymous_secret_vote") ? "กรุณารัน 013_anonymous_secret_ballot.sql ใน Supabase ก่อน" : voteError.message);
    else if ((data as { status?: string } | null)?.status === "already_voted") setError("คุณใช้สิทธิ์ในวาระลับนี้แล้ว");
    else { setMessage(""); await load(); }
    setBusy("");
  }

  function updateBallotOption(index: number, value: string) {
    setForm((current) => ({ ...current, ballot_options: current.ballot_options.map((option, optionIndex) => optionIndex === index ? value : option) }));
  }

  function addBallotOption() {
    setForm((current) => current.ballot_options.length >= 20 ? current : ({ ...current, ballot_options: [...current.ballot_options, ""] }));
  }

  function removeBallotOption(index: number) {
    setForm((current) => current.ballot_options.length <= 2 ? current : ({ ...current, ballot_options: current.ballot_options.filter((_, optionIndex) => optionIndex !== index) }));
  }

  async function closeVote(session: VoteSession) {
    setBusy(session.id); setError("");
    const { error: closeError } = await supabase.from("vote_sessions").update({ status: "closed", closed_by: user.id, closed_at: new Date().toISOString() }).eq("id", session.id);
    if (closeError) setError(closeError.message);
    else { setMessage("ปิดรับคะแนนแล้ว ผลคะแนนถูกเก็บไว้ใน Supabase"); await load(); }
    setBusy("");
  }

  function toggleVoteDetails(sessionId: string) {
    setExpandedDetails((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  if (!meeting) return <section className="panel"><h2>ยังไม่มีการประชุมที่เข้าถึงได้</h2></section>;
  return <section className="grid two-column">
    <div className="panel"><div className="section-title"><div><h2>วาระลงคะแนน</h2><span className="muted">{meeting.code} · {meeting.title}</span></div><StatusBadge tone="green">{sessions.filter((row) => row.status === "open").length} วาระเปิด</StatusBadge></div>
      {error ? <p className="form-message error">{error}</p> : null}{message ? <p className="form-message success">{message}</p> : null}
      <div className="grid">{sessions.map((session) => {
        const agenda = agendas.find((row) => row.id === session.agenda_item_id);
        const isSecret = session.mode === "secret";
        const sessionVotes = votes.filter((row) => row.vote_session_id === session.id);
        const ownOpenVote = !isSecret && eligible ? sessionVotes.find((row) => row.eligible_voter_id === eligible.id) : null;
        const ownSecretReceipt = isSecret && eligible ? secretReceipts.find((row) => row.vote_session_id === session.id && row.eligible_voter_id === eligible.id) : null;
        const secretSummary = secretSummaries[session.id] ?? [];
        const ballotOptions = session.ballot_options?.length ? session.ballot_options : defaultBallotOptions;
        const resultRows = ballotOptions.map((optionLabel, optionIndex) => {
          if (isSecret) {
            const summary = secretSummary.find((row) => row.option_label === optionLabel);
            return { optionLabel, optionIndex, ballots: Number(summary?.ballot_count ?? 0), weight: Number(summary?.vote_weight_sum ?? 0), percent: 0 };
          }
          const choiceVotes = sessionVotes.filter((row) => voteOptionLabel(row) === optionLabel);
          const weight = choiceVotes.reduce((sum, row) => sum + Number(row.vote_weight), 0);
          return { optionLabel, optionIndex, ballots: choiceVotes.length, weight, percent: 0 };
        });
        const totalWeight = resultRows.reduce((sum, row) => sum + row.weight, 0);
        for (const result of resultRows) result.percent = totalWeight > 0 ? (result.weight / totalWeight) * 100 : 0;
        const sessionDetails = voteDetails[session.id] ?? [];
        const detailSearch = (detailSearches[session.id] ?? "").trim().toLowerCase();
        const detailChoiceFilter = detailChoiceFilters[session.id] ?? "all";
        const filteredDetails = sessionDetails.filter((detail) => {
          const matchesChoice = detailChoiceFilter === "all" || detail.option_label === detailChoiceFilter;
          const matchesSearch = !detailSearch
            || detail.house_no?.toLowerCase().includes(detailSearch)
            || detail.lot_no.toLowerCase().includes(detailSearch);
          return matchesChoice && matchesSearch;
        });
        return <article className="row-card vote-card" key={session.id}><div className="row-header"><div><strong>วาระ {agenda?.agenda_no || "-"}: {session.motion_text}</strong><span className="muted">{isSecret ? "ลงคะแนนลับ ไม่ผูกบัตรกับบ้านเลขที่" : "ลงคะแนนเปิดเผย"}</span></div><StatusBadge tone={session.status === "open" ? (isSecret ? "blue" : "green") : "gray"}>{session.status === "open" ? "กำลังเปิดรับคะแนน" : "ปิดรับคะแนน"}</StatusBadge></div>
          {isSecret && ownSecretReceipt?.used_at ? <p className="form-message success">บันทึกการลงคะแนนลับแล้ว ไม่มีการเปิดเผยข้อมูลผู้ลงคะแนน</p> : ownOpenVote ? <p className="form-message success">คุณลงคะแนน: {voteOptionLabel(ownOpenVote)}</p> : session.status === "open" && eligible ? <div className="vote-choices dynamic">{ballotOptions.map((option, optionIndex) => <button className={`btn ${optionIndex === 0 ? "primary" : optionIndex === 1 ? "danger" : ""}`} disabled={Boolean(busy)} key={option} onClick={() => isSecret ? castSecretVote(session, option) : castVote(session, option)} type="button">{option}</button>)}</div> : session.status === "open" ? <p className="form-message warning">บัญชีนี้ยังไม่ผูกกับสิทธิ์ลงคะแนนของการประชุม</p> : null}
          {isAdmin && session.status === "open" ? <div className="vote-results">{isSecret ? <span>ผลคะแนนถูกซ่อนจนกว่าจะปิดรับคะแนน</span> : ballotOptions.map((option) => <span key={option}>{option} {sessionVotes.filter((row) => voteOptionLabel(row) === option).length}</span>)}<button className="btn compact" disabled={Boolean(busy)} onClick={() => closeVote(session)} type="button">ปิดรับคะแนน</button></div> : null}
          {session.status === "closed" ? <div className="vote-chart" aria-label="กราฟผลคะแนน">
            <div className="vote-chart-summary"><strong>ผลการลงคะแนน</strong><span>น้ำหนักเสียงรวม {totalWeight.toLocaleString("th-TH")}</span></div>
            {resultRows.map((result) => <div className={`vote-chart-row option-${result.optionIndex}`} key={result.optionLabel}>
              <div><span>{result.optionLabel}</span><strong>{result.percent.toFixed(2)}%</strong></div>
              <div className="vote-chart-track"><span style={{ width: `${result.percent}%` }} /></div>
              <small>{result.ballots} คะแนน · น้ำหนักเสียง {result.weight.toLocaleString("th-TH")}</small>
            </div>)}
            {!isSecret ? <button aria-controls={`vote-details-${session.id}`} aria-expanded={expandedDetails.has(session.id)} className="btn compact vote-detail-toggle" onClick={() => toggleVoteDetails(session.id)} type="button">{expandedDetails.has(session.id) ? "ซ่อนบ้านเลขที่ผู้ลงคะแนน" : "ดูบ้านเลขที่ผู้ลงคะแนน"}</button> : <p className="secret-result-note">ไม่มีการบันทึกข้อมูลของผู้ลงคะแนน เนื่องจากเป็นการโหวตแบบลับ</p>}
            {!isSecret && expandedDetails.has(session.id) ? <div className="vote-detail-table-panel" id={`vote-details-${session.id}`}>
              <div className="vote-detail-tools">
                <label>ค้นหาบ้าน/แปลง
                  <input type="search" value={detailSearches[session.id] ?? ""} onChange={(event) => setDetailSearches((current) => ({ ...current, [session.id]: event.target.value }))} placeholder="เช่น 554/96 หรือ 999" />
                </label>
                <label>ผลโหวต
                  <select value={detailChoiceFilter} onChange={(event) => setDetailChoiceFilters((current) => ({ ...current, [session.id]: event.target.value }))}>
                    <option value="all">ทั้งหมด</option>
                    {ballotOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <span className="badge gray">แสดง {filteredDetails.length} จาก {sessionDetails.length} หลัง</span>
              </div>
              <div className="table-wrap vote-detail-table-wrap">
                <table className="vote-detail-table">
                  <thead><tr><th>ลำดับ</th><th>บ้านเลขที่</th><th>เลขแปลง</th><th>ผลโหวต</th><th>น้ำหนักเสียง</th></tr></thead>
                  <tbody>
                    {filteredDetails.map((detail, index) => <tr key={`${detail.lot_no}-${detail.voted_at}`}>
                      <td>{index + 1}</td>
                      <td><strong>{detail.house_no || "-"}</strong></td>
                      <td>{detail.lot_no}</td>
                      <td><StatusBadge tone={ballotOptions.indexOf(detail.option_label) === 0 ? "green" : ballotOptions.indexOf(detail.option_label) === 1 ? "red" : "amber"}>{detail.option_label}</StatusBadge></td>
                      <td>{Number(detail.vote_weight).toLocaleString("th-TH")}</td>
                    </tr>)}
                    {filteredDetails.length === 0 ? <tr><td className="empty-table-cell" colSpan={5}>ไม่พบข้อมูลตามเงื่อนไข</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div> : null}
          </div> : null}
        </article>;
      })}{sessions.length === 0 ? <p className="muted">Admin ยังไม่ได้เปิดวาระลงคะแนน</p> : null}</div>
    </div>
    {isAdmin ? <div className="panel"><div className="section-title"><h2>เปิดวาระใหม่</h2><StatusBadge tone="amber">Admin</StatusBadge></div><form className="grid" onSubmit={openVote}><label>เลขวาระ *<input required value={form.agenda_no} onChange={(event) => setForm({ ...form, agenda_no: event.target.value })} /></label><label>ญัตติหรือเรื่องที่ลงคะแนน *<textarea required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><fieldset className="ballot-options-editor"><legend>ตัวเลือกลงคะแนน</legend>{form.ballot_options.map((option, index) => <div className="ballot-option-row" key={index}><label>ตัวเลือก {index + 1}<input required value={option} onChange={(event) => updateBallotOption(index, event.target.value)} placeholder={`ระบุตัวเลือก ${index + 1}`} /></label><button aria-label={`ลบตัวเลือก ${index + 1}`} className="btn compact ballot-option-remove" disabled={form.ballot_options.length <= 2} onClick={() => removeBallotOption(index)} title="ลบตัวเลือก" type="button">×</button></div>)}<button className="btn compact" disabled={form.ballot_options.length >= 20} onClick={addBallotOption} type="button">+ เพิ่มตัวเลือก</button></fieldset><label>เกณฑ์มติ<select value={form.required_rule} onChange={(event) => setForm({ ...form, required_rule: event.target.value })}><option value="majority">เสียงข้างมาก</option><option value="half">ไม่น้อยกว่ากึ่งหนึ่ง</option><option value="bylaws">ตามข้อบังคับเฉพาะ</option></select></label><div className="vote-open-actions"><button className="btn primary" disabled={Boolean(busy)} name="mode" type="submit" value="open">{busy === "create" ? "กำลังเปิด..." : "เปิดโหวตแบบเปิดเผย"}</button><button className="btn secret-vote-button" disabled={Boolean(busy)} name="mode" type="submit" value="secret">{busy === "create" ? "กำลังเปิด..." : "เปิดโหวตแบบลับ"}</button></div>{meeting.status !== "in_progress" ? <p className="form-message warning">ต้องตั้งสถานะการประชุมเป็น “กำลังประชุม” ก่อนเปิดโหวต</p> : null}</form></div> : null}
  </section>;
}
