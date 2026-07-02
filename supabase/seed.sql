-- Optional development seed data.
-- Replace auth user UUIDs with real Supabase auth.users IDs before using with authenticated accounts.

insert into public.lots (lot_no, house_no, owner_name, owner_email, owner_phone, vote_weight, can_vote)
values
  ('A-12', '12/1', 'สมชาย ใจดี', 'somchai@example.com', '0812345678', 1, true),
  ('B-07', '7/4', 'สมหญิง ใจดี', 'somying@example.com', '0899999999', 1, true),
  ('C-03', '3/8', 'วิชัย ร่มเย็น', 'wichai@example.com', '0822222222', 1, true)
on conflict (lot_no) do nothing;

insert into public.meetings (
  code,
  title,
  description,
  scheduled_start,
  scheduled_end,
  status,
  quorum_percent,
  google_meet_url,
  google_drive_folder_id
)
values (
  'AGM-2569-001',
  'ประชุมใหญ่สามัญประจำปี 2569',
  'ประชุมใหญ่สามัญนิติบุคคลหมู่บ้านจัดสรร',
  '2026-06-20 09:00:00+07',
  '2026-06-20 12:00:00+07',
  'identity_open',
  50,
  null,
  'google-drive-folder-id'
)
on conflict (code) do nothing;

insert into public.meeting_eligible_voters (meeting_id, lot_id, representative_name, representative_email, representative_phone, vote_weight, can_vote, identity_status)
select m.id, l.id, l.owner_name, l.owner_email, l.owner_phone, l.vote_weight, l.can_vote,
  case when l.lot_no in ('A-12', 'B-07') then 'verified'::public.identity_status else 'pending'::public.identity_status end
from public.meetings m
cross join public.lots l
where m.code = 'AGM-2569-001'
on conflict (meeting_id, lot_id) do nothing;

insert into public.documents (meeting_id, title, document_type, version, file_url, status, published_at)
select id, 'วาระการประชุม', 'agenda', 'v1.0', 'https://drive.google.com/file/d/example-agenda', 'published', now()
from public.meetings
where code = 'AGM-2569-001'
on conflict (meeting_id, title, version) do nothing;

insert into public.agenda_items (meeting_id, agenda_no, title, description, requires_vote, sort_order)
select id, '3', 'อนุมัติงบประมาณซ่อมถนนส่วนกลาง', 'พิจารณางบประมาณซ่อมถนนส่วนกลางประจำปี', true, 3
from public.meetings
where code = 'AGM-2569-001'
on conflict (meeting_id, agenda_no) do nothing;
