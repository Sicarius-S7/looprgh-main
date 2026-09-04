/**
 * Loopr data layer: types, in-memory caches, Supabase read/write helpers,
 * and the pure queue/ordering/wait-time logic used across the app.
 */
import { supabase } from "@/integrations/supabase/client";

export type PriorityReason = "none" | "elderly" | "urgent";
export type TicketStatus = "waiting" | "called" | "served" | "no_show" | "left";
export type OrgRole = "owner" | "manager" | "reception";

export type Service = {
  id: string;
  name: string;
  avgMinutes: number;
  active: boolean;
};

export type Counter = {
  id: string;
  name: string;
  active: boolean;
};

// Per-location configuration (hours, pausing, counters).
export type OrgSettings = {
  counters: Counter[];
  paused: boolean;
  pauseNote: string;
  opensAt: string; // "HH:MM"
  closesAt: string; // "HH:MM"
  enforceHours: boolean;
  autoResetDaily: boolean;
};

export type Organization = {
  id: string;
  slug: string;
  name: string;
  category: string;
  avgServiceMinutes: number;
  blurb: string;
  services: Service[];
};

export type Ticket = {
  id: string;
  code: string;
  orgId: string;
  serviceId?: string;
  name: string;
  priority: PriorityReason;
  status: TicketStatus;
  joinedAt: number;
  calledAt?: number;
  closedAt?: number;
  walkIn?: boolean;
  kiosk?: boolean;
  counterId?: string;
  rating?: number;
  ratingNote?: string;
};

export type OrgMember = {
  id: string;
  userId: string;
  role: OrgRole;
};

/* ---------------- caches (keep the sync helpers below sync) ---------------- */

// In-memory snapshots kept in sync with the latest fetch so synchronous
// helpers (getOrg, readSettings, etc.) can be used without awaiting.
let orgCache: Organization[] = [];
const settingsCache: Record<string, OrgSettings> = {};

export function cachedOrganizations(): Organization[] {
  return orgCache;
}

export function getOrg(orgId: string): Organization | undefined {
  return orgCache.find((o) => o.id === orgId || o.slug === orgId);
}

export function getService(orgId: string, serviceId?: string): Service | undefined {
  if (!serviceId) return undefined;
  return getOrg(orgId)?.services.find((s) => s.id === serviceId);
}

export function defaultSettings(): OrgSettings {
  return {
    counters: [],
    paused: false,
    pauseNote: "",
    opensAt: "08:00",
    closesAt: "17:00",
    enforceHours: false,
    autoResetDaily: true,
  };
}

export function readSettings(orgId: string): OrgSettings {
  return settingsCache[orgId] ?? defaultSettings();
}

export function counterName(orgId: string, counterId?: string): string | undefined {
  if (!counterId) return undefined;
  return readSettings(orgId).counters.find((c) => c.id === counterId)?.name;
}

/* ---------------- reads ---------------- */

// Parses a nullable ISO timestamp string into epoch millis.
const ms = (value: string | null | undefined) => (value ? Date.parse(value) : undefined);

/** Loads all organizations and their active services, refreshing orgCache. */
export async function fetchOrganizations(): Promise<Organization[]> {
  const [{ data: orgs, error }, { data: services }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, slug, name, category, blurb, avg_service_minutes, created_at")
      .order("name"),
    supabase.from("services").select("*").eq("active", true).order("sort_order"),
  ]);
  if (error) throw error;
  orgCache = (orgs ?? []).map((o) => ({
    id: o.id,
    slug: o.slug,
    name: o.name,
    category: o.category,
    avgServiceMinutes: o.avg_service_minutes,
    blurb: o.blurb,
    services: (services ?? [])
      .filter((s) => s.org_id === o.id)
      .map((s) => ({ id: s.id, name: s.name, avgMinutes: s.avg_minutes, active: s.active })),
  }));
  return orgCache;
}

/** Loads a location's public settings + counters, refreshing settingsCache. */
export async function fetchSettings(orgId: string): Promise<OrgSettings> {
  const [{ data: rows }, { data: counters }] = await Promise.all([
    supabase.rpc("public_org_settings", { _org: orgId }),
    supabase.from("counters").select("*").eq("org_id", orgId).order("created_at"),
  ]);
  const row = Array.isArray(rows) ? rows[0] : null;
  const next: OrgSettings = {
    ...defaultSettings(),
    ...(row
      ? {
          paused: row.paused,
          pauseNote: row.pause_note,
          opensAt: row.opens_at.slice(0, 5),
          closesAt: row.closes_at.slice(0, 5),
          enforceHours: row.enforce_hours,
        }
      : {}),
    counters: (counters ?? []).map((c) => ({ id: c.id, name: c.name, active: c.active })),
  };
  settingsCache[orgId] = next;
  return next;
}

/** Anonymous-safe queue view: codes and timings only, never customer names. */
export async function fetchPublicQueue(orgIds: string[]): Promise<Ticket[]> {
  const results = await Promise.all(
    orgIds.map((id) => supabase.rpc("queue_snapshot", { _org: id })),
  );
  return results.flatMap(({ data }) =>
    (data ?? []).map((r) => ({
      id: r.id as string,
      code: r.code as string,
      orgId: r.org_id as string,
      serviceId: r.service_id ?? undefined,
      counterId: r.counter_id ?? undefined,
      name: "",
      priority: (r.priority ?? "none") as PriorityReason,
      status: (r.status ?? "waiting") as TicketStatus,
      joinedAt: ms(r.joined_at) ?? Date.now(),
      calledAt: ms(r.called_at),
      closedAt: ms(r.closed_at),
    })),
  );
}

/** Full ticket rows for staff of the location (names included). */
export async function fetchStaffTickets(orgId: string): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("org_id", orgId)
    .gte("joined_at", new Date(Date.now() - 30 * 864e5).toISOString())
    .order("joined_at");
  if (error) throw error;
  return (data ?? []).map(mapTicketRow);
}

// Raw shape of a row from the `tickets` table (snake_case, as returned by Supabase).
type TicketRow = {
  id: string;
  code: string;
  org_id: string;
  service_id: string | null;
  counter_id: string | null;
  name: string;
  priority: PriorityReason;
  status: TicketStatus;
  joined_at: string;
  called_at: string | null;
  closed_at: string | null;
  walk_in?: boolean;
  kiosk?: boolean;
  rating: number | null;
  rating_note: string | null;
};

// Converts a raw DB ticket row into the camelCase Ticket shape used in the app.
function mapTicketRow(r: TicketRow): Ticket {
  return {
    id: r.id,
    code: r.code,
    orgId: r.org_id,
    serviceId: r.service_id ?? undefined,
    counterId: r.counter_id ?? undefined,
    name: r.name,
    priority: r.priority,
    status: r.status,
    joinedAt: Date.parse(r.joined_at),
    calledAt: ms(r.called_at),
    closedAt: ms(r.closed_at),
    walkIn: r.walk_in,
    kiosk: r.kiosk,
    rating: r.rating ?? undefined,
    ratingNote: r.rating_note ?? undefined,
  };
}

/* ---------------- my ticket (anonymous, token based) ---------------- */

const MY_TICKET_KEY = "loopr.myticket.v2";

// Reference to a customer's own ticket, kept locally since customers are anonymous.
type MyTicketRef = { id: string; token: string };

function isBrowser() {
  return typeof window !== "undefined";
}

/** Persists (or clears, when null) the customer's active ticket reference. */
export function saveMyTicket(ref: MyTicketRef | null) {
  if (!isBrowser()) return;
  try {
    if (ref) window.localStorage.setItem(MY_TICKET_KEY, JSON.stringify(ref));
    else window.localStorage.removeItem(MY_TICKET_KEY);
  } catch {
    /* ignore */
  }
}

/** Reads back the customer's active ticket reference, if any. */
export function readMyTicket(): MyTicketRef | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(MY_TICKET_KEY);
    return raw ? (JSON.parse(raw) as MyTicketRef) : null;
  } catch {
    return null;
  }
}

/** Looks up the current state of the customer's own ticket via id+token. */
export async function fetchMyTicket(ref: MyTicketRef): Promise<Ticket | null> {
  const { data } = await supabase.rpc("get_my_ticket", { _id: ref.id, _token: ref.token });
  const row = data?.[0];
  if (!row) return null;
  return mapTicketRow({ ...row, walk_in: false, kiosk: false } as TicketRow);
}

/* ---------------- customer actions ---------------- */

/** Customer joins a location's queue and receives a ticket + access token. */
export async function joinQueue(input: {
  orgId: string;
  name: string;
  priority: PriorityReason;
  serviceId?: string;
  kiosk?: boolean;
}): Promise<MyTicketRef & { code: string }> {
  const { data, error } = await supabase.rpc("join_queue", {
    _org: input.orgId,
    _name: input.name.trim() || "Guest",
    _priority: input.priority,
    _service: input.serviceId ?? undefined,
    _kiosk: input.kiosk ?? false,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("Could not join the queue");
  return { id: row.id, token: row.access_token, code: row.code };
}

/** Customer voluntarily removes themselves from the queue. */
export async function leaveQueue(ref: MyTicketRef) {
  const { error } = await supabase.rpc("leave_queue", { _id: ref.id, _token: ref.token });
  if (error) throw error;
}

/** Customer rates their service experience (1-5) with an optional note. */
export async function rateTicket(ref: MyTicketRef, rating: number, note?: string) {
  const { error } = await supabase.rpc("rate_ticket", {
    _id: ref.id,
    _token: ref.token,
    _rating: Math.min(5, Math.max(1, Math.round(rating))),
    _note: note ?? undefined,
  });
  if (error) throw error;
}

/* ---------------- staff actions ---------------- */

/** Staff adds a walk-in customer directly, generating a sequential ticket code. */
export async function addWalkIn(input: {
  orgId: string;
  name: string;
  priority: PriorityReason;
  serviceId?: string;
}) {
  const { data: existing } = await supabase
    .from("tickets")
    .select("id")
    .eq("org_id", input.orgId)
    .gte("joined_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
  const org = getOrg(input.orgId);
  const code = `${(org?.slug ?? "L").slice(0, 1).toUpperCase()}${String((existing?.length ?? 0) + 1).padStart(3, "0")}`;
  const { error } = await supabase.from("tickets").insert({
    org_id: input.orgId,
    service_id: input.serviceId ?? null,
    name: input.name.trim() || "Walk-in",
    priority: input.priority,
    walk_in: true,
    code,
  });
  if (error) throw error;
}

/** Staff calls a specific ticket forward to a counter. */
export async function callTicket(ticketId: string, counterId?: string) {
  const { error } = await supabase
    .from("tickets")
    .update({ status: "called", called_at: new Date().toISOString(), counter_id: counterId ?? null })
    .eq("id", ticketId);
  if (error) throw error;
}

/** Staff calls the next waiting ticket (by queue order) to a counter. */
export async function callNext(tickets: Ticket[], orgId: string, counterId?: string) {
  const next = orderedQueue(tickets, orgId).find((t) => t.status === "waiting");
  if (!next) return null;
  await callTicket(next.id, counterId);
  return next;
}

/** Staff marks a called ticket as completed. */
export async function markServed(ticketId: string) {
  const { error } = await supabase
    .from("tickets")
    .update({ status: "served", closed_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) throw error;
}

/** Staff marks a ticket as a no-show. */
export async function markNoShow(ticketId: string) {
  const { error } = await supabase
    .from("tickets")
    .update({ status: "no_show", closed_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) throw error;
}

/** Clears the live board for a location (history stays for insights). */
export async function clearActiveQueue(orgId: string) {
  const { error } = await supabase
    .from("tickets")
    .update({ status: "left", closed_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .in("status", ["waiting", "called"]);
  if (error) throw error;
}

/** Closes yesterday's leftovers once per day when auto-reset is on. */
export async function runDailyReset(orgId: string) {
  if (!readSettings(orgId).autoResetDaily) return;
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  await supabase
    .from("tickets")
    .update({ status: "no_show", closed_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .lt("joined_at", startOfToday)
    .in("status", ["waiting", "called"]);
}

/* ---------------- settings, counters, services, org admin ---------------- */

/** Applies a partial settings update, updating cache then persisting to DB. */
export async function updateSettings(orgId: string, patch: Partial<OrgSettings>) {
  settingsCache[orgId] = { ...readSettings(orgId), ...patch };
  const row: Record<string, unknown> = { org_id: orgId };
  if (patch.paused !== undefined) row["paused"] = patch.paused;
  if (patch.pauseNote !== undefined) row["pause_note"] = patch.pauseNote;
  if (patch.opensAt !== undefined) row["opens_at"] = patch.opensAt;
  if (patch.closesAt !== undefined) row["closes_at"] = patch.closesAt;
  if (patch.enforceHours !== undefined) row["enforce_hours"] = patch.enforceHours;
  if (patch.autoResetDaily !== undefined) row["auto_reset_daily"] = patch.autoResetDaily;
  const { error } = await supabase.from("org_settings").upsert(row as never, { onConflict: "org_id" });
  if (error) throw error;
}

/** Adds a new service counter for a location. */
export async function addCounter(orgId: string, name: string) {
  const count = readSettings(orgId).counters.length;
  const { error } = await supabase
    .from("counters")
    .insert({ org_id: orgId, name: name.trim() || `Counter ${count + 1}`, active: true });
  if (error) throw error;
}

/** Flips a counter's active/inactive state. */
export async function toggleCounter(orgId: string, counterId: string) {
  const current = readSettings(orgId).counters.find((c) => c.id === counterId);
  const { error } = await supabase
    .from("counters")
    .update({ active: !current?.active })
    .eq("id", counterId);
  if (error) throw error;
}

/** Deletes a counter, refusing to remove the last remaining one. */
export async function removeCounter(orgId: string, counterId: string) {
  if (readSettings(orgId).counters.length <= 1) return;
  const { error } = await supabase.from("counters").delete().eq("id", counterId);
  if (error) throw error;
}

/** Creates a new location with a unique slug and a default counter. */
export async function createOrganization(input: {
  name: string;
  category: string;
  blurb: string;
  avgServiceMinutes: number;
  userId: string;
}) {
  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || `loc-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      name: input.name.trim(),
      slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      category: input.category.trim(),
      blurb: input.blurb.trim(),
      avg_service_minutes: input.avgServiceMinutes,
      created_by: input.userId,
    })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("counters").insert({ org_id: data.id, name: "Counter 1", active: true });
  return data.id;
}

/** Updates basic organization profile fields. */
export async function updateOrganization(
  orgId: string,
  patch: { name?: string; category?: string; blurb?: string; avgServiceMinutes?: number },
) {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row["name"] = patch.name;
  if (patch.category !== undefined) row["category"] = patch.category;
  if (patch.blurb !== undefined) row["blurb"] = patch.blurb;
  if (patch.avgServiceMinutes !== undefined) row["avg_service_minutes"] = patch.avgServiceMinutes;
  const { error } = await supabase.from("organizations").update(row as never).eq("id", orgId);
  if (error) throw error;
}

/** Adds a new service offering to a location. */
export async function addService(orgId: string, name: string, avgMinutes: number) {
  const { error } = await supabase
    .from("services")
    .insert({ org_id: orgId, name: name.trim(), avg_minutes: Math.max(1, avgMinutes) });
  if (error) throw error;
}

/** Soft-deletes a service by marking it inactive. */
export async function removeService(serviceId: string) {
  const { error } = await supabase.from("services").update({ active: false }).eq("id", serviceId);
  if (error) throw error;
}

/** Loads the staff team members for a location. */
export async function fetchMembers(orgId: string): Promise<OrgMember[]> {
  const { data, error } = await supabase.from("org_members").select("*").eq("org_id", orgId);
  if (error) throw error;
  return (data ?? []).map((m) => ({ id: m.id, userId: m.user_id, role: m.role as OrgRole }));
}

export type Membership = { orgId: string; role: OrgRole };

/** Locations the signed-in user is on the team of. */
export async function fetchMyMemberships(userId: string): Promise<Membership[]> {
  const { data, error } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((m) => ({ orgId: m.org_id, role: m.role as OrgRole }));
}

/** Takes ownership of a location that has no team yet. */
/** Takes ownership of a location that has no team yet. */
export async function claimOrg(orgId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_org", { _org: orgId });
  if (error) throw error;
  return data === true;
}

/* ---------------- pure queue logic (unchanged rules) ---------------- */

/** Best-known service duration for a ticket: measured history, then service/org defaults. */
export function ticketServiceMinutes(ticket: Ticket, history?: Ticket[]): number {
  const measured = history
    ? measuredServiceMinutes(history, ticket.orgId, ticket.serviceId)
    : undefined;
  return (
    measured ??
    getService(ticket.orgId, ticket.serviceId)?.avgMinutes ??
    getOrg(ticket.orgId)?.avgServiceMinutes ??
    5
  );
}

/** Average actual service duration (called->closed) from recent history, if enough samples exist. */
export function measuredServiceMinutes(
  tickets: Ticket[],
  orgId: string,
  serviceId?: string,
  minSamples = 3,
): number | undefined {
  const samples = tickets
    .filter(
      (t) =>
        t.orgId === orgId &&
        t.status === "served" &&
        t.calledAt &&
        t.closedAt &&
        (!serviceId || t.serviceId === serviceId),
    )
    .map((t) => (t.closedAt! - t.calledAt!) / 60000)
    .filter((m) => m >= 0 && m < 240);
  if (samples.length < minSamples) return undefined;
  return Math.max(1, Math.round(samples.reduce((a, b) => a + b, 0) / samples.length));
}

/** True if a ticket qualifies for priority handling (elderly or urgent). */
export function isPriority(ticket: Ticket) {
  return ticket.priority === "elderly" || ticket.priority === "urgent";
}

/**
 * Priority tickets sit ahead of standard tickets, but within each group tickets
 * keep strict join order. Called tickets stay pinned to the very front.
 */
export function orderedQueue(tickets: Ticket[], orgId: string): Ticket[] {
  return tickets
    .filter((t) => t.orgId === orgId && (t.status === "waiting" || t.status === "called"))
    .sort((a, b) => {
      const rank = (t: Ticket) => (t.status === "called" ? 0 : isPriority(t) ? 1 : 2);
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.joinedAt - b.joinedAt;
    });
}

/** 1-based position of a ticket within its location's ordered queue. */
export function ticketPosition(tickets: Ticket[], ticketId: string): number {
  const ticket = tickets.find((t) => t.id === ticketId);
  if (!ticket) return -1;
  const index = orderedQueue(tickets, ticket.orgId).findIndex((t) => t.id === ticketId);
  return index === -1 ? -1 : index + 1;
}

/** Estimated minutes until a specific ticket is called, based on tickets ahead of it. */
export function estimatedWaitMinutes(tickets: Ticket[], ticketId: string): number {
  const ticket = tickets.find((t) => t.id === ticketId);
  if (!ticket) return 0;
  const queue = orderedQueue(tickets, ticket.orgId);
  const index = queue.findIndex((t) => t.id === ticketId);
  if (index < 0) return 0;
  return Math.round(
    queue.slice(0, index).reduce((sum, t) => sum + ticketServiceMinutes(t, tickets), 0),
  );
}

/** Estimated total minutes to clear the current queue for a location. */
export function projectedWaitMinutes(tickets: Ticket[], orgId: string): number {
  return Math.round(
    orderedQueue(tickets, orgId).reduce((sum, t) => sum + ticketServiceMinutes(t, tickets), 0),
  );
}

// Converts an "HH:MM" string into minutes since midnight.
function minutesOfDay(time: string) {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Whether the given time falls within the location's configured opening hours. */
export function isWithinHours(settings: OrgSettings, at: Date = new Date()): boolean {
  const now = at.getHours() * 60 + at.getMinutes();
  const open = minutesOfDay(settings.opensAt);
  const close = minutesOfDay(settings.closesAt);
  if (open === close) return true;
  if (open < close) return now >= open && now < close;
  return now >= open || now < close;
}

export type QueueAvailability = {
  accepting: boolean;
  reason: "open" | "paused" | "closed";
  note: string;
};

/** Combines pause state and opening hours into a single accept/reject verdict with a reason. */
export function queueAvailability(
  settings: OrgSettings | null,
  at: Date = new Date(),
): QueueAvailability {
  if (!settings) return { accepting: true, reason: "open", note: "Joining is open." };
  if (settings.paused) {
    return {
      accepting: false,
      reason: "paused",
      note: settings.pauseNote || "Staff paused the queue for a short break.",
    };
  }
  if (settings.enforceHours && !isWithinHours(settings, at)) {
    return {
      accepting: false,
      reason: "closed",
      note: `Open ${settings.opensAt}–${settings.closesAt}. Come back during opening hours.`,
    };
  }
  return { accepting: true, reason: "open", note: "Joining is open." };
}

// Checks whether a timestamp falls on the current calendar day.
function isToday(timestamp: number) {
  const d = new Date(timestamp);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export type OrgStats = {
  servedToday: number;
  queueLength: number;
  averageWaitMinutes: number;
  noShowsToday: number;
  cancelledToday: number;
};

/** Today's snapshot stats for a location: served, queue length, waits, no-shows, cancellations. */
export function orgStats(tickets: Ticket[], orgId: string): OrgStats {
  const forOrg = tickets.filter((t) => t.orgId === orgId);
  const served = forOrg.filter((t) => t.status === "served" && t.closedAt && isToday(t.closedAt));
  const waits = served
    .map((t) => ((t.calledAt ?? t.closedAt!) - t.joinedAt) / 60000)
    .filter((m) => m >= 0);
  return {
    servedToday: served.length,
    queueLength: forOrg.filter((t) => t.status === "waiting" || t.status === "called").length,
    averageWaitMinutes: waits.length
      ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
      : 0,
    noShowsToday: forOrg.filter(
      (t) => t.status === "no_show" && t.closedAt && isToday(t.closedAt),
    ).length,
    cancelledToday: forOrg.filter((t) => t.status === "left" && t.closedAt && isToday(t.closedAt))
      .length,
  };
}

/** Human-friendly wait time label, e.g. "~1h 5m" or "Almost your turn". */
export function formatWait(minutes: number) {
  if (minutes <= 0) return "Almost your turn";
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `~${h}h ${m}m` : `~${h}h`;
}

export const PRIORITY_LABEL: Record<PriorityReason, string> = {
  none: "Standard",
  elderly: "Elderly",
  urgent: "Urgent",
};

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  manager: "Manager",
  reception: "Reception",
};
