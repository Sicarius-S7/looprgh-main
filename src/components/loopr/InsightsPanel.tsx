/**
 * InsightsPanel
 * Staff-facing analytics dashboard for one location: weekly served/wait
 * trends, peak hours, live service time, satisfaction, and a CSV export.
 */
import { Download, Star, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadCsv, orgInsights, ticketsToCsv } from "@/lib/loopr-insights";
import { getOrg, type Ticket } from "@/lib/loopr-store";

/** Weekly trends, peak hours, live service time and satisfaction for one location. */
export function InsightsPanel({ tickets, orgId }: { tickets: Ticket[]; orgId: string }) {
  // Derived insight metrics and chart scaling bounds computed from raw tickets.
  const insights = orgInsights(tickets, orgId);
  const maxServed = Math.max(1, ...insights.days.map((d) => d.served));
  const maxWait = Math.max(1, ...insights.days.map((d) => d.averageWaitMinutes));
  const busyHours = insights.hours.filter((h) => h.joins > 0);
  const maxJoins = Math.max(1, ...busyHours.map((h) => h.joins));

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Insights</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Last 7 days at {getOrg(orgId)?.name}.
          </p>
        </div>
        {/* Exports the current ticket set for this org as a downloadable CSV. */}
        <Button
          variant="outline"
          onClick={() => {
            const csv = ticketsToCsv(tickets, orgId);
            downloadCsv(`loopr-${orgId}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            toast.success("CSV exported.");
          }}
        >
          <Download className="mr-2 size-4" /> Export CSV
        </Button>
      </div>

      {/* Top-level summary metrics for the last 7 days. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Served (7 days)" value={insights.servedWeek} />
        <Metric
          label="Avg wait (7 days)"
          value={insights.averageWaitWeek ? `${insights.averageWaitWeek} min` : "—"}
        />
        <Metric
          label="Real service time"
          value={
            insights.measuredServiceMinutes
              ? `${insights.measuredServiceMinutes} min`
              : `${insights.configuredServiceMinutes} min*`
          }
          hint={
            insights.measuredServiceMinutes
              ? "Measured from served tickets"
              : "*Configured estimate — not enough served tickets yet"
          }
        />
        <Metric
          label="Satisfaction"
          value={
            insights.satisfactionAverage ? `${insights.satisfactionAverage} / 5` : "—"
          }
          hint={
            insights.satisfactionCount
              ? `${insights.satisfactionCount} rating${insights.satisfactionCount === 1 ? "" : "s"}`
              : "No ratings yet"
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Daily served count vs. average wait time, rendered as paired bar chips. */}
        <div>
          <h3 className="text-sm font-semibold">Daily served & average wait</h3>
          <ul className="mt-3 space-y-2">
            {insights.days.map((d) => (
              <li key={d.key} className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-xs text-muted-foreground">
                  {d.label}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="h-2 rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-brand"
                      style={{ width: `${(d.served / maxServed) * 100}%` }}
                    />
                  </div>
                  <div className="h-2 rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-accent-warm"
                      style={{ width: `${(d.averageWaitMinutes / maxWait) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                  {d.served} · {d.averageWaitMinutes}m
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-brand" /> Served
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-accent-warm" /> Avg wait
            </span>
          </p>
        </div>

        {/* Hourly join volume bar chart, showing when the location gets busiest. */}
        <div>
          <h3 className="text-sm font-semibold">Peak hours</h3>
          {busyHours.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No joins recorded in the last 7 days yet.
            </p>
          ) : (
            <>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="size-3.5 text-brand" />
                Busiest at {insights.busiestHour?.label} ({insights.busiestHour?.joins}{" "}
                joins)
              </p>
              <ul className="mt-3 flex h-32 items-end gap-1">
                {busyHours.map((h) => (
                  <li
                    key={h.hour}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  >
                    <div
                      className="w-full rounded-t bg-brand"
                      style={{ height: `${Math.max(8, (h.joins / maxJoins) * 100)}px` }}
                      title={`${h.label} — ${h.joins} joins`}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {String(h.hour).padStart(2, "0")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Share of closed tickets that were abandoned rather than completed. */}
          <div className="mt-5 rounded-2xl border border-border p-3">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <Star className="size-3.5 text-accent-warm" /> Abandon rate
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {insights.abandonRate}% of closed tickets were no-shows or left the queue.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Small labeled stat tile used across the metrics grid, with an optional hint line. */
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
    <div className="rounded-2xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
