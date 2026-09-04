-- ============ enums ============
create type public.org_role as enum ('owner','manager','reception');
create type public.ticket_priority as enum ('none','elderly','urgent');
create type public.ticket_status as enum ('waiting','called','served','no_show','left');

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ============ organizations ============
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null default '',
  blurb text not null default '',
  avg_service_minutes int not null default 5,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.organizations to anon;
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;

create table public.org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null default 'reception',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
grant select, insert, update, delete on public.org_members to authenticated;
grant all on public.org_members to service_role;
alter table public.org_members enable row level security;

create or replace function public.is_org_member(_org uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = _org and user_id = _user)
$$;

create or replace function public.is_org_manager(_org uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = _org and user_id = _user and role in ('owner','manager'))
$$;

create policy "orgs_public_read" on public.organizations for select using (true);
create policy "orgs_insert_authenticated" on public.organizations for insert to authenticated with check (auth.uid() = created_by);
create policy "orgs_update_manager" on public.organizations for update to authenticated using (public.is_org_manager(id, auth.uid())) with check (public.is_org_manager(id, auth.uid()));
create policy "orgs_delete_manager" on public.organizations for delete to authenticated using (public.is_org_manager(id, auth.uid()));

create policy "members_read_own_org" on public.org_members for select to authenticated using (public.is_org_member(org_id, auth.uid()));
create policy "members_manage" on public.org_members for insert to authenticated with check (public.is_org_manager(org_id, auth.uid()));
create policy "members_update" on public.org_members for update to authenticated using (public.is_org_manager(org_id, auth.uid())) with check (public.is_org_manager(org_id, auth.uid()));
create policy "members_delete" on public.org_members for delete to authenticated using (public.is_org_manager(org_id, auth.uid()));

-- creator becomes owner
create or replace function public.handle_new_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.org_members (org_id, user_id, role) values (new.id, new.created_by, 'owner')
    on conflict (org_id, user_id) do nothing;
  end if;
  insert into public.org_settings (org_id) values (new.id) on conflict (org_id) do nothing;
  return new;
end; $$;

-- ============ services ============
create table public.services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  avg_minutes int not null default 5,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.services to anon;
grant select, insert, update, delete on public.services to authenticated;
grant all on public.services to service_role;
alter table public.services enable row level security;
create policy "services_public_read" on public.services for select using (true);
create policy "services_manage" on public.services for all to authenticated
  using (public.is_org_manager(org_id, auth.uid())) with check (public.is_org_manager(org_id, auth.uid()));

-- ============ counters ============
create table public.counters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.counters to anon;
grant select, insert, update, delete on public.counters to authenticated;
grant all on public.counters to service_role;
alter table public.counters enable row level security;
create policy "counters_public_read" on public.counters for select using (true);
create policy "counters_manage" on public.counters for all to authenticated
  using (public.is_org_manager(org_id, auth.uid())) with check (public.is_org_manager(org_id, auth.uid()));

-- ============ settings ============
create table public.org_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  paused boolean not null default false,
  pause_note text not null default '',
  opens_at text not null default '08:00',
  closes_at text not null default '17:00',
  enforce_hours boolean not null default false,
  auto_reset_daily boolean not null default true,
  updated_at timestamptz not null default now()
);
grant select on public.org_settings to anon;
grant select, insert, update on public.org_settings to authenticated;
grant all on public.org_settings to service_role;
alter table public.org_settings enable row level security;
create policy "settings_public_read" on public.org_settings for select using (true);
create policy "settings_manage" on public.org_settings for all to authenticated
  using (public.is_org_manager(org_id, auth.uid())) with check (public.is_org_manager(org_id, auth.uid()));

create trigger org_created after insert on public.organizations
for each row execute function public.handle_new_org();

-- ============ tickets ============
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  counter_id uuid references public.counters(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  access_token text not null default encode(gen_random_bytes(18),'hex'),
  code text not null,
  name text not null default 'Guest',
  priority public.ticket_priority not null default 'none',
  status public.ticket_status not null default 'waiting',
  joined_at timestamptz not null default now(),
  called_at timestamptz,
  closed_at timestamptz,
  walk_in boolean not null default false,
  kiosk boolean not null default false,
  rating int check (rating between 1 and 5),
  rating_note text
);
create index tickets_org_status_idx on public.tickets (org_id, status, joined_at);
grant select, insert, update, delete on public.tickets to authenticated;
grant all on public.tickets to service_role;
alter table public.tickets enable row level security;

-- staff of the org see and manage everything
create policy "tickets_staff_read" on public.tickets for select to authenticated using (public.is_org_member(org_id, auth.uid()) or user_id = auth.uid());
create policy "tickets_staff_insert" on public.tickets for insert to authenticated with check (public.is_org_member(org_id, auth.uid()));
create policy "tickets_staff_update" on public.tickets for update to authenticated using (public.is_org_member(org_id, auth.uid())) with check (public.is_org_member(org_id, auth.uid()));
create policy "tickets_manager_delete" on public.tickets for delete to authenticated using (public.is_org_manager(org_id, auth.uid()));

-- ============ public queue access (no names) ============
create type public.public_ticket as (
  id uuid, code text, org_id uuid, service_id uuid, counter_id uuid,
  priority public.ticket_priority, status public.ticket_status,
  joined_at timestamptz, called_at timestamptz, closed_at timestamptz
);

create or replace function public.queue_snapshot(_org uuid)
returns setof public.public_ticket
language sql stable security definer set search_path = public as $$
  select t.id, t.code, t.org_id, t.service_id, t.counter_id, t.priority, t.status,
         t.joined_at, t.called_at, t.closed_at
  from public.tickets t
  where t.org_id = _org
    and (t.status in ('waiting','called') or t.closed_at > now() - interval '12 hours')
$$;
grant execute on function public.queue_snapshot(uuid) to anon, authenticated;

create or replace function public.get_my_ticket(_id uuid, _token text)
returns table (
  id uuid, code text, org_id uuid, service_id uuid, counter_id uuid,
  name text, priority public.ticket_priority, status public.ticket_status,
  joined_at timestamptz, called_at timestamptz, closed_at timestamptz,
  rating int, rating_note text
)
language sql stable security definer set search_path = public as $$
  select t.id, t.code, t.org_id, t.service_id, t.counter_id, t.name, t.priority, t.status,
         t.joined_at, t.called_at, t.closed_at, t.rating, t.rating_note
  from public.tickets t
  where t.id = _id and t.access_token = _token
$$;
grant execute on function public.get_my_ticket(uuid, text) to anon, authenticated;

create or replace function public.join_queue(
  _org uuid, _name text, _priority public.ticket_priority default 'none',
  _service uuid default null, _kiosk boolean default false
)
returns table (id uuid, code text, access_token text)
language plpgsql security definer set search_path = public as $$
declare
  s public.org_settings%rowtype;
  seq int;
  new_code text;
  tok text;
  new_id uuid;
  now_min int;
  open_min int;
  close_min int;
  is_open boolean;
begin
  select * into s from public.org_settings where org_id = _org;
  if not found then
    raise exception 'Unknown location';
  end if;
  if s.paused then
    raise exception 'This queue is paused right now';
  end if;
  if s.enforce_hours then
    now_min := extract(hour from now())::int * 60 + extract(minute from now())::int;
    open_min := split_part(s.opens_at,':',1)::int * 60 + split_part(s.opens_at,':',2)::int;
    close_min := split_part(s.closes_at,':',1)::int * 60 + split_part(s.closes_at,':',2)::int;
    if open_min = close_min then is_open := true;
    elsif open_min < close_min then is_open := now_min >= open_min and now_min < close_min;
    else is_open := now_min >= open_min or now_min < close_min;
    end if;
    if not is_open then
      raise exception 'This location is closed right now';
    end if;
  end if;

  select count(*)::int + 1 into seq from public.tickets
   where org_id = _org and joined_at::date = current_date;
  select upper(substr(o.slug,1,1)) || lpad(seq::text,3,'0') into new_code
    from public.organizations o where o.id = _org;
  tok := encode(gen_random_bytes(18),'hex');

  insert into public.tickets (org_id, service_id, user_id, access_token, code, name, priority, kiosk, walk_in)
  values (_org, _service, auth.uid(), tok, new_code, nullif(btrim(_name),''), _priority, _kiosk, _kiosk)
  returning tickets.id into new_id;

  return query select new_id, new_code, tok;
end; $$;
grant execute on function public.join_queue(uuid, text, public.ticket_priority, uuid, boolean) to anon, authenticated;

create or replace function public.leave_queue(_id uuid, _token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.tickets set status = 'left', closed_at = now()
   where id = _id and access_token = _token and status in ('waiting','called');
  get diagnostics n = row_count;
  return n > 0;
end; $$;
grant execute on function public.leave_queue(uuid, text) to anon, authenticated;

create or replace function public.rate_ticket(_id uuid, _token text, _rating int, _note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.tickets set rating = least(5, greatest(1, _rating)), rating_note = _note
   where id = _id and access_token = _token and status = 'served';
  get diagnostics n = row_count;
  return n > 0;
end; $$;
grant execute on function public.rate_ticket(uuid, text, int, text) to anon, authenticated;

-- ============ seed starter locations ============
do $seed$
declare oid uuid;
begin
  insert into public.organizations (slug, name, category, blurb, avg_service_minutes)
  values ('accra-bank','Accra Community Bank','Banking','Teller services, account opening, card collection',6)
  returning id into oid;
  insert into public.services (org_id, name, avg_minutes, sort_order) values
    (oid,'Teller / deposits',4,1),(oid,'Account opening',15,2),(oid,'Card collection',3,3);
  insert into public.counters (org_id, name, active) values (oid,'Counter 1',true),(oid,'Counter 2',false);

  insert into public.organizations (slug, name, category, blurb, avg_service_minutes)
  values ('sunrise-clinic','Sunrise Family Clinic','Healthcare','General consultation, vitals check, prescriptions',10)
  returning id into oid;
  insert into public.services (org_id, name, avg_minutes, sort_order) values
    (oid,'General consultation',15,1),(oid,'Vitals check',5,2),(oid,'Prescription pickup',4,3);
  insert into public.counters (org_id, name, active) values (oid,'Room 1',true),(oid,'Room 2',false);

  insert into public.organizations (slug, name, category, blurb, avg_service_minutes)
  values ('quickmart','QuickMart Express','Retail','Pickup counter, returns, bill payments',3)
  returning id into oid;
  insert into public.services (org_id, name, avg_minutes, sort_order) values
    (oid,'Order pickup',2,1),(oid,'Returns & exchanges',6,2),(oid,'Bill payments',4,3);
  insert into public.counters (org_id, name, active) values (oid,'Desk 1',true),(oid,'Desk 2',false);
end $seed$;