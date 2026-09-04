/**
 * Analytics helpers for a location: rolling insights (throughput, waits,
 * peak hours, satisfaction) and CSV export of ticket history.
 */
import {
  getOrg,
  getService,
  measuredServiceMinutes,
  PRIORITY_LABEL,
  type Ticket,
} from "@/lib/loopr-store";

export type DayPoint = {
  key: string;
  label: string;
  served: number;
  averageWaitMinutes: number;
};

export type HourPoint = {
  hour: number;
  label: string;
  joins: number;
};

export type Insights = {
  days: DayPoint[];
  hours: HourPoint[];
  busiestHour: HourPoint | null;
  servedWeek: number;
  averageWaitWeek: number;
  measuredServiceMinutes: number | undefined;
  configuredServiceMinutes: number;
  satisfactionAverage: number | null;
  satisfactionCount: number;
  abandonRate: number;
};

// Stable per-day cache/grouping key, e.g. "2024-01-05".
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Waiting time a served ticket actually experienced, in minutes. */
export function waitedMinutes(t: Ticket): number {
  const end = t.calledAt ?? t.closedAt;
  if (!end) return 0;
  return Math.max(0, (end - t.joinedAt) / 60000);
}

/** Rolling 7-day view of throughput, waits, peak hours and satisfaction. */
export function orgInsights(tickets: Ticket[], orgId: string, days = 7): Insights {
  const forOrg = tickets.filter((t) => t.orgId === orgId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));

  const recent = forOrg.filter((t) => t.joinedAt >= start.getTime());

  const dayPoints: DayPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    const served = forOrg.filter(
      (t) => t.status === "served" && t.closedAt && dayKey(new Date(t.closedAt)) === key,
    );
    const waits = served.map(waitedMinutes);
    dayPoints.push({
      key,
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      served: served.length,
      averageWaitMinutes: waits.length
        ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
        : 0,
    });
  }

  const hours: HourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    joins: recent.filter((t) => new Date(t.joinedAt).getHours() === hour).length,
  }));
  const busiestHour = hours.reduce<HourPoint | null>(
    (best, h) => (h.joins > 0 && (!best || h.joins > best.joins) ? h : best),
    null,
  );

  const servedRecent = recent.filter((t) => t.status === "served");
  const weekWaits = servedRecent.map(waitedMinutes);
  const rated = forOrg.filter((t) => typeof t.rating === "number");
  const closed = recent.filter((t) =>
    ["served", "no_show", "left"].includes(t.status),
  ).length;
  const abandoned = recent.filter((t) => t.status === "left" || t.status === "no_show")
    .length;

  return {
    days: dayPoints,
    hours,
    busiestHour,
    servedWeek: servedRecent.length,
    averageWaitWeek: weekWaits.length
      ? Math.round(weekWaits.reduce((a, b) => a + b, 0) / weekWaits.length)
      : 0,
    measuredServiceMinutes: measuredServiceMinutes(tickets, orgId),
    configuredServiceMinutes: getOrg(orgId)?.avgServiceMinutes ?? 0,
    satisfactionAverage: rated.length
      ? Math.round(
          (rated.reduce((sum, t) => sum + (t.rating ?? 0), 0) / rated.length) * 10,
        ) / 10
      : null,
    satisfactionCount: rated.length,
    abandonRate: closed ? Math.round((abandoned / closed) * 100) : 0,
  };
}

// Escapes a value for safe inclusion in a CSV cell (quotes commas/quotes/newlines).
function csvCell(value: string | number | undefined) {
  const s = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Column headers for the exported ticket-history CSV.
const HEADERS = [
  "ticket",
  "name",
  "service",
  "priority",
  "status",
  "joined_at",
  "called_at",
  "closed_at",
  "waited_minutes",
  "service_minutes",
  "source",
  "counter",
  "rating",
];

/** Flattens this location's ticket history into a spreadsheet-ready CSV. */
export function ticketsToCsv(tickets: Ticket[], orgId: string): string {
  const rows = tickets
    .filter((t) => t.orgId === orgId)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((t) =>
      [
        t.code,
        t.name,
        getService(t.orgId, t.serviceId)?.name ?? "",
        PRIORITY_LABEL[t.priority],
        t.status,
        new Date(t.joinedAt).toISOString(),
        t.calledAt ? new Date(t.calledAt).toISOString() : "",
        t.closedAt ? new Date(t.closedAt).toISOString() : "",
        Math.round(waitedMinutes(t)),
        t.calledAt && t.closedAt
          ? Math.round((t.closedAt - t.calledAt) / 60000)
          : "",
        t.kiosk ? "kiosk" : t.walkIn ? "walk-in" : "remote",
        t.counterId ?? "",
        t.rating ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  return [HEADERS.join(","), ...rows].join("\n");
}

/** Triggers a browser download of CSV text as a file. */
export function downloadCsv(filename: string, contents: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}