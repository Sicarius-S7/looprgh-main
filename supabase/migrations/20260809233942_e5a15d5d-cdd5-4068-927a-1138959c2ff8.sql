drop policy if exists settings_public_read on public.org_settings;

create or replace function public.public_org_settings(_org uuid)
returns table(org_id uuid, paused boolean, pause_note text, opens_at text, closes_at text, enforce_hours boolean)
language sql
stable
security definer
set search_path = public
as $$
  select s.org_id, s.paused, s.pause_note, s.opens_at, s.closes_at, s.enforce_hours
  from public.org_settings s
  where s.org_id = _org
$$;

revoke all on function public.public_org_settings(uuid) from public;
grant execute on function public.public_org_settings(uuid) to anon, authenticated;
