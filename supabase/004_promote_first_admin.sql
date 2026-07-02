-- First admin: mananchayal.ml@gmail.com
-- The Auth user must already exist under Authentication -> Users.

do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower('mananchayal.ml@gmail.com')
  limit 1;

  if target_user_id is null then
    raise exception 'Auth user mananchayal.ml@gmail.com not found. Sign in once before running this script.';
  end if;

  insert into public.profiles (id, full_name, email, role, is_active)
  select id, split_part(email, '@', 1), email, 'admin', true
  from auth.users
  where id = target_user_id
  on conflict (id) do update
  set role = 'admin', is_active = true, email = excluded.email;

  insert into public.admin_members (profile_id, can_manage_all, two_factor_confirmed)
  values (target_user_id, true, true)
  on conflict (profile_id) do update
  set can_manage_all = true, two_factor_confirmed = true;
end;
$$;

select p.id, p.email, p.role, a.can_manage_all, a.two_factor_confirmed
from public.profiles p
join public.admin_members a on a.profile_id = p.id
where p.role = 'admin';
