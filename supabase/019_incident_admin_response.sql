-- Store an Admin response independently from the final resolution note.

alter table public.incident_reports
  add column if not exists admin_response text,
  add column if not exists admin_response_by uuid references public.profiles(id) on delete set null,
  add column if not exists admin_response_name text,
  add column if not exists admin_responded_at timestamptz;

select
  id,
  meeting_id,
  incident_type,
  status,
  admin_response,
  admin_response_name,
  admin_responded_at
from public.incident_reports
order by created_at desc;
