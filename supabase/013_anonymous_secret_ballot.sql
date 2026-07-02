-- Anonymous secret ballot workflow.
-- A participation token prevents duplicate voting but is not stored on the ballot.

begin;

alter table public.secret_votes
  drop constraint if exists secret_votes_ballot_token_hash_fkey;

drop policy if exists "secret votes participants insert" on public.secret_votes;

create or replace function public.cast_anonymous_secret_vote(
  target_vote_session_id uuid,
  target_eligible_voter_id uuid,
  selected_choice public.vote_choice
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_meeting_id uuid;
  ballot_timestamp timestamptz;
  voter public.meeting_eligible_voters%rowtype;
  receipt public.secret_ballot_tokens%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if selected_choice not in ('yes', 'no', 'abstain') then
    raise exception 'Invalid secret ballot choice' using errcode = '22023';
  end if;

  select vs.meeting_id, coalesce(vs.opened_at, now())
  into target_meeting_id, ballot_timestamp
  from public.vote_sessions vs
  join public.meetings m on m.id = vs.meeting_id
  where vs.id = target_vote_session_id
    and vs.mode = 'secret'
    and vs.status = 'open'
    and m.status = 'in_progress';

  if target_meeting_id is null then
    raise exception 'Secret voting is not open' using errcode = '55000';
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

  insert into public.secret_ballot_tokens (
    vote_session_id,
    eligible_voter_id,
    token_hash
  ) values (
    target_vote_session_id,
    voter.id,
    gen_random_uuid()::text
  )
  on conflict (vote_session_id, eligible_voter_id) do nothing;

  select * into receipt
  from public.secret_ballot_tokens sbt
  where sbt.vote_session_id = target_vote_session_id
    and sbt.eligible_voter_id = voter.id
  for update;

  if receipt.used_at is not null then
    return jsonb_build_object('status', 'already_voted');
  end if;

  update public.secret_ballot_tokens
  set used_at = now()
  where id = receipt.id;

  insert into public.secret_votes (
    vote_session_id,
    ballot_token_hash,
    choice,
    vote_weight,
    ip,
    user_agent,
    created_at
  ) values (
    target_vote_session_id,
    gen_random_uuid()::text,
    selected_choice,
    voter.vote_weight,
    null,
    null,
    ballot_timestamp
  );

  return jsonb_build_object('status', 'recorded');
end;
$$;

create or replace function public.get_closed_secret_vote_summary(target_vote_session_id uuid)
returns table (
  choice public.vote_choice,
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
  select vs.meeting_id
  into target_meeting_id
  from public.vote_sessions vs
  where vs.id = target_vote_session_id
    and vs.mode = 'secret'
    and vs.status = 'closed';

  if target_meeting_id is null then
    raise exception 'Secret vote results are available only after voting closes.'
      using errcode = '42501';
  end if;

  if not public.is_admin() and not public.is_meeting_participant(target_meeting_id) then
    raise exception 'You are not allowed to view these results.'
      using errcode = '42501';
  end if;

  return query
  select
    sv.choice,
    count(*)::bigint,
    coalesce(sum(sv.vote_weight), 0)::numeric
  from public.secret_votes sv
  where sv.vote_session_id = target_vote_session_id
  group by sv.choice
  order by sv.choice;
end;
$$;

revoke all on function public.cast_anonymous_secret_vote(uuid, uuid, public.vote_choice) from public;
revoke all on function public.cast_anonymous_secret_vote(uuid, uuid, public.vote_choice) from anon;
grant execute on function public.cast_anonymous_secret_vote(uuid, uuid, public.vote_choice) to authenticated;

revoke all on function public.get_closed_secret_vote_summary(uuid) from public;
revoke all on function public.get_closed_secret_vote_summary(uuid) from anon;
grant execute on function public.get_closed_secret_vote_summary(uuid) to authenticated;

commit;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('cast_anonymous_secret_vote', 'get_closed_secret_vote_summary')
order by routine_name;
