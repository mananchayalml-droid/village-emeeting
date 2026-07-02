-- Custom ballot options for open and anonymous secret voting.

begin;

alter table public.vote_sessions
  add column if not exists ballot_options jsonb not null
  default '["เห็นชอบ", "ไม่เห็นชอบ", "งดออกเสียง"]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vote_sessions_ballot_options_valid'
      and conrelid = 'public.vote_sessions'::regclass
  ) then
    alter table public.vote_sessions
      add constraint vote_sessions_ballot_options_valid check (
        jsonb_typeof(ballot_options) = 'array'
        and jsonb_array_length(ballot_options) between 2 and 20
      );
  end if;
end;
$$;

drop policy if exists "open votes participant insert own" on public.open_votes;

create policy "open votes verified participant valid option insert"
on public.open_votes for insert
with check (
  exists (
    select 1
    from public.meeting_eligible_voters mev
    join public.vote_sessions vs
      on vs.id = vote_session_id
     and vs.meeting_id = mev.meeting_id
    join public.meetings m on m.id = vs.meeting_id
    where mev.id = eligible_voter_id
      and mev.profile_id = auth.uid()
      and mev.can_vote = true
      and mev.identity_status = 'verified'
      and vs.mode = 'open'
      and vs.status = 'open'
      and m.status = 'in_progress'
      and (
        (
          choice = 'candidate'
          and nullif(trim(candidate_text), '') is not null
          and exists (
            select 1
            from jsonb_array_elements_text(vs.ballot_options) option_row(value)
            where option_row.value = candidate_text
          )
        )
        or (
          choice in ('yes', 'no', 'abstain')
          and candidate_text is null
        )
      )
  )
);

drop function if exists public.cast_anonymous_secret_vote(uuid, uuid, public.vote_choice);

create function public.cast_anonymous_secret_vote(
  target_vote_session_id uuid,
  target_eligible_voter_id uuid,
  selected_option text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_meeting_id uuid;
  target_options jsonb;
  ballot_timestamp timestamptz;
  voter public.meeting_eligible_voters%rowtype;
  receipt public.secret_ballot_tokens%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select vs.meeting_id, vs.ballot_options, coalesce(vs.opened_at, now())
  into target_meeting_id, target_options, ballot_timestamp
  from public.vote_sessions vs
  join public.meetings m on m.id = vs.meeting_id
  where vs.id = target_vote_session_id
    and vs.mode = 'secret'
    and vs.status = 'open'
    and m.status = 'in_progress';

  if target_meeting_id is null then
    raise exception 'Secret voting is not open' using errcode = '55000';
  end if;

  if nullif(trim(selected_option), '') is null or not exists (
    select 1
    from jsonb_array_elements_text(target_options) option_row(value)
    where option_row.value = selected_option
  ) then
    raise exception 'Invalid ballot option' using errcode = '22023';
  end if;

  select * into voter
  from public.meeting_eligible_voters mev
  where mev.id = target_eligible_voter_id
    and mev.meeting_id = target_meeting_id
    and mev.profile_id = auth.uid()
    and mev.can_vote = true
    and mev.identity_status = 'verified';

  if voter.id is null then
    raise exception 'No verified voting right was found for this account' using errcode = '42501';
  end if;

  insert into public.secret_ballot_tokens (vote_session_id, eligible_voter_id, token_hash)
  values (target_vote_session_id, voter.id, gen_random_uuid()::text)
  on conflict (vote_session_id, eligible_voter_id) do nothing;

  select * into receipt
  from public.secret_ballot_tokens sbt
  where sbt.vote_session_id = target_vote_session_id
    and sbt.eligible_voter_id = voter.id
  for update;

  if receipt.used_at is not null then
    return jsonb_build_object('status', 'already_voted');
  end if;

  update public.secret_ballot_tokens set used_at = now() where id = receipt.id;

  insert into public.secret_votes (
    vote_session_id,
    ballot_token_hash,
    choice,
    candidate_text,
    vote_weight,
    ip,
    user_agent,
    created_at
  ) values (
    target_vote_session_id,
    gen_random_uuid()::text,
    'candidate'::public.vote_choice,
    selected_option,
    voter.vote_weight,
    null,
    null,
    ballot_timestamp
  );

  return jsonb_build_object('status', 'recorded');
end;
$$;

drop function if exists public.get_closed_secret_vote_summary(uuid);

create function public.get_closed_secret_vote_summary(target_vote_session_id uuid)
returns table (
  option_label text,
  ballot_count bigint,
  vote_weight_sum numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_meeting_id uuid;
begin
  select vs.meeting_id into target_meeting_id
  from public.vote_sessions vs
  where vs.id = target_vote_session_id
    and vs.mode = 'secret'
    and vs.status = 'closed';

  if target_meeting_id is null then
    raise exception 'Secret vote results are available only after voting closes.' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.is_meeting_participant(target_meeting_id) then
    raise exception 'You are not allowed to view these results.' using errcode = '42501';
  end if;

  return query
  select
    coalesce(nullif(sv.candidate_text, ''), case sv.choice
      when 'yes' then 'เห็นชอบ'
      when 'no' then 'ไม่เห็นชอบ'
      when 'abstain' then 'งดออกเสียง'
      else 'ตัวเลือกอื่น'
    end) as option_label,
    count(*)::bigint,
    coalesce(sum(sv.vote_weight), 0)::numeric
  from public.secret_votes sv
  where sv.vote_session_id = target_vote_session_id
  group by 1
  order by 1;
end;
$$;

drop function if exists public.get_closed_open_vote_details(uuid);

create function public.get_closed_open_vote_details(target_vote_session_id uuid)
returns table (
  house_no text,
  lot_no text,
  choice public.vote_choice,
  option_label text,
  vote_weight numeric,
  voted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_meeting_id uuid;
begin
  select vs.meeting_id into target_meeting_id
  from public.vote_sessions vs
  where vs.id = target_vote_session_id
    and vs.mode = 'open'
    and vs.status = 'closed';

  if target_meeting_id is null then
    raise exception 'Open vote results are available only after voting closes.' using errcode = '42501';
  end if;
  if not public.is_admin() and not public.is_meeting_participant(target_meeting_id) then
    raise exception 'You are not allowed to view these vote details.' using errcode = '42501';
  end if;

  return query
  select
    l.house_no,
    l.lot_no,
    ov.choice,
    coalesce(nullif(ov.candidate_text, ''), case ov.choice
      when 'yes' then 'เห็นชอบ'
      when 'no' then 'ไม่เห็นชอบ'
      when 'abstain' then 'งดออกเสียง'
      else 'ตัวเลือกอื่น'
    end) as option_label,
    ov.vote_weight,
    ov.created_at
  from public.open_votes ov
  join public.lots l on l.id = ov.lot_id
  where ov.vote_session_id = target_vote_session_id
  order by 4, l.house_no nulls last, l.lot_no;
end;
$$;

revoke all on function public.cast_anonymous_secret_vote(uuid, uuid, text) from public;
revoke all on function public.cast_anonymous_secret_vote(uuid, uuid, text) from anon;
grant execute on function public.cast_anonymous_secret_vote(uuid, uuid, text) to authenticated;

revoke all on function public.get_closed_secret_vote_summary(uuid) from public;
revoke all on function public.get_closed_secret_vote_summary(uuid) from anon;
grant execute on function public.get_closed_secret_vote_summary(uuid) to authenticated;

revoke all on function public.get_closed_open_vote_details(uuid) from public;
revoke all on function public.get_closed_open_vote_details(uuid) from anon;
grant execute on function public.get_closed_open_vote_details(uuid) to authenticated;

commit;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vote_sessions'
  and column_name = 'ballot_options';
