/**
 * AdvisoryPanel
 * Manager-facing staffing advisory for one location. Everything shown here is
 * rule-based queueing theory (Erlang-C, Little's Law) — no ML — and every card
 * prints the inputs (lambda, mu, c, rho, expected wait) that produced it.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  computeAdvisory,
  formatMinutes,
  type AdvisoryCard,
} from "@/lib/loopr-advisory";
import { PRIORITY_LABEL, type Counter, type Ticket } from "@/lib/loopr-store";

const TONE_ICON = {
  warn: AlertTriangle,
  good: CheckCircle2,
  info: Info,
} as const;

const TONE_CLASS = {
  warn: "border-accent-warm bg-accent-warm-soft",
  good: "border-brand bg-brand-soft",
  info: "border-border bg-muted/40",
} as const;

/** Recomputes the advisory on mount, when tickets change, and every 60s. */
export function AdvisoryPanel({
  tickets,
  orgId,
  counters,
}: {
  tickets: Ticket[];
  orgId: string;
  counters: Counter[];
}) {
  // Bumped by the 60-second timer (and the manual refresh) to force a recompute.
  const [stamp, setStamp] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setStamp(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const advisory = useMemo(
    () => computeAdvisory(tickets, orgId, counters, {}, stamp),
    [tickets, orgId, counters, stamp],
  );

  // Small "why" line reused under every recommendation card.
  const inputs = `λ ${advisory.lambda}/h (${advisory.lambdaSource}) · μ ${advisory.mu}/h per counter (${advisory.serviceMinutes} min service${advisory.serviceMeasured ? ", measured" : ", estimated"}) · c ${advisory.counters} · ρ ${Math.round(advisory.rho * 100)}% · P(wait) ${Math.round(advisory.waitProbability * 100)}% · Wq ${formatMinutes(advisory.waitNow)}`;

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Manager advisory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Erlang-C staffing guidance from live and historical tickets. Recalculated every
            minute.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setStamp(Date.now())}>
          <RefreshCw className="mr-2 size-4" /> Recalculate
        </Button>
      </div>

      {/* Raw model inputs, always visible so nothing is a black box. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Arrivals λ" value={`${advisory.lambda}/h`} hint={advisory.lambdaSource} />
        <Metric label="Service μ" value={`${advisory.mu}/h`} hint={`${advisory.serviceMinutes} min each`} />
        <Metric label="Counters c" value={advisory.counters} />
        <Metric label="Utilisation ρ" value={`${Math.round(advisory.rho * 100)}%`} />
        <Metric
          label="P(wait)"
          value={`${Math.round(advisory.waitProbability * 100)}%`}
          hint="Erlang-C"
        />
        <Metric label="Expected wait" value={formatMinutes(advisory.waitNow)} />
      </div>

      {/* Scenario comparison: what one more / one fewer counter would do. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Metric label={`With ${advisory.counters + 1} counters`} value={formatMinutes(advisory.waitPlusOne)} />
        <Metric label={`With ${advisory.counters} counters (now)`} value={formatMinutes(advisory.waitNow)} />
        <Metric
          label={`With ${Math.max(0, advisory.counters - 1)} counters`}
          value={advisory.counters > 1 ? formatMinutes(advisory.waitMinusOne) : "n/a"}
        />
      </div>

      {/* Plain-language recommendations. */}
      <div className="mt-5 space-y-3">
        {advisory.cards.map((card) => (
          <Card key={card.id} card={card} inputs={inputs} />
        ))}
      </div>

      {/* Little's Law consistency check (L ≈ λW). */}
      <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium">Little's Law check (L ≈ λ·W)</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Queue length L = {advisory.littlesLawL} · λ = {advisory.lambda}/h · average measured
          wait W = {advisory.averageWait} min → λ·W ≈ {advisory.littlesLawPredicted}. Gap{" "}
          {Math.round(advisory.littlesLawGap * 100)}%.
        </p>
        {advisory.staleTickets.length > 0 && (
          <ul className="mt-3 space-y-2">
            {advisory.staleTickets.map(({ ticket, minutes }) => (
              <li
                key={ticket.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium">
                  {ticket.code} · {ticket.name}
                  {ticket.priority !== "none" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {PRIORITY_LABEL[ticket.priority]}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {ticket.status} for {minutes} min — needs review
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** One recommendation with the numbers that produced it. */
function Card({ card, inputs }: { card: AdvisoryCard; inputs: string }) {
  const Icon = TONE_ICON[card.tone];
  return (
    <div className={`rounded-2xl border p-4 ${TONE_CLASS[card.tone]}`}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="size-4" /> {card.title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{card.body}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">{inputs}</p>
    </div>
  );
}

/** Compact labelled figure used across the panel. */
function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
