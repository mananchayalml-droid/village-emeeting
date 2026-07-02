-- Run once after the initial schema if Supabase marks the summary views UNRESTRICTED.
-- security_invoker makes each view obey the caller's permissions and the RLS
-- policies on its underlying tables.

alter view public.meeting_quorum_summary
set (security_invoker = true);

alter view public.open_vote_summary
set (security_invoker = true);

alter view public.secret_vote_summary
set (security_invoker = true);

revoke all on public.meeting_quorum_summary from anon;
revoke all on public.open_vote_summary from anon;
revoke all on public.secret_vote_summary from anon;

grant select on public.meeting_quorum_summary to authenticated;
grant select on public.open_vote_summary to authenticated;
grant select on public.secret_vote_summary to authenticated;

-- Verification: all three rows should show security_invoker=true.
select
  c.relname as view_name,
  c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'meeting_quorum_summary',
    'open_vote_summary',
    'secret_vote_summary'
  )
order by c.relname;
