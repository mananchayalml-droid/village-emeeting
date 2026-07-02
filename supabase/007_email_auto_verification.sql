-- Auto-verify an authenticated resident only when email and lot/house number match uniquely.

alter table public.meeting_eligible_voters
  add column if not exists verification_method text,
  add column if not exists verification_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_lots_owner_email_lower
on public.lots (lower(trim(owner_email)))
where owner_email is not null;

create or replace function public.auto_verify_identity_by_email_lot(
  p_lot_no text,
  p_user_agent text default null,
  p_ip inet default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
  matched_lot public.lots%rowtype;
  normalized_lot text := lower(regexp_replace(trim(coalesce(p_lot_no, '')), '[[:space:]]+', '', 'g'));
  matched_lot_count integer := 0;
  verified_count integer := 0;
  eligible_row record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into current_profile
  from public.profiles
  where id = auth.uid() and is_active = true;

  if current_profile.id is null or nullif(trim(coalesce(current_profile.email, '')), '') is null then
    return jsonb_build_object('status', 'missing_profile_email', 'verified_count', 0);
  end if;

  if normalized_lot = '' then
    return jsonb_build_object('status', 'missing_lot_no', 'verified_count', 0);
  end if;

  select count(*) into matched_lot_count
  from public.lots l
  where l.can_vote = true
    and lower(trim(coalesce(l.owner_email, ''))) = lower(trim(current_profile.email))
    and (
      lower(regexp_replace(trim(l.lot_no), '[[:space:]]+', '', 'g')) = normalized_lot
      or lower(regexp_replace(trim(coalesce(l.house_no, '')), '[[:space:]]+', '', 'g')) = normalized_lot
    );

  if matched_lot_count = 0 then
    return jsonb_build_object('status', 'not_matched', 'verified_count', 0);
  elsif matched_lot_count > 1 then
    return jsonb_build_object('status', 'ambiguous_match', 'verified_count', 0);
  end if;

  select * into matched_lot
  from public.lots l
  where l.can_vote = true
    and lower(trim(coalesce(l.owner_email, ''))) = lower(trim(current_profile.email))
    and (
      lower(regexp_replace(trim(l.lot_no), '[[:space:]]+', '', 'g')) = normalized_lot
      or lower(regexp_replace(trim(coalesce(l.house_no, '')), '[[:space:]]+', '', 'g')) = normalized_lot
    )
  limit 1;

  if exists (
    select 1
    from public.meeting_eligible_voters mev
    join public.meetings m on m.id = mev.meeting_id
    where mev.lot_id = matched_lot.id
      and m.status in ('identity_open', 'in_progress')
      and mev.profile_id is not null
      and mev.profile_id <> auth.uid()
  ) then
    return jsonb_build_object('status', 'profile_conflict', 'verified_count', 0);
  end if;

  for eligible_row in
    select mev.id, mev.meeting_id
    from public.meeting_eligible_voters mev
    join public.meetings m on m.id = mev.meeting_id
    where mev.lot_id = matched_lot.id
      and m.status in ('identity_open', 'in_progress')
      and (mev.profile_id is null or mev.profile_id = auth.uid())
      and mev.identity_status in ('pending', 'rejected')
    for update of mev
  loop
    update public.meeting_eligible_voters
    set profile_id = auth.uid(),
        representative_name = coalesce(nullif(representative_name, ''), current_profile.full_name),
        representative_email = current_profile.email,
        identity_status = 'verified',
        verified_by = null,
        verified_at = now(),
        verification_method = 'email_magic_link_lot_match',
        verification_metadata = jsonb_build_object(
          'email', lower(trim(current_profile.email)),
          'lot_no', matched_lot.lot_no,
          'matched_at', now()
        )
    where id = eligible_row.id;

    insert into public.attendance_logs (
      meeting_id, eligible_voter_id, profile_id, action, ip, user_agent, metadata
    ) values (
      eligible_row.meeting_id,
      eligible_row.id,
      auth.uid(),
      'verified',
      p_ip,
      p_user_agent,
      jsonb_build_object('method', 'email_magic_link_lot_match', 'automatic', true)
    );

    insert into public.traffic_logs (
      meeting_id, eligible_voter_id, profile_id, action, resource_type, resource_id,
      ip, user_agent, metadata
    ) values (
      eligible_row.meeting_id,
      eligible_row.id,
      auth.uid(),
      'identity_auto_verified',
      'eligible_voter',
      eligible_row.id,
      p_ip,
      p_user_agent,
      jsonb_build_object('method', 'email_magic_link_lot_match', 'lot_no', matched_lot.lot_no)
    );

    verified_count := verified_count + 1;
  end loop;

  if verified_count > 0 then
    return jsonb_build_object(
      'status', 'verified',
      'verified_count', verified_count,
      'lot_no', matched_lot.lot_no
    );
  end if;

  if exists (
    select 1
    from public.meeting_eligible_voters mev
    join public.meetings m on m.id = mev.meeting_id
    where mev.lot_id = matched_lot.id
      and mev.profile_id = auth.uid()
      and mev.identity_status = 'verified'
      and m.status in ('identity_open', 'in_progress')
  ) then
    return jsonb_build_object('status', 'already_verified', 'verified_count', 0, 'lot_no', matched_lot.lot_no);
  end if;

  return jsonb_build_object('status', 'no_active_eligible_meeting', 'verified_count', 0, 'lot_no', matched_lot.lot_no);
end;
$$;

revoke all on function public.auto_verify_identity_by_email_lot(text, text, inet) from public;
grant execute on function public.auto_verify_identity_by_email_lot(text, text, inet) to authenticated;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'auto_verify_identity_by_email_lot';
