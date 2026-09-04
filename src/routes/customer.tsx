/**
 * Customer-facing "join the queue" route (`/customer`).
 *
 * Walks a visitor through picking their name, a location, and a service,
 * then issues a digital ticket. Once a ticket exists, this page becomes a
 * live status screen showing queue position/estimated wait, sends
 * vibration/push alerts on state changes, and lets the visitor rate their
 * visit or leave the queue.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bell, BellRing, Clock, LogOut, Ticket as TicketIcon } from "lucide-react";
import { toast } from "sonner";
import { LooprLogo } from "@/components/loopr/LooprLogo";
import { OrgCard } from "@/components/loopr/OrgCard";
import { RatingCard } from "@/components/loopr/RatingCard";
import { ThemeToggle } from "@/components/loopr/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useOrganizations, useOrgSettings, usePublicQueue, useTick } from "@/hooks/use-loopr";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { HAPTIC_CALLED, HAPTIC_NEXT, HAPTIC_TAP, vibrate } from "@/lib/loopr-feedback";
import {
  counterName,
  estimatedWaitMinutes,
  fetchMyTicket,
  formatWait,
  joinQueue,
  leaveQueue,
  PRIORITY_LABEL,
  queueAvailability,
  readMyTicket,
  saveMyTicket,
  ticketPosition,
  type PriorityReason,
  type Ticket,
} from "@/lib/loopr-store";

type MyTicketRef = { id: string; token: string };

// Route definition: reads an optional `org` query param (shared location link)
// and sets page metadata.
export const Route = createFileRoute("/customer")({
  validateSearch: (search: Record<string, unknown>) => ({
    org: typeof search["org"] === "string" ? (search["org"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Join the queue — Loopr" },
      {
        name: "description",
        content:
          "Join a live queue from your phone, watch your position update in real time, and get alerted the moment you're called.",
      },
      { property: "og:title", content: "Join the queue — Loopr" },
      {
        property: "og:description",
        content: "Take a digital ticket and track your place in line in real time.",
      },
    ],
  }),
  component: CustomerPage,
});

// Priority options offered to visitors when joining a queue.
const PRIORITIES: PriorityReason[] = ["none", "elderly", "urgent"];

function CustomerPage() {
  // `org` query param preselects a location when linked to directly.
  const { org: orgParam } = Route.useSearch();
  const { orgs, loaded: orgsLoaded } = useOrganizations();
  const orgIds = useMemo(() => orgs.map((o) => o.id), [orgs]);
  const { tickets } = usePublicQueue(orgIds);
  // Force periodic re-renders so position/wait estimates stay current.
  useTick(20000);

  // The visitor's own ticket: `ref` is the persisted id/token pair used to
  // re-fetch it, `myTicket` is the live ticket data, and `restored` tracks
  // whether we've finished checking localStorage for an existing ticket.
  const [ref, setRef] = useState<MyTicketRef | null>(null);
  const [myTicket, setMyTicket] = useState<Ticket | null>(null);
  const [restored, setRestored] = useState(false);

  // Multi-step "join queue" form state (name -> place -> service).
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<PriorityReason>("none");
  const [step, setStep] = useState<"name" | "place" | "service">("name");
  const [busy, setBusy] = useState(false);

  const { settings } = useOrgSettings(orgId);
  // Whether the selected org is currently accepting new visitors (paused/hours).
  const availability = queueAvailability(settings);
  const { permission, request, notify } = usePushNotifications();

  /* restore an existing ticket on load */
  useEffect(() => {
    const saved = readMyTicket();
    if (!saved) {
      setRestored(true);
      return;
    }
    setRef(saved);
    void fetchMyTicket(saved).then((t) => {
      if (!t || t.status === "left") {
        saveMyTicket(null);
        setRef(null);
      } else {
        setMyTicket(t);
      }
      setRestored(true);
    });
  }, []);

  /* keep the live ticket fresh */
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    const sync = async () => {
      const t = await fetchMyTicket(ref);
      if (alive) setMyTicket(t);
    };
    void sync();
    const id = window.setInterval(sync, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [ref]);

  /* preselect a location from an ?org= link */
  useEffect(() => {
    if (!orgParam || !orgsLoaded || orgId) return;
    const match = orgs.find((o) => o.id === orgParam || o.slug === orgParam);
    if (match) setOrgId(match.id);
  }, [orgParam, orgs, orgsLoaded, orgId]);

  // The ticket is only "active" while waiting or called; once served/left/
  // no-show it falls back to a terminal status display.
  const activeTicket =
    myTicket && (myTicket.status === "waiting" || myTicket.status === "called")
      ? myTicket
      : null;

  // The public queue snapshot may not yet include our own just-created
  // ticket, so merge it in locally for accurate position/wait calculations.
  const merged = useMemo(() => {
    if (!activeTicket) return tickets;
    return tickets.some((t) => t.id === activeTicket.id)
      ? tickets
      : [...tickets, activeTicket];
  }, [tickets, activeTicket]);

  // Derived queue position/estimated wait and convenience booleans.
  const position = activeTicket ? ticketPosition(merged, activeTicket.id) : -1;
  const wait = activeTicket ? estimatedWaitMinutes(merged, activeTicket.id) : 0;
  const isNext = position === 1 && activeTicket?.status === "waiting";
  const isCalled = activeTicket?.status === "called";

  /* alert on state transitions */
  // Tracks the last alerted state so we only vibrate/notify once per transition.
  const lastState = useRef<string>("");
  useEffect(() => {
    const state = isCalled ? "called" : isNext ? "next" : activeTicket ? "waiting" : "none";
    if (state === lastState.current) return;
    lastState.current = state;
    if (state === "called") {
      vibrate(HAPTIC_CALLED);
      notify("It's your turn", `Ticket ${activeTicket?.code} — head to the counter.`);
    } else if (state === "next") {
      vibrate(HAPTIC_NEXT);
      notify("You're next", `Ticket ${activeTicket?.code} — stay close by.`);
    }
  }, [isCalled, isNext, activeTicket, notify]);

  // Currently selected organization (used for its services and display name).
  const selectedOrg = orgs.find((o) => o.id === orgId) ?? null;

  // Creates a new ticket for the visitor and persists the id/token locally.
  const submit = async () => {
    if (!orgId) return;
    setBusy(true);
    try {
      const created = await joinQueue({ orgId, name, priority, serviceId });
      saveMyTicket({ id: created.id, token: created.token });
      setRef({ id: created.id, token: created.token });
      vibrate(HAPTIC_TAP);
      toast.success(`You're in — ticket ${created.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join the queue.");
    } finally {
      setBusy(false);
    }
  };

  // Leaves the active queue and clears all local ticket state.
  const leave = async () => {
    if (!ref) return;
    try {
      await leaveQueue(ref);
      saveMyTicket(null);
      setRef(null);
      setMyTicket(null);
      setStep("name");
      toast("You left the queue.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not leave the queue.");
    }
  };

  // Clears a terminal (served/left/no-show) ticket so the visitor can join again.
  const dismissTicket = () => {
    saveMyTicket(null);
    setRef(null);
    setMyTicket(null);
    setStep("name");
  };

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="mx-auto flex max-w-lg items-center justify-between px-5 py-5">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
          <span className="sr-only">Back to home</span>
        </Link>
        <LooprLogo />
        <ThemeToggle />
      </header>

      <div className="mx-auto max-w-lg px-5">
        {/* Loading state, live ticket status view, or the join-queue wizard */}
        {!restored ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading your ticket…</p>
        ) : myTicket ? (
          <section className="animate-fade-in">
            <h1 className="sr-only">Your queue ticket</h1>
            <div
              className={`animate-pop-in rounded-3xl border p-6 text-center ${
                isCalled || isNext
                  ? "animate-called-pulse border-accent-warm bg-accent-warm-soft"
                  : "border-border bg-card"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {selectedOrgName(orgs, myTicket.orgId)}
              </p>
              <p className="mt-3 font-display text-6xl font-bold tracking-tight">
                {myTicket.code}
              </p>

              {isCalled ? (
                <p className="mt-4 text-lg font-semibold text-accent-warm">
                  It's your turn
                  {counterName(myTicket.orgId, myTicket.counterId)
                    ? ` — ${counterName(myTicket.orgId, myTicket.counterId)}`
                    : ""}
                </p>
              ) : myTicket.status === "waiting" ? (
                <>
                  <p className="mt-4 text-lg font-semibold">
                    {isNext ? "You're next!" : `${position} in line`}
                  </p>
                  <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="size-4" /> {formatWait(wait)}
                  </p>
                </>
              ) : (
                <p className="mt-4 text-lg font-semibold">
                  {myTicket.status === "served"
                    ? "Served — thanks for visiting"
                    : myTicket.status === "no_show"
                      ? "Marked as a no-show"
                      : "You left this queue"}
                </p>
              )}

              {myTicket.priority !== "none" && (
                <span className="mt-4 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                  {PRIORITY_LABEL[myTicket.priority]} priority
                </span>
              )}
            </div>

            {/* Offer to enable push notifications while the ticket is active */}
            {activeTicket && permission === "default" && (
              <Button
                variant="outline"
                className="mt-4 h-12 w-full rounded-xl"
                onClick={async () => {
                  const ok = await request();
                  if (ok) toast.success("We'll alert you when it's your turn.");
                }}
              >
                <Bell className="size-4" /> Alert me when I'm called
              </Button>
            )}
            {activeTicket && permission === "granted" && (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <BellRing className="size-3.5" /> Alerts are on for this ticket
              </p>
            )}

            {/* After being served, let the visitor rate the experience */}
            {myTicket.status === "served" && ref && (
              <RatingCard
                ticket={myTicket}
                ticketRef={ref}
                onRated={() => void fetchMyTicket(ref).then(setMyTicket)}
              />
            )}

            {/* Leave-queue confirmation for active tickets, or a "join another
                queue" action once the ticket has reached a terminal state */}
            {activeTicket ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="mt-4 h-12 w-full rounded-xl text-destructive">
                    <LogOut className="size-4" /> Leave the queue
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave the queue?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You'll lose ticket {myTicket.code} and your place in line. You can always
                      join again, but you'll start at the back.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Stay in line</AlertDialogCancel>
                    <AlertDialogAction onClick={leave}>Leave queue</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                variant="outline"
                className="mt-4 h-12 w-full rounded-xl"
                onClick={dismissTicket}
              >
                Join another queue
              </Button>
            )}
          </section>
        ) : step === "name" ? (
          // Step 1: collect the visitor's name.
          <section className="animate-fade-in">
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Skip the physical line
            </h1>
            <p className="mt-2 text-muted-foreground">
              Take a digital ticket and track your place in real time.
            </p>
            <div className="mt-6 space-y-2">
              <Label htmlFor="customer-name">Your name</Label>
              <Input
                id="customer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kwame"
                className="h-12 rounded-xl bg-card"
              />
            </div>
            <Button
              className="mt-6 h-12 w-full rounded-xl"
              disabled={!name.trim()}
              onClick={() => {
                vibrate(HAPTIC_TAP);
                setStep("place");
              }}
            >
              Continue
            </Button>
          </section>
        ) : step === "place" ? (
          // Step 2: pick which location/organization to queue at.
          <section className="animate-fade-in">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Where are you headed?
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a location to see the current wait.
            </p>
            <div className="mt-5 space-y-3">
              {!orgsLoaded && (
                <p className="text-sm text-muted-foreground">Loading locations…</p>
              )}
              {orgs.map((o) => (
                <OrgCard
                  key={o.id}
                  org={o}
                  waiting={
                    tickets.filter((t) => t.orgId === o.id && t.status === "waiting").length
                  }
                  selected={orgId === o.id}
                  onSelect={() => {
                    vibrate(HAPTIC_TAP);
                    setOrgId(o.id);
                    setServiceId(undefined);
                  }}
                />
              ))}
            </div>
            {orgId && !availability.accepting && (
              <p className="mt-5 rounded-xl border border-accent-warm bg-accent-warm-soft p-3 text-sm">
                {availability.note}
              </p>
            )}
            <Button
              className="mt-6 h-12 w-full rounded-xl"
              disabled={!orgId || !availability.accepting}
              onClick={() => setStep("service")}
            >
              Continue
            </Button>
          </section>
        ) : (
          // Step 3: pick a service (if any) and priority, then submit to get a ticket.
          <section className="animate-fade-in">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              What do you need today?
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{selectedOrg?.name}</p>

            <div className="mt-5 space-y-2">
              {(selectedOrg?.services ?? []).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceId(s.id)}
                  className={`flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-left ${
                    serviceId === s.id ? "border-brand ring-2 ring-brand/25" : "border-border"
                  }`}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">~{s.avgMinutes} min</span>
                </button>
              ))}
              {!selectedOrg?.services.length && (
                <p className="text-sm text-muted-foreground">
                  This location handles all visits at one desk.
                </p>
              )}
            </div>

            <p className="mt-6 text-sm font-medium">Priority</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
                    priority === p
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>

            {!availability.accepting && (
              <p className="mt-5 rounded-xl border border-accent-warm bg-accent-warm-soft p-3 text-sm">
                {availability.note}
              </p>
            )}

            <Button
              className="mt-6 h-12 w-full rounded-xl"
              disabled={busy || !availability.accepting || (!!selectedOrg?.services.length && !serviceId)}
              onClick={submit}
            >
              <TicketIcon className="size-4" /> {busy ? "Joining…" : "Get my ticket"}
            </Button>
            <Button variant="ghost" className="mt-2 h-11 w-full" onClick={() => setStep("place")}>
              Back
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}

/** Looks up a display name for an org id, falling back to a generic label. */
function selectedOrgName(orgs: { id: string; name: string }[], orgId: string) {
  return orgs.find((o) => o.id === orgId)?.name ?? "Your location";
}
