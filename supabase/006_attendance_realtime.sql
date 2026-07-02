-- Enable realtime updates for attendance and traffic evidence.

do $$
declare
  target_table text;
begin
  foreach target_table in array array['attendance_logs', 'traffic_logs'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('attendance_logs', 'traffic_logs')
order by tablename;
