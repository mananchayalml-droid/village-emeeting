"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/AppShell";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type FieldType = "text" | "number" | "email" | "url" | "datetime-local" | "select";

type FieldDef = {
  name: string;
  label: string;
  type?: FieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
};

type TableDef = {
  name: string;
  label: string;
  description: string;
  fields: FieldDef[];
  allowInsert: boolean;
  allowDelete: boolean;
};

type DataRow = Record<string, unknown> & { id?: string | number };

const uuid = (name: string, label: string): FieldDef => ({ name, label, placeholder: "UUID", required: true });

const tableDefs: TableDef[] = [
  {
    name: "profiles", label: "Profiles", description: "สร้างจาก Supabase Auth และแก้บทบาทด้วยกระบวนการ admin", allowInsert: false, allowDelete: false,
    fields: [{ name: "full_name", label: "ชื่อ" }, { name: "email", label: "อีเมล" }, { name: "role", label: "บทบาท" }, { name: "is_active", label: "ใช้งาน" }],
  },
  {
    name: "admin_members", label: "Admin Members", description: "แต่งตั้ง admin จาก profile UUID", allowInsert: true, allowDelete: true,
    fields: [uuid("profile_id", "Profile UUID"), { name: "can_manage_all", label: "สิทธิ์เต็ม", type: "select", options: ["true", "false"] }, { name: "two_factor_confirmed", label: "ยืนยัน 2FA", type: "select", options: ["true", "false"] }],
  },
  {
    name: "lots", label: "Lots", description: "บ้าน/แปลงและน้ำหนักสิทธิออกเสียง", allowInsert: true, allowDelete: true,
    fields: [{ name: "lot_no", label: "เลขที่แปลง", required: true }, { name: "house_no", label: "บ้านเลขที่" }, { name: "owner_name", label: "เจ้าของสิทธิ", required: true }, { name: "owner_email", label: "อีเมล", type: "email" }, { name: "vote_weight", label: "น้ำหนักเสียง", type: "number" }, { name: "can_vote", label: "มีสิทธิ", type: "select", options: ["true", "false"] }],
  },
  {
    name: "meetings", label: "Meetings", description: "รอบประชุมและ Google Meet", allowInsert: true, allowDelete: true,
    fields: [{ name: "code", label: "รหัส", required: true }, { name: "title", label: "ชื่อประชุม", required: true }, { name: "scheduled_start", label: "เริ่ม", type: "datetime-local", required: true }, { name: "status", label: "สถานะ", type: "select", options: ["draft", "identity_open", "in_progress", "closed", "archived"] }, { name: "quorum_percent", label: "องค์ประชุม %", type: "number" }, { name: "google_meet_url", label: "Google Meet URL", type: "url" }],
  },
  {
    name: "meeting_eligible_voters", label: "Eligible Voters", description: "ผู้มีสิทธิในแต่ละรอบประชุม", allowInsert: true, allowDelete: true,
    fields: [uuid("meeting_id", "Meeting UUID"), uuid("lot_id", "Lot UUID"), { name: "profile_id", label: "Profile UUID" }, { name: "representative_name", label: "ผู้แทน" }, { name: "representative_email", label: "อีเมล", type: "email" }, { name: "is_proxy", label: "รับมอบฉันทะ", type: "select", options: ["false", "true"] }, { name: "vote_weight", label: "น้ำหนักเสียง", type: "number" }, { name: "identity_status", label: "แสดงตน", type: "select", options: ["pending", "verified", "rejected", "revoked"] }, { name: "verification_method", label: "วิธียืนยัน" }],
  },
  {
    name: "attendance_logs", label: "Attendance Logs", description: "หลักฐานการเข้าออก อ่านอย่างเดียว", allowInsert: false, allowDelete: false,
    fields: [{ name: "meeting_id", label: "Meeting UUID" }, { name: "profile_id", label: "Profile UUID" }, { name: "action", label: "Action" }, { name: "ip", label: "IP" }, { name: "created_at", label: "เวลา" }],
  },
  {
    name: "documents", label: "Documents", description: "ทะเบียนเอกสาร Google Drive", allowInsert: true, allowDelete: true,
    fields: [uuid("meeting_id", "Meeting UUID"), { name: "title", label: "ชื่อเอกสาร", required: true }, { name: "document_type", label: "ประเภท", required: true }, { name: "version", label: "เวอร์ชัน" }, { name: "file_url", label: "Google Drive URL", type: "url", required: true }, { name: "status", label: "สถานะ", type: "select", options: ["draft", "published", "superseded", "archived"] }],
  },
  {
    name: "document_reads", label: "Document Reads", description: "หลักฐานการเปิดอ่าน อ่านอย่างเดียว", allowInsert: false, allowDelete: false,
    fields: [{ name: "document_id", label: "Document UUID" }, { name: "profile_id", label: "Profile UUID" }, { name: "ip", label: "IP" }, { name: "read_at", label: "เวลาอ่าน" }],
  },
  {
    name: "agenda_items", label: "Agenda Items", description: "วาระการประชุม", allowInsert: true, allowDelete: true,
    fields: [uuid("meeting_id", "Meeting UUID"), { name: "agenda_no", label: "วาระที่", required: true }, { name: "title", label: "ชื่อวาระ", required: true }, { name: "description", label: "รายละเอียด" }, { name: "content_type", label: "ชนิดเนื้อหา", type: "select", options: ["image", "pdf"] }, { name: "content_url", label: "URL รูป/PDF", type: "url" }, { name: "requires_vote", label: "ลงคะแนน", type: "select", options: ["false", "true"] }, { name: "is_secret_agenda", label: "วาระลับ", type: "select", options: ["false", "true"] }, { name: "sort_order", label: "ลำดับ", type: "number" }],
  },
  {
    name: "announcements", label: "Announcements", description: "ประกาศและข่าวประชาสัมพันธ์", allowInsert: true, allowDelete: true,
    fields: [uuid("meeting_id", "Meeting UUID"), { name: "announcement_type", label: "ประเภท", type: "select", options: ["announcement", "news"] }, { name: "title", label: "หัวข้อ", required: true }, { name: "content", label: "เนื้อหา" }, { name: "attachment_type", label: "ชนิดไฟล์", type: "select", options: ["image", "pdf"] }, { name: "attachment_url", label: "URL รูป/PDF", type: "url" }, { name: "sort_order", label: "ลำดับ", type: "number" }, { name: "is_published", label: "เผยแพร่", type: "select", options: ["true", "false"] }],
  },
  {
    name: "vote_sessions", label: "Vote Sessions", description: "ตั้งค่าห้องลงคะแนน", allowInsert: true, allowDelete: true,
    fields: [uuid("meeting_id", "Meeting UUID"), uuid("agenda_item_id", "Agenda UUID"), { name: "mode", label: "ประเภท", type: "select", options: ["open", "secret"] }, { name: "status", label: "สถานะ", type: "select", options: ["draft", "open", "closed", "voided"] }, { name: "motion_text", label: "ญัตติ", required: true }, { name: "required_rule", label: "เกณฑ์มติ" }],
  },
  {
    name: "open_votes", label: "Open Votes", description: "หลักฐานคะแนนเปิดเผย อ่านอย่างเดียว", allowInsert: false, allowDelete: false,
    fields: [{ name: "vote_session_id", label: "Vote Session" }, { name: "lot_id", label: "Lot UUID" }, { name: "choice", label: "คะแนน" }, { name: "vote_weight", label: "น้ำหนัก" }, { name: "created_at", label: "เวลา" }],
  },
  {
    name: "secret_ballot_tokens", label: "Secret Ballot Tokens", description: "token คะแนนลับ อ่านอย่างเดียว", allowInsert: false, allowDelete: false,
    fields: [{ name: "vote_session_id", label: "Vote Session" }, { name: "eligible_voter_id", label: "Eligible Voter" }, { name: "token_hash", label: "Token hash" }, { name: "used_at", label: "ใช้เมื่อ" }],
  },
  {
    name: "secret_votes", label: "Secret Votes", description: "หลักฐานคะแนนลับ อ่านอย่างเดียว", allowInsert: false, allowDelete: false,
    fields: [{ name: "vote_session_id", label: "Vote Session" }, { name: "choice", label: "คะแนน" }, { name: "vote_weight", label: "น้ำหนัก" }, { name: "created_at", label: "เวลา" }],
  },
  {
    name: "incident_reports", label: "Incident Reports", description: "เหตุขัดข้อง เพิ่มได้ แต่ไม่ลบหลักฐาน", allowInsert: true, allowDelete: false,
    fields: [uuid("meeting_id", "Meeting UUID"), { name: "reporter_name", label: "ผู้แจ้ง" }, { name: "incident_type", label: "ประเภท", required: true }, { name: "detail", label: "รายละเอียด", required: true }, { name: "status", label: "สถานะ", type: "select", options: ["open", "investigating", "resolved", "closed"] }],
  },
  {
    name: "evidence_files", label: "Evidence Files", description: "หลักฐาน เพิ่มได้ แต่ไม่ลบจากหน้าเว็บ", allowInsert: true, allowDelete: false,
    fields: [uuid("meeting_id", "Meeting UUID"), { name: "evidence_type", label: "ประเภท", required: true }, { name: "title", label: "ชื่อ", required: true }, { name: "file_url", label: "URL", type: "url", required: true }, { name: "sha256", label: "SHA-256" }],
  },
  {
    name: "traffic_logs", label: "Traffic Logs", description: "ข้อมูลจราจรอิเล็กทรอนิกส์ อ่านอย่างเดียว", allowInsert: false, allowDelete: false,
    fields: [{ name: "meeting_id", label: "Meeting UUID" }, { name: "profile_id", label: "Profile UUID" }, { name: "action", label: "Action" }, { name: "ip", label: "IP" }, { name: "created_at", label: "เวลา" }],
  },
  {
    name: "admin_audit_logs", label: "Admin Audit Logs", description: "ประวัติการทำงาน admin อ่านอย่างเดียว", allowInsert: false, allowDelete: false,
    fields: [{ name: "actor_profile_id", label: "Admin UUID" }, { name: "action", label: "Action" }, { name: "target_table", label: "ตาราง" }, { name: "target_id", label: "Target UUID" }, { name: "created_at", label: "เวลา" }],
  },
];

function emptyForm(fields: FieldDef[]) {
  return Object.fromEntries(fields.map((field) => [field.name, field.options?.[0] ?? ""])) as Record<string, string>;
}

function displayValue(value: unknown) {
  if (value === null || typeof value === "undefined" || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const commonColumnLabels: Record<string, string> = {
  id: "UUID",
  created_at: "สร้างเมื่อ",
  updated_at: "แก้ไขเมื่อ",
  created_by: "ผู้สร้าง UUID",
  scheduled_end: "สิ้นสุด",
  description: "รายละเอียด",
  recording_url: "ไฟล์บันทึก",
  ballot_options: "ตัวเลือกลงคะแนน",
};

function columnLabel(table: TableDef, column: string) {
  return table.fields.find((field) => field.name === column)?.label
    ?? commonColumnLabels[column]
    ?? column.replaceAll("_", " ");
}

function isIdentifierColumn(column: string) {
  return column === "id" || column.endsWith("_id");
}

function buildPayload(fields: FieldDef[], form: Record<string, string>) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = form[field.name]?.trim() ?? "";
    if (!raw) continue;
    if (field.type === "number") payload[field.name] = Number(raw);
    else if (field.type === "datetime-local") payload[field.name] = new Date(raw).toISOString();
    else if (field.options?.every((option) => option === "true" || option === "false")) payload[field.name] = raw === "true";
    else payload[field.name] = raw;
  }
  return payload;
}

function rowToForm(fields: FieldDef[], row: DataRow) {
  return Object.fromEntries(fields.map((field) => {
    const value = row[field.name];
    if (value === null || typeof value === "undefined") return [field.name, ""];
    if (field.type === "datetime-local") {
      const date = new Date(String(value));
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      return [field.name, local];
    }
    return [field.name, String(value)];
  })) as Record<string, string>;
}

function isLockedMeetingRow(table: TableDef, row: DataRow) {
  return table.name === "meetings" && (row.status === "closed" || row.status === "archived");
}

export function DataTableManager() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [activeTableName, setActiveTableName] = useState(tableDefs[0].name);
  const activeTable = tableDefs.find((table) => table.name === activeTableName) ?? tableDefs[0];
  const [form, setForm] = useState<Record<string, string>>(() => emptyForm(activeTable.fields));
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingRow, setEditingRow] = useState<DataRow | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const formPanelRef = useRef<HTMLElement>(null);

  const displayColumns = useMemo(() => {
    const rowColumns = new Set(rows.flatMap((row) => Object.keys(row)));
    const configuredColumns = activeTable.fields.map((field) => field.name);
    const remainingColumns = Array.from(rowColumns).filter((column) => column !== "id" && !configuredColumns.includes(column)).sort();
    return Array.from(new Set(["id", ...configuredColumns, ...remainingColumns]));
  }, [activeTable.fields, rows]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("th-TH");
    if (!query) return rows;
    return rows.filter((row) => displayColumns.some((column) => displayValue(row[column]).toLocaleLowerCase("th-TH").includes(query)));
  }, [displayColumns, rows, searchQuery]);

  const loadRows = useCallback(async (table: TableDef) => {
    setLoading(true);
    setError("");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSignedIn(false);
      setIsAdmin(false);
      setRows([]);
      setLoading(false);
      return;
    }
    setSignedIn(true);
    const { data: adminAccess, error: adminCheckError } = await supabase.rpc("is_admin");
    if (adminCheckError || adminAccess !== true) {
      setIsAdmin(false);
      setRows([]);
      setError(adminCheckError?.message ?? "บัญชีนี้ยังไม่ได้รับสิทธิ์ admin");
      setLoading(false);
      return;
    }
    setIsAdmin(true);
    const { data, error: queryError } = await supabase.from(table.name).select("*").order("created_at", { ascending: false }).limit(100);
    if (queryError) {
      setError(queryError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as DataRow[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadRows(activeTable);
  }, [activeTable, loadRows]);

  function selectTable(tableName: string) {
    const nextTable = tableDefs.find((table) => table.name === tableName) ?? tableDefs[0];
    setActiveTableName(tableName);
    setForm(emptyForm(nextTable.fields));
    setEditingRow(null);
    setMessage("");
    setSearchQuery("");
  }

  function startEdit(row: DataRow) {
    setEditingRow(row);
    setForm(rowToForm(activeTable.fields, row));
    setMessage("");
    setError("");
    window.requestAnimationFrame(() => formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function cancelEdit() {
    setEditingRow(null);
    setForm(emptyForm(activeTable.fields));
  }

  async function addRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const missing = activeTable.fields.find((field) => field.required && !form[field.name]?.trim());
    if (missing) {
      setError(`กรุณากรอก ${missing.label}`);
      return;
    }
    const payload = buildPayload(activeTable.fields, form);
    const query = editingRow?.id
      ? supabase.from(activeTable.name).update(payload).eq("id", editingRow.id).select().single()
      : supabase.from(activeTable.name).insert(payload).select().single();
    const { data, error: saveError } = await query;
    if (saveError) {
      setError(saveError.message);
      return;
    }
    await supabase.from("admin_audit_logs").insert({
      action: editingRow ? "update" : "insert",
      target_table: activeTable.name,
      target_id: data?.id ?? null,
      before_data: editingRow,
      after_data: data,
    });
    setEditingRow(null);
    setForm(emptyForm(activeTable.fields));
    setMessage(editingRow ? "แก้ไขข้อมูลและบันทึก audit log สำเร็จ" : "เพิ่มข้อมูลลง Supabase สำเร็จ");
    await loadRows(activeTable);
  }

  async function deleteRow(row: DataRow) {
    if (!row.id || !window.confirm(`ยืนยันลบข้อมูลจาก ${activeTable.label}?`)) return;
    setError("");
    const { error: deleteError } = await supabase.from(activeTable.name).delete().eq("id", row.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await supabase.from("admin_audit_logs").insert({ action: "delete", target_table: activeTable.name, target_id: row.id, before_data: row });
    setMessage("ลบข้อมูลและบันทึก audit log สำเร็จ");
    await loadRows(activeTable);
  }

  return (
    <section className="data-manager">
      <section className="panel data-table-picker">
        <div className="section-title"><div><span className="eyebrow">Supabase data</span><h2>Database Tables</h2></div><StatusBadge tone="blue">{tableDefs.length} tables</StatusBadge></div>
        <div className="data-table-picker-row">
          <label>เลือกตาราง
            <select value={activeTable.name} onChange={(event) => selectTable(event.target.value)}>
              {tableDefs.map((table) => <option key={table.name} value={table.name}>{table.label} · {table.name}</option>)}
            </select>
          </label>
          <div className="data-table-summary">
            <div><strong>{activeTable.label}</strong><span>{activeTable.name}</span></div>
            <p>{activeTable.description}</p>
            <StatusBadge tone={activeTable.allowInsert ? "green" : "amber"}>{activeTable.allowInsert ? "เพิ่มและแก้ไขได้" : "อ่านอย่างเดียว"}</StatusBadge>
          </div>
        </div>
      </section>

      <div className="data-manager-content">
        {!signedIn && !loading ? (
          <section className="panel">
            <h2>ต้องเข้าสู่ระบบก่อน</h2>
            <p>Supabase RLS อนุญาตเฉพาะ admin ที่ยืนยันตัวตนแล้ว</p>
            <Link className="btn primary" href="/login">เข้าสู่ระบบด้วยอีเมล</Link>
          </section>
        ) : null}

        {signedIn && !isAdmin && !loading ? (
          <section className="panel">
            <h2>บัญชีนี้ยังไม่ใช่ Admin</h2>
            <p className="form-message error">{error || "กรุณาแต่งตั้งบัญชีนี้ใน profiles และ admin_members ก่อน"}</p>
          </section>
        ) : null}

        {signedIn && isAdmin && activeTable.allowInsert ? (
          <section className="panel data-entry-panel" ref={formPanelRef}>
            <div className="section-title"><div><h2>{editingRow ? `แก้ไข ${activeTable.label}` : activeTable.label}</h2><p className="muted">{activeTable.description}</p></div><StatusBadge>{editingRow ? "Editing" : "Supabase Live"}</StatusBadge></div>
            <form className="grid" onSubmit={addRow}>
              <div className="data-form-grid">
                {activeTable.fields.map((field) => (
                  <label key={field.name}>{field.label}{field.required ? " *" : ""}
                    {field.type === "select" ? (
                      <select value={form[field.name] ?? field.options?.[0] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))}>
                        {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input type={field.type ?? "text"} value={form[field.name] ?? ""} placeholder={field.placeholder} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />
                    )}
                  </label>
                ))}
              </div>
              <div className="row-actions">
                <button className="btn primary" type="submit">{editingRow ? "บันทึกการแก้ไข" : "เพิ่มข้อมูลใน Supabase"}</button>
                {editingRow ? <button className="btn" onClick={cancelEdit} type="button">ยกเลิก</button> : null}
              </div>
            </form>
          </section>
        ) : null}

        {signedIn && isAdmin ? (
          <section className="panel data-records-panel">
            <div className="section-title data-records-title"><div><h2>ข้อมูลใน {activeTable.label}</h2><p className="muted">แสดงข้อมูลล่าสุดสูงสุด 100 รายการ</p></div><StatusBadge tone={activeTable.allowDelete ? "green" : "amber"}>{rows.length} rows</StatusBadge></div>
            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}
            <div className="data-record-tools">
              <label>ค้นหาในตาราง
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="ค้นหาชื่อ อีเมล เลขที่บ้าน หรือสถานะ" />
              </label>
              <span className="muted">แสดง {filteredRows.length} จาก {rows.length} รายการ</span>
            </div>
            <div className="table-wrap data-table-wrap">
              <table className={`admin-data-table${activeTable.allowInsert || activeTable.allowDelete ? " has-actions" : ""}`}>
                <thead><tr>{displayColumns.map((column) => <th key={column}><span>{columnLabel(activeTable, column)}</span><small>{column}</small></th>)}{activeTable.allowInsert || activeTable.allowDelete ? <th><span>จัดการ</span><small>actions</small></th> : null}</tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={displayColumns.length + (activeTable.allowInsert || activeTable.allowDelete ? 1 : 0)}>กำลังโหลด...</td></tr> : null}
                  {!loading && filteredRows.map((row) => (
                    <tr key={String(row.id)}>{displayColumns.map((column) => <td key={column}><span className={isIdentifierColumn(column) ? "data-uuid" : undefined}>{displayValue(row[column])}</span></td>)}{activeTable.allowInsert || activeTable.allowDelete ? <td>{isLockedMeetingRow(activeTable, row) ? <span className="badge gray">ล็อกแล้ว</span> : <div className="row-actions">{activeTable.allowInsert ? <button className="btn compact" type="button" onClick={() => startEdit(row)}>แก้ไข</button> : null}{activeTable.allowDelete ? <button className="btn danger compact" type="button" onClick={() => deleteRow(row)}>ลบ</button> : null}</div>}</td> : null}</tr>
                  ))}
                  {!loading && filteredRows.length === 0 ? <tr><td className="empty-table-cell" colSpan={displayColumns.length + (activeTable.allowInsert || activeTable.allowDelete ? 1 : 0)}>{rows.length === 0 ? "ยังไม่มีข้อมูล หรือ RLS ไม่อนุญาตให้ดู" : "ไม่พบข้อมูลตามคำค้นหา"}</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
