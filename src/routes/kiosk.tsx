import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { LooprLogo } from "@/components/loopr/LooprLogo";
import { ThemeToggle } from "@/components/loopr/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOrganizations, useOrgSettings, usePublicQueue } from "@/hooks/use-loopr";
import { playSoftBlip } from "@/lib/loopr-feedback";
import {
  estimatedWaitMinutes,
  formatWait,
  joinQueue,
  PRIORITY_LABEL,
  queueAvailability,
  type PriorityReason,
} from "@/lib/loopr-store";

/**
 * Kiosk route (/kiosk).
 * A full-screen, self-service check-in station meant to run unattended on a
 * tablet at a location. A walk-in picks a service and priority, optionally
 * types their name, and receives a ticket code. The screen then resets itself
 * for the next person. No account is required — tickets are created through
 * the public join_queue backend function.
 */
export const Route = createFileRoute("/kiosk")({
  // ?org=<id|slug> lets a kiosk be permanently pinned to one location.

  validateSearch: (search: Record<string, unknown>) => ({
    org: typeof search["org"] === "string" ? (search["org"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Self check-in kiosk — Loopr" },
      {
        name: "description",
        content:
          "Full-screen self-service kiosk for walk-in visitors to take a queue ticket at the counter.",
      },
      { property: "og:title", content: "Self check-in kiosk — Loopr" },
      {
        property: "og:description",
        content: "Walk-in visitors take their own ticket in seconds.",
      },
    ],
  }),
  component: KioskPage,
});

/**
 * Staff-only exit PIN. Kiosk mode is customer-facing, so the way out is a
 * deliberately hidden gesture (press and hold the Loopr logo for 2 seconds)
 * followed by this PIN, rather than a visible "Exit" button.
 */
const KIOSK_EXIT_PIN = "9000";
const HOLD_MS = 2000;

// Priority options offered on the kiosk, in display order.
const PRIORITIES: PriorityReason[] = ["none", "elderly", "urgent"];

function KioskPage() {
  const { org: orgParam } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { orgs, loaded } = useOrganizations();
  // Which location this kiosk is currently serving.
  const [orgId, setOrgId] = useState<string | null>(null);
  // Set once the operator taps "Change location" so the ?org= param below
  // does not immediately re-select the location we just cleared.
  const clearedRef = useRef(false);
  const orgIds = useMemo(() => (orgId ? [orgId] : []), [orgId]);
  // Live public queue for this location (polled) + opening-hours/pause settings.
  const { tickets, refresh } = usePublicQueue(orgIds, 4000);
  const { settings } = useOrgSettings(orgId);
  const availability = queueAvailability(settings);

  // Form state for the person currently standing at the kiosk.
  const [name, setName] = useState("");
  const [serviceId, setServiceId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<PriorityReason>("none");
  const [issued, setIssued] = useState<{ id: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);

  /* ---- hidden staff exit: hold the logo 2s, then confirm with a PIN ---- */
  const holdTimer = useRef<number | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPin, setExitPin] = useState("");
  const [exitError, setExitError] = useState(false);

  // Start/cancel the press-and-hold timer on the logo.
  const startHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      setExitPin("");
      setExitError(false);
      setExitOpen(true);
    }, HOLD_MS);
  };
  const cancelHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(() => cancelHold, []);

  // Validate the PIN and return to the staff dashboard for this location.
  const confirmExit = () => {
    if (exitPin.trim() !== KIOSK_EXIT_PIN) {
      setExitError(true);
      return;
    }
    setExitOpen(false);
    void navigate({ to: "/staff" });
  };

  // Pin the kiosk to the location named in the URL (?org=id-or-slug).
  useEffect(() => {
    if (!orgParam || !loaded || orgId || clearedRef.current) return;
    const match = orgs.find((o) => o.id === orgParam || o.slug === orgParam);
    if (match) setOrgId(match.id);
  }, [orgParam, orgs, loaded, orgId]);

  // Return to the location picker and drop any in-progress form/URL state.
  const changeLocation = () => {
    clearedRef.current = true;
    setOrgId(null);
    setIssued(null);
    setName("");
    setServiceId(undefined);
    setPriority("none");
    if (orgParam) void navigate({ to: "/kiosk", search: { org: undefined }, replace: true });
  };

  // Operator chose a location from the picker.
  const pickOrg = (id: string) => {
    clearedRef.current = false;
    setOrgId(id);
    setServiceId(undefined);
  };

  /* auto-reset the screen for the next person */
  useEffect(() => {
    if (!issued) return;
    const id = window.setTimeout(() => {
      setIssued(null);
      setName("");
      setServiceId(undefined);
      setPriority("none");
    }, 12000);
    return () => window.clearTimeout(id);
  }, [issued]);

  const org = orgs.find((o) => o.id === orgId) ?? null;
  const waiting = tickets.filter((t) => t.status === "waiting").length;

  // Create the ticket through the public backend function and show the code.
  const issue = async () => {
    if (!orgId) return;
    setBusy(true);
    try {
      const created = await joinQueue({
        orgId,
        name: name.trim() || "Walk-in",
        priority,
        serviceId,
        kiosk: true,
      });
      playSoftBlip();
      setIssued({ id: created.id, code: created.code });
      void refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not issue a ticket.");
    } finally {
      setBusy(false);
    }
  };

  // Step 1 — no location chosen yet: show the one-time location picker.
  if (!orgId) {
    return (
      <main className="min-h-screen bg-background px-6 py-10">
        <header className="mx-auto flex max-w-3xl items-center justify-between">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
            <span className="sr-only">Back to home</span>
          </Link>
          <LooprLogo />
          <ThemeToggle />
        </header>
        <div className="mx-auto mt-12 max-w-3xl">
          <h1 className="font-display text-3xl font-bold tracking-tight">Choose this kiosk's location</h1>
          <p className="mt-2 text-muted-foreground">
            Pick the location this screen sits in. Visitors then take their own ticket.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {orgs.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pickOrg(o.id)}
                className="rounded-2xl border border-border bg-card p-5 text-left hover:border-brand"
              >
                <p className="text-lg font-semibold">{o.name}</p>
                <p className="text-sm text-muted-foreground">{o.category}</p>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // Step 2 — kiosk screen: either the check-in form, or the issued ticket.
  return (
    <main className="flex min-h-screen flex-col bg-background px-6 py-8">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between">
        {/* Hidden staff exit: press and hold for 2 seconds to open the PIN dialog. */}
        <span
          role="button"
          tabIndex={-1}
          aria-label="Loopr"
          className="cursor-default select-none"
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
        >
          <LooprLogo />
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" onClick={changeLocation}>
            Change location
          </Button>
        </div>
      </header>

      {/* Staff PIN confirmation before leaving kiosk mode. */}
      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Exit kiosk mode</DialogTitle>
            <DialogDescription>
              Enter the staff PIN to return to the dashboard.
            </DialogDescription>
          </DialogHeader>
          <Input
            id="kiosk-exit-pin"
            aria-label="Staff PIN"
            type="password"
            inputMode="numeric"
            autoFocus
            value={exitPin}
            onChange={(e) => {
              setExitPin(e.target.value);
              setExitError(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && confirmExit()}
            placeholder="PIN"
          />
          {exitError && <p className="text-sm text-destructive">Incorrect PIN.</p>}
          <Button onClick={confirmExit}>Exit to dashboard</Button>
        </DialogContent>
      </Dialog>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-10">
        {/* Confirmation screen (auto-clears after 12s), otherwise the form. */}
        {issued ? (
          <div className="animate-pop-in rounded-3xl border border-brand bg-brand-soft p-12 text-center">
            <h1 className="sr-only">Your ticket</h1>
            <Check className="mx-auto size-12 text-brand" />
            <p className="mt-4 text-lg font-medium text-brand">Your ticket</p>
            <p className="mt-2 font-display text-7xl font-bold tracking-tight text-brand">
              {issued.code}
            </p>
            <p className="mt-4 text-muted-foreground">
              Estimated wait {formatWait(estimatedWaitMinutes(tickets, issued.id))}. Please keep
              an eye on the screen.
            </p>
          </div>
        ) : (
          <div className="animate-fade-in">
            <h1 className="font-display text-4xl font-bold tracking-tight">{org?.name}</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              {waiting} {waiting === 1 ? "person" : "people"} waiting right now.
            </p>

            {!availability.accepting ? (
              <p className="mt-8 rounded-2xl border border-accent-warm bg-accent-warm-soft p-6 text-lg">
                {availability.note}
              </p>
            ) : (
              <>
                <Input
                  className="mt-8 h-16 rounded-2xl bg-card text-xl"
                  id="kiosk-name"
                  aria-label="Your name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                />

                {!!org?.services.length && (
                  <>
                    <p className="mt-8 text-sm font-medium uppercase tracking-widest text-muted-foreground">
                      What do you need?
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {org.services.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setServiceId(s.id)}
                          className={`rounded-2xl border bg-card px-5 py-4 text-left text-lg ${
                            serviceId === s.id
                              ? "border-brand ring-2 ring-brand/25"
                              : "border-border"
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <p className="mt-8 text-sm font-medium uppercase tracking-widest text-muted-foreground">
                  Priority
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`rounded-2xl border px-4 py-4 text-lg font-medium ${
                        priority === p
                          ? "border-brand bg-brand-soft text-brand"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </div>

                <Button
                  className="mt-10 h-16 w-full rounded-2xl text-xl"
                  disabled={busy || (!!org?.services.length && !serviceId)}
                  onClick={issue}
                >
                  {busy ? "Printing…" : "Take my ticket"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
