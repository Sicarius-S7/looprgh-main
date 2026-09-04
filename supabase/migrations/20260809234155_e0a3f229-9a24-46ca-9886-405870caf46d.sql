-- 1. Organizations: hide created_by from anonymous visitors
REVOKE SELECT ON public.organizations FROM anon;
GRANT SELECT (id, slug, name, category, blurb, avg_service_minutes, created_at) ON public.organizations TO anon;

-- 2. Counters: public sees only active counters
DROP POLICY IF EXISTS counters_public_read ON public.counters;
CREATE POLICY counters_public_read ON public.counters
  FOR SELECT TO anon, authenticated
  USING (active = true OR public.is_org_member(org_id, auth.uid()));

-- 3. Services: public sees only active services
DROP POLICY IF EXISTS services_public_read ON public.services;
CREATE POLICY services_public_read ON public.services
  FOR SELECT TO anon, authenticated
  USING (active = true OR public.is_org_member(org_id, auth.uid()));

-- 4. SECURITY DEFINER function exposure: lock down internals
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_org() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_org_manager(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- claim_org requires an authenticated user
REVOKE ALL ON FUNCTION public.claim_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_org(uuid) TO authenticated;

-- Queue-facing helpers stay callable by visitors and signed-in users
REVOKE ALL ON FUNCTION public.join_queue(uuid, text, ticket_priority, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_queue(uuid, text, ticket_priority, uuid, boolean) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.leave_queue(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_queue(uuid, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_my_ticket(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_ticket(uuid, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.rate_ticket(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_ticket(uuid, text, integer, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.queue_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_snapshot(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.org_is_unclaimed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_is_unclaimed(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.public_org_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_org_settings(uuid) TO anon, authenticated;