create or replace function public.claim_org(_org uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare existing int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;
  select count(*) into existing from public.org_members where org_id = _org;
  if existing > 0 then
    return false;
  end if;
  insert into public.org_members (org_id, user_id, role) values (_org, auth.uid(), 'owner')
  on conflict (org_id, user_id) do nothing;
  update public.organizations set created_by = coalesce(created_by, auth.uid()) where id = _org;
  insert into public.org_settings (org_id) values (_org) on conflict (org_id) do nothing;
  return true;
end; $$;

grant execute on function public.claim_org(uuid) to authenticated;

create or replace function public.org_is_unclaimed(_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.org_members where org_id = _org)
$$;

grant execute on function public.org_is_unclaimed(uuid) to anon, authenticated;

insert into public.org_settings (org_id)
select id from public.organizations
on conflict (org_id) do nothing;