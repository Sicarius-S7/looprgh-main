CREATE OR REPLACE FUNCTION public.join_queue(_org uuid, _name text, _priority ticket_priority DEFAULT 'none'::ticket_priority, _service uuid DEFAULT NULL::uuid, _kiosk boolean DEFAULT false)
 RETURNS TABLE(id uuid, code text, access_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  tok := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');

  insert into public.tickets (org_id, service_id, user_id, access_token, code, name, priority, kiosk, walk_in)
  values (_org, _service, auth.uid(), tok, new_code, nullif(btrim(_name),''), _priority, _kiosk, _kiosk)
  returning tickets.id into new_id;

  return query select new_id, new_code, tok;
end; $function$;

REVOKE EXECUTE ON FUNCTION public.join_queue(uuid, text, ticket_priority, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_queue(uuid, text, ticket_priority, uuid, boolean) TO anon, authenticated;