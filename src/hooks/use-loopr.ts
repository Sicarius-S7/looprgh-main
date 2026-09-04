/**
 * Loopr data hooks
 * A small set of polling-based hooks that keep organization, queue, and
 * settings data fresh by re-fetching on an interval, plus a helper for
 * making relative time labels stay up to date.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchOrganizations,
  fetchPublicQueue,
  fetchSettings,
  fetchStaffTickets,
  type Organization,
  type OrgSettings,
  type Ticket,
} from "@/lib/loopr-store";

/** Runs an async loader immediately and then on an interval, client-side only. */
function usePolled<T>(
  loader: (() => Promise<T>) | null,
  intervalMs: number,
  initial: T,
) {
  const [data, setData] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  // Keep the latest loader in a ref so the interval effect doesn't need to
  // restart every time the loader function identity changes.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // Runs the current loader once and updates state; swallows errors so a
  // transient failure doesn't wipe out previously-loaded data.
  const refresh = useCallback(async () => {
    const run = loaderRef.current;
    if (!run) {
      setLoaded(true);
      return;
    }
    try {
      setData(await run());
    } catch {
      /* keep last good data; the next tick retries */
    } finally {
      setLoaded(true);
    }
  }, []);

  // Fire the loader immediately on mount/interval change, then repeat on a timer.
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive) void refresh();
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, refresh, loader === null]);

  return { data, loaded, refresh };
}

/** All locations with their active services. */
export function useOrganizations() {
  const { data, loaded, refresh } = usePolled<Organization[]>(
    fetchOrganizations,
    60000,
    [],
  );
  return { orgs: data, loaded, refresh };
}

/** Anonymous-safe live queue across the given locations (codes and timings only). */
export function usePublicQueue(orgIds: string[], intervalMs = 5000) {
  const key = orgIds.join(",");
  const loader = useCallback(
    () => (key ? fetchPublicQueue(key.split(",")) : Promise.resolve([])),
    [key],
  );
  const { data, loaded, refresh } = usePolled<Ticket[]>(loader, intervalMs, []);
  return { tickets: data, loaded, refresh };
}

/** Full ticket rows (names included) for staff of one location. */
export function useStaffQueue(orgId: string | null, intervalMs = 4000) {
  const loader = useCallback(
    () => (orgId ? fetchStaffTickets(orgId) : Promise.resolve([])),
    [orgId],
  );
  const { data, loaded, refresh } = usePolled<Ticket[]>(loader, intervalMs, []);
  return { tickets: data, loaded, refresh };
}

/** Live operating settings (counters, hours, pause) for one location. */
export function useOrgSettings(orgId: string | null, intervalMs = 8000) {
  const loader = useCallback(
    () => (orgId ? fetchSettings(orgId) : Promise.resolve(null)),
    [orgId],
  );
  const { data, refresh } = usePolled<OrgSettings | null>(loader, intervalMs, null);
  return { settings: data, refresh };
}

/** Re-renders on an interval so relative time labels stay fresh. */
export function useTick(intervalMs = 15000) {
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}
