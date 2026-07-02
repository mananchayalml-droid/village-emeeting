export const decisions = {
  video: "Google Meet",
  documents: "Google Drive",
  database: "Supabase",
  admins: 5,
};

export const meetingStats = [
  { label: "ผู้แสดงตนแล้ว", value: "68/94", note: "องค์ประชุมผ่าน 72%" },
  { label: "เอกสารเปิดอ่าน", value: "154", note: "ครบ 4 ชุดเอกสาร" },
  { label: "วาระกำลังโหวต", value: "2", note: "เปิดเผย 1 ลับ 1" },
  { label: "เหตุขัดข้อง", value: "1", note: "กำลังติดตาม" },
];

export const meetings = [
  {
    id: "AGM-2569-001",
    title: "ประชุมใหญ่สามัญประจำปี 2569",
    date: "20 มิถุนายน 2569",
    time: "09:00 - 12:00",
    status: "เปิดแสดงตน",
    quorum: "72%",
  },
  {
    id: "BUDGET-2569-002",
    title: "ประชุมงบประมาณซ่อมถนนส่วนกลาง",
    date: "15 กรกฎาคม 2569",
    time: "19:00 - 20:30",
    status: "ร่าง",
    quorum: "0%",
  },
];

export const documents = [
  { name: "วาระการประชุม", version: "v1.2", reads: 68, status: "พร้อมใช้" },
  { name: "งบการเงินประจำปี", version: "v2.0", reads: 61, status: "พร้อมใช้" },
  { name: "ข้อบังคับนิติบุคคลหมู่บ้าน", version: "v1.0", reads: 54, status: "อ้างอิงองค์ประชุม" },
  { name: "ใบมอบฉันทะ", version: "v1.1", reads: 39, status: "ตรวจรับรอง" },
];

export const votes = [
  {
    agenda: "วาระ 3: อนุมัติงบประมาณซ่อมถนนส่วนกลาง",
    mode: "เปิดเผย",
    yes: 76,
    no: 18,
    abstain: 6,
    status: "กำลังโหวต",
  },
  {
    agenda: "วาระ 5: เลือกกรรมการแทนตำแหน่งว่าง",
    mode: "ลับ",
    yes: 0,
    no: 0,
    abstain: 0,
    status: "รอเปิดห้องลงคะแนน",
  },
];

export const incidents = [
  {
    reporter: "เจ้าของแปลง B-07",
    type: "เสียงขาดหาย",
    time: "09:40:12",
    status: "กำลังติดตาม",
    detail: "เสียงขาดหายช่วงประธานชี้แจงวาระ 2",
  },
  {
    reporter: "เจ้าของแปลง A-12",
    type: "เปิดเอกสารไม่ได้",
    time: "09:18:44",
    status: "แก้ไขแล้ว",
    detail: "ส่งลิงก์ Google Drive สำรองแล้ว",
  },
];

export const adminTasks = [
  "เปิด 2FA ให้ admin ทั้ง 5 คน",
  "สร้าง Supabase project และเปิด Row Level Security",
  "สร้าง Google Drive shared folder สำหรับหลักฐาน",
  "นำเข้ารายชื่อผู้มีสิทธิจาก CSV",
  "ทดสอบโหวตลับและ export หลักฐาน",
];
