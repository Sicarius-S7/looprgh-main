/**
 * Staff dashboard route (`/staff`).
 *
 * Lets a signed-in staff member manage one or more organizations ("locations"):
 * onboard/claim a location, run the live queue (call/serve/no-show visitors,
 * add walk-ins), configure counters/services/hours, and view insights.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Coffee,
  Download,
  LogOut,
  Monitor,
  PhoneCall,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AdvisoryPanel } from "@/components/loopr/AdvisoryPanel";
import { EmptyQueue } from "@/components/loopr/EmptyQueue";
import { InsightsPanel } from "@/components/loopr/InsightsPanel";
import { LooprLogo } from "@/components/loopr/LooprLogo";
import { SoundToggle } from "@/components/loopr/SoundToggle";
import { ThemeToggle } from "@/components/loopr/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useOrganizations, useOrgSettings, useStaffQueue, useTick } from "@/hooks/use-loopr";
import { playCallChime, playSoftBlip } from "@/lib/loopr-feedback";
import { downloadCsv, ticketsToCsv } from "@/lib/loopr-insights";
import { supabase } from "@/integrations/supabase/client";
import {
  addCounter,
  addService,
  addWalkIn,
  callNext,
  callTicket,
  claimOrg,
  clearActiveQueue,
  counterName,
  createOrganization,
  fetchMyMemberships,
  markNoShow,
  markServed,
  orderedQueue,
  orgStats,
  PRIORITY_LABEL,
  removeCounter,
  removeService,
  ROLE_LABEL,
  toggleCounter,
  updateSettings,
  type Membership,
  type OrgRole,
  type PriorityReason,
  type Ticket,
} from "@/lib/loopr-store";

// Route metadata (page title/description) for the staff dashboard.
export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff dashboard — Loopr" },
      {
        name: "description",
        content:
          "Run your location's live queue: call the next visitor to a counter, add walk-ins, manage hours and breaks, and track service insights.",
      },
      { property: "og:title", content: "Staff dashboard — Loopr" },
      {
        property: "og:description",
        content: "Call, serve and track every visitor from one live dashboard.",
      },
    ],
  }),
  component: StaffPage,
});

/**
 * Top-level page component: handles auth gating and loads the current
 * user's memberships (which orgs they belong to and their role), then
 * renders either onboarding (no locations yet) or the full Dashboard.
 */
function StaffPage() {
  // Auth + navigation state
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  // Organizations available in the system, plus this user's memberships
  // and which org is currently selected in the org switcher.
  const { orgs, refresh: refreshOrgs } = useOrganizations();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Fetch (or clear) the signed-in user's org memberships and default the
  // selected org to the first membership found.
  const loadMemberships = useCallback(async () => {
    if (!user) {
      setMemberships(null);
      return;
    }
    const rows = await fetchMyMemberships(user.id);
    setMemberships(rows);
    setOrgId((current) => current ?? rows[0]?.orgId ?? null);
  }, [user]);

  // Reload memberships whenever the loader identity changes (e.g. on sign-in).
  useEffect(() => {
    void loadMemberships();
  }, [loadMemberships]);

  // Wait for auth state to resolve before rendering anything else.
  if (!ready) {
    return <Shell><p className="py-20 text-center text-sm text-muted-foreground">Loading…</p></Shell>;
  }

  // Unauthenticated: prompt sign-in instead of showing dashboard content.
  if (!user) {
    return (
      <Shell>
        <div className="py-16 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight">Staff dashboard</h1>
          <p className="mx-auto mt-3 max-w-sm text-muted-foreground">
            Sign in with your staff account to run your location's queue.
          </p>
          <Button className="mt-6 h-12 rounded-xl px-8" onClick={() => navigate({ to: "/auth" })}>
            Sign in
          </Button>
        </div>
      </Shell>
    );
  }

  // Role of the signed-in user within the currently selected org.
  const role = memberships?.find((m) => m.orgId === orgId)?.role ?? null;

  return (
    <Shell
      right={
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await supabase.auth.signOut();
            setMemberships(null);
            setOrgId(null);
            void navigate({ to: "/", replace: true });
          }}
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      }
    >
      {/* Loading, no-locations onboarding, or org switcher + dashboard */}
      {memberships === null ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading your locations…</p>
      ) : memberships.length === 0 ? (
        <NoLocations
          orgs={orgs}
          userId={user.id}
          onDone={async () => {
            await refreshOrgs();
            await loadMemberships();
          }}
        />
      ) : (
        <>
          {/* Org switcher, shown only when staff belongs to multiple locations */}
          {memberships.length > 1 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {memberships.map((m) => {
                const org = orgs.find((o) => o.id === m.orgId);
                return (
                  <button
                    key={m.orgId}
                    type="button"
                    onClick={() => setOrgId(m.orgId)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium ${
                      orgId === m.orgId
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {org?.name ?? "Location"}
                  </button>
                );
              })}
            </div>
          )}
          {orgId && role && <Dashboard orgId={orgId} role={role} />}
        </>
      )}
    </Shell>
  );
}

/** Shared page chrome: logo, sound/theme toggles, and an optional right-aligned action slot. */
function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Link to="/">
          <LooprLogo />
        </Link>
        <div className="flex items-center gap-1">
          <SoundToggle />
          <ThemeToggle />
          {right}
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5">{children}</div>
    </main>
  );
}

/* ---------------- onboarding ---------------- */

/**
 * Shown when the signed-in staff user has no org memberships yet.
 * Offers two paths: claim an existing unclaimed location, or create a new one.
 */
function NoLocations({
  orgs,
  userId,
  onDone,
}: {
  orgs: { id: string; name: string; category: string }[];
  userId: string;
  onDone: () => Promise<void>;
}) {
  // Form state for creating a brand-new organization.
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [blurb, setBlurb] = useState("");
  const [avg, setAvg] = useState(5);
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-6 py-6 md:grid-cols-2">
      {/* Claim an existing, teamless location */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Take charge of a location</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          If your location is already listed and has no team yet, claim it to become its owner.
        </p>
        <div className="mt-4 space-y-2">
          {orgs.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{o.name}</p>
                <p className="text-xs text-muted-foreground">{o.category}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const ok = await claimOrg(o.id);
                    if (!ok) {
                      toast.error("That location already has a team.");
                      return;
                    }
                    toast.success(`You now manage ${o.name}.`);
                    await onDone();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not claim it.");
                  }
                }}
              >
                Claim
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Create a brand-new location from scratch */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Or set up a new location</h2>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="org-name">Location name</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-category">Category</Label>
            <Input
              id="org-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Banking, Healthcare, Retail…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-blurb">Short description</Label>
            <Input id="org-blurb" value={blurb} onChange={(e) => setBlurb(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-avg">Average service time (minutes)</Label>
            <Input
              id="org-avg"
              type="number"
              min={1}
              value={avg}
              onChange={(e) => setAvg(Number(e.target.value) || 1)}
            />
          </div>
          <Button
            className="w-full"
            disabled={!name.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await createOrganization({
                  name,
                  category: category || "General",
                  blurb,
                  avgServiceMinutes: avg,
                  userId,
                });
                toast.success("Location created.");
                await onDone();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not create it.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus className="size-4" /> Create location
          </Button>
        </div>
      </section>
    </div>
  );
}

/* ---------------- dashboard ---------------- */

/**
 * Main staff dashboard for a single org: live queue controls, walk-in intake,
 * and (for owners/managers) hours/breaks, counters, services and
 * insights.
 */
function Dashboard({ orgId, role }: { orgId: string; role: OrgRole }) {
  // Managers/owners see extra configuration sections that regular staff don't.
  const isManager = role === "owner" || role === "manager";
  const { orgs } = useOrganizations();
  const { tickets, refresh } = useStaffQueue(orgId);
  const { settings, refresh: refreshSettings } = useOrgSettings(orgId);
  // Force periodic re-renders so wait times/stats stay fresh.
  useTick(20000);

  // Derived data: the org record, priority-ordered live queue, today's stats,
  // and the list of currently active counters.
  const org = orgs.find((o) => o.id === orgId) ?? null;
  const queue = useMemo(() => orderedQueue(tickets, orgId), [tickets, orgId]);
  const stats = orgStats(tickets, orgId);
  const counters = settings?.counters.filter((c) => c.active) ?? [];

  // Form state for the walk-in intake form and the counter/service editors.
  const [walkInName, setWalkInName] = useState("");
  const [walkInService, setWalkInService] = useState<string | undefined>(undefined);
  const [walkInPriority, setWalkInPriority] = useState<PriorityReason>("none");
  const [newCounter, setNewCounter] = useState("");
  const [newService, setNewService] = useState("");
  const [newServiceMinutes, setNewServiceMinutes] = useState(5);

  // Generic wrapper for mutating actions: runs the action, refreshes the
  // queue, and surfaces success/error toasts.
  const act = async (fn: () => Promise<unknown>, message?: string) => {
    try {
      await fn();
      await refresh();
      if (message) toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't work.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{org?.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <BadgeCheck className="size-4 text-brand" /> Signed in as {ROLE_LABEL[role]}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/kiosk" search={{ org: orgId }}>
              <Monitor className="size-4" /> Kiosk mode
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(`loopr-${org?.slug ?? "tickets"}.csv`, ticketsToCsv(tickets, orgId))
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Quick stat tiles for today's activity */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Served today" value={stats.servedToday} />
        <Stat label="In queue now" value={stats.queueLength} />
        <Stat label="Avg wait" value={`${stats.averageWaitMinutes}m`} />
        <Stat label="No-shows" value={stats.noShowsToday} />
        <Stat label="Cancelled" value={stats.cancelledToday} />
      </div>

      {/* Live queue: call-next buttons per counter (or a single call-next
          button if no counters are configured) and the ordered ticket list */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Live queue</h2>
          <div className="flex flex-wrap gap-2">
            {counters.length ? (
              counters.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  onClick={() =>
                    act(async () => {
                      const next = await callNext(tickets, orgId, c.id);
                      if (!next) {
                        toast("Nobody is waiting.");
                        return;
                      }
                      playCallChime();
                      toast.success(`Calling ${next.name} (${next.code}) to ${c.name}`);
                    })
                  }
                >
                  <PhoneCall className="size-4" /> Call to {c.name}
                </Button>
              ))
            ) : (
              <Button
                size="sm"
                onClick={() =>
                  act(async () => {
                    const next = await callNext(tickets, orgId);
                    if (!next) {
                      toast("Nobody is waiting.");
                      return;
                    }
                    playCallChime();
                    toast.success(`Calling ${next.name} (${next.code})`);
                  })
                }
              >
                <PhoneCall className="size-4" /> Call next
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {queue.length === 0 ? (
            <EmptyQueue servedToday={stats.servedToday} />
          ) : (
            queue.map((t) => (
              <QueueRow
                key={t.id}
                ticket={t}
                serviceName={org?.services.find((s) => s.id === t.serviceId)?.name}
                counters={counters}
                onCall={(counterId) =>
                  act(async () => {
                    await callTicket(t.id, counterId);
                    playCallChime();
                  })
                }
                onServe={() =>
                  act(async () => {
                    await markServed(t.id);
                    playSoftBlip();
                  }, `${t.code} served`)
                }
                onNoShow={() => act(() => markNoShow(t.id), `${t.code} marked as no-show`)}
              />
            ))
          )}
        </div>
      </section>

      {/* Walk-in intake form and check-in QR code side by side */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Add a walk-in</h2>
          <div className="mt-4 space-y-3">
            <Input
              aria-label="Walk-in visitor name"
              value={walkInName}
              onChange={(e) => setWalkInName(e.target.value)}
              placeholder="Visitor name"
            />
            {!!org?.services.length && (
              <select
                aria-label="Walk-in service"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={walkInService ?? ""}
                onChange={(e) => setWalkInService(e.target.value || undefined)}
              >
                <option value="">Any service</option>
                {org.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <div className="grid grid-cols-3 gap-2">
              {(["none", "elderly", "urgent"] as PriorityReason[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setWalkInPriority(p)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                    walkInPriority === p
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() =>
                act(async () => {
                  await addWalkIn({
                    orgId,
                    name: walkInName,
                    priority: walkInPriority,
                    serviceId: walkInService,
                  });
                  setWalkInName("");
                  setWalkInPriority("none");
                }, "Walk-in added to the queue")
              }
            >
              <UserPlus className="size-4" /> Add to queue
            </Button>
          </div>
        </div>

      </section>

      {/* Manager-only configuration: hours/pausing, counters and services */}
      {isManager && settings && (
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Coffee className="size-4" /> Breaks &amp; hours
            </h2>
            <div className="mt-4 space-y-4">
              <Row label="Pause new joins">
                <Switch
                  aria-label="Pause new joins"
                  checked={settings.paused}
                  onCheckedChange={(paused) =>
                    act(async () => {
                      await updateSettings(orgId, { paused });
                      await refreshSettings();
                    })
                  }
                />
              </Row>
              <Input
                aria-label="Pause message shown to visitors"
                value={settings.pauseNote}
                placeholder="Message shown to visitors while paused"
                onChange={(e) =>
                  void updateSettings(orgId, { pauseNote: e.target.value }).then(refreshSettings)
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="opens">Opens</Label>
                  <Input
                    id="opens"
                    type="time"
                    value={settings.opensAt}
                    onChange={(e) =>
                      void updateSettings(orgId, { opensAt: e.target.value }).then(refreshSettings)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="closes">Closes</Label>
                  <Input
                    id="closes"
                    type="time"
                    value={settings.closesAt}
                    onChange={(e) =>
                      void updateSettings(orgId, { closesAt: e.target.value }).then(refreshSettings)
                    }
                  />
                </div>
              </div>
              <Row label="Enforce opening hours">
                <Switch
                  aria-label="Enforce opening hours"
                  checked={settings.enforceHours}
                  onCheckedChange={(enforceHours) =>
                    void updateSettings(orgId, { enforceHours }).then(refreshSettings)
                  }
                />
              </Row>
              <Row label="Auto-reset the queue daily">
                <Switch
                  aria-label="Auto-reset the queue daily"
                  checked={settings.autoResetDaily}
                  onCheckedChange={(autoResetDaily) =>
                    void updateSettings(orgId, { autoResetDaily }).then(refreshSettings)
                  }
                />
              </Row>
              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={() => act(() => clearActiveQueue(orgId), "Live queue cleared")}
              >
                <Trash2 className="size-4" /> Clear the live queue
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            {/* Counter management: toggle active state, remove, or add new */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">Counters</h2>
              <div className="mt-4 space-y-2">
                {settings.counters.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <span className={c.active ? "font-medium" : "text-muted-foreground"}>
                      {c.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <Switch
                        aria-label={`Counter ${c.name} active`}
                        checked={c.active}
                        onCheckedChange={() =>
                          void toggleCounter(orgId, c.id).then(refreshSettings)
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove counter ${c.name}`}
                        onClick={() => void removeCounter(orgId, c.id).then(refreshSettings)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  aria-label="New counter name"
                  value={newCounter}
                  onChange={(e) => setNewCounter(e.target.value)}
                  placeholder="Counter name"
                />
                <Button
                  aria-label="Add counter"
                  onClick={() =>
                    act(async () => {
                      await addCounter(orgId, newCounter);
                      setNewCounter("");
                      await refreshSettings();
                    })
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {/* Service management: remove existing or add new services with an avg time */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">Services</h2>
              <div className="mt-4 space-y-2">
                {(org?.services ?? []).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <span className="font-medium">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">~{s.avgMinutes} min</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove service ${s.name}`}
                        onClick={() => void removeService(s.id)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  aria-label="New service name"
                  value={newService}
                  onChange={(e) => setNewService(e.target.value)}
                  placeholder="Service name"
                />
                <Input
                  className="w-20"
                  aria-label="Average minutes for new service"
                  type="number"
                  min={1}
                  value={newServiceMinutes}
                  onChange={(e) => setNewServiceMinutes(Number(e.target.value) || 1)}
                />
                <Button
                  disabled={!newService.trim()}
                  onClick={() =>
                    act(async () => {
                      await addService(orgId, newService, newServiceMinutes);
                      setNewService("");
                    })
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Manager-only analytics panel */}
      {isManager && (
        <AdvisoryPanel tickets={tickets} orgId={orgId} counters={settings?.counters ?? []} />
      )}

      {isManager && <InsightsPanel tickets={tickets} orgId={orgId} />}
    </div>
  );
}

/** Small labeled stat tile used in the dashboard header stats row. */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

/** Simple label + control row used in the settings forms. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

/** A single ticket row in the live queue, with call/serve/no-show actions. */
function QueueRow({
  ticket,
  serviceName,
  counters,
  onCall,
  onServe,
  onNoShow,
}: {
  ticket: Ticket;
  serviceName?: string;
  counters: { id: string; name: string }[];
  onCall: (counterId?: string) => void;
  onServe: () => void;
  onNoShow: () => void;
}) {
  const called = ticket.status === "called";
  return (
    <div
      className={`animate-fade-in flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${
        called ? "animate-called-pulse border-accent-warm bg-accent-warm-soft" : "border-border"
      }`}
    >
      <div className="min-w-0">
        <p className="font-display text-lg font-bold">{ticket.code}</p>
        <p className="truncate text-sm text-muted-foreground">
          {ticket.name}
          {serviceName ? ` · ${serviceName}` : ""}
          {ticket.priority !== "none" ? ` · ${PRIORITY_LABEL[ticket.priority]}` : ""}
          {called && counterName(ticket.orgId, ticket.counterId)
            ? ` · ${counterName(ticket.orgId, ticket.counterId)}`
            : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!called &&
          (counters.length ? (
            counters.map((c) => (
              <Button key={c.id} size="sm" variant="outline" onClick={() => onCall(c.id)}>
                Call to {c.name}
              </Button>
            ))
          ) : (
            <Button size="sm" variant="outline" onClick={() => onCall()}>
              Call
            </Button>
          ))}
        {called && (
          <Button size="sm" onClick={onServe}>
            Served
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onNoShow}>
          No-show
        </Button>
      </div>
    </div>
  );
}
