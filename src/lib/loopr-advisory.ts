/**
 * Manager advisory engine (queueing theory, no ML).
 *
 * Everything here is rule-based and formula-driven: arrival rate (lambda),
 * service rate (mu), active counters (c), utilisation (rho), Erlang-C wait
 * probability / expected wait, a historical same-hour comparison, and a
 * Little's Law (L ≈ λW) consistency check that surfaces stale tickets.
 */
import {
  measuredServiceMinutes,
  orderedQueue,
  type Counter,
  type Ticket,
} from "@/lib/loopr-store";

/** Tunable thresholds for the advisory panel. */
export type AdvisoryConfig = {
  /** Trailing window (minutes) used to measure today's arrival rate. */
  windowMinutes: number;
  /** Minimum arrivals in the window before we trust today's sample. */
  minSample: number;
  /** Target expected wait in minutes; above this we advise more counters. */
  targetWaitMinutes: number;
  /** Utilisation below this (with >1 counter) suggests consolidating. */
  lowUtilisation: number;
  /** How many previous working days of history to compare against. */
  historyDays: number;
  /** A waiting/called ticket older than this multiple of service time is stale. */
  staleMultiplier: number;
};

export const DEFAULT_ADVISORY_CONFIG: AdvisoryConfig = {
  windowMinutes: 45,
  minSample: 3,
  targetWaitMinutes: 15,
  lowUtilisation: 0.4,
  historyDays: 6,
  staleMultiplier: 2,
};

/**
 * Probability that an arriving customer has to wait (Erlang-C), computed with
 * the numerically stable recursive Erlang-B form so factorials never overflow.
 * `a` is the offered load (lambda / mu), `c` the number of servers.
 */
export function erlangC(c: number, a: number): number {
  if (c <= 0) return 1;
  if (a <= 0) return 0;
  let erlangB = 1;
  for (let n = 1; n <= c; n++) {
    erlangB = (a * erlangB) / (n + a * erlangB);
  }
  const rho = a / c;
  if (rho >= 1) return 1;
  return erlangB / (1 - rho * (1 - erlangB));
}

/** Expected wait in queue (minutes) for M/M/c: Wq = C(c,a) / (c*mu - lambda). */
export function expectedWaitMinutes(c: number, lambda: number, mu: number): number {
  if (c <= 0 || mu <= 0) return Infinity;
  const capacity = c * mu;
  if (lambda >= capacity) return Infinity;
  return (erlangC(c, lambda / mu) / (capacity - lambda)) * 60;
}

export type AdvisoryCard = {
  id: string;
  tone: "warn" | "good" | "info";
  title: string;
  body: string;
};

export type StaleTicket = { ticket: Ticket; minutes: number };

export type Advisory = {
  /** Arrivals per hour. */
  lambda: number;
  /** Whether lambda came from today's window or the historical fallback. */
  lambdaSource: "live" | "historical";
  /** Service completions per hour per counter. */
  mu: number;
  serviceMinutes: number;
  serviceMeasured: boolean;
  counters: number;
  rho: number;
  waitProbability: number;
  waitNow: number;
  waitPlusOne: number;
  waitMinusOne: number;
  queueLength: number;
  /** Average measured wait (minutes) used for the Little's Law check. */
  averageWait: number;
  littlesLawL: number;
  littlesLawPredicted: number;
  littlesLawGap: number;
  historicalLambda: number | null;
  historicalDelta: number | null;
  staleTickets: StaleTicket[];
  cards: AdvisoryCard[];
  computedAt: number;
};

const HOUR = 3600000;

function isWorkingDay(d: Date) {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function round(n: number, digits = 1) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function fmt(n: number) {
  return Number.isFinite(n) ? `${Math.round(n)}` : "∞";
}

/**
 * Runs the whole advisory pass for one organisation at a point in time.
 * `tickets` should contain both live and historical tickets for the org.
 */
export function computeAdvisory(
  tickets: Ticket[],
  orgId: string,
  counters: Counter[],
  config: Partial<AdvisoryConfig> = {},
  now: number = Date.now(),
): Advisory {
  const cfg = { ...DEFAULT_ADVISORY_CONFIG, ...config };
  const forOrg = tickets.filter((t) => t.orgId === orgId);
  const nowDate = new Date(now);
  const hour = nowDate.getHours();
  const weekday = nowDate.getDay();

  /* ---- lambda: arrivals per hour ---- */
  const windowStart = now - cfg.windowMinutes * 60000;
  const recentJoins = forOrg.filter((t) => t.joinedAt >= windowStart && t.joinedAt <= now);
  const liveLambda = (recentJoins.length / cfg.windowMinutes) * 60;

  /* ---- historical same weekday + hour average over previous working days ---- */
  const perDay: number[] = [];
  let scanned = 0;
  for (let back = 1; back <= 60 && perDay.length < cfg.historyDays; back++) {
    const day = new Date(nowDate);
    day.setDate(day.getDate() - back);
    if (!isWorkingDay(day) && isWorkingDay(nowDate)) continue;
    if (day.getDay() !== weekday) continue;
    scanned++;
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = start.getTime() + HOUR;
    const joins = forOrg.filter((t) => t.joinedAt >= start.getTime() && t.joinedAt < end).length;
    const dayHasData = forOrg.some(
      (t) =>
        t.joinedAt >= new Date(day).setHours(0, 0, 0, 0) &&
        t.joinedAt < new Date(day).setHours(24, 0, 0, 0),
    );
    if (dayHasData) perDay.push(joins);
    if (scanned > cfg.historyDays * 4) break;
  }
  const historicalLambda = perDay.length
    ? perDay.reduce((a, b) => a + b, 0) / perDay.length
    : null;

  const useLive = recentJoins.length >= cfg.minSample || historicalLambda === null;
  const lambda = Math.max(0, useLive ? liveLambda : historicalLambda);

  /* ---- mu: service completions per hour per counter ---- */
  const measured = measuredServiceMinutes(forOrg, orgId);
  const serviceMinutes = Math.max(1, measured ?? 5);
  const mu = 60 / serviceMinutes;

  const activeCounters = counters.filter((c) => c.active).length;
  const c = Math.max(1, activeCounters);
  const rho = lambda / (c * mu);

  const waitNow = expectedWaitMinutes(c, lambda, mu);
  const waitPlusOne = expectedWaitMinutes(c + 1, lambda, mu);
  const waitMinusOne = c > 1 ? expectedWaitMinutes(c - 1, lambda, mu) : Infinity;
  const waitProbability = rho >= 1 ? 1 : erlangC(c, lambda / mu);

  /* ---- Little's Law check: L ≈ λ · W ---- */
  const queue = orderedQueue(forOrg, orgId);
  const queueLength = queue.length;
  const closedToday = forOrg.filter(
    (t) => t.status === "served" && t.calledAt && t.joinedAt >= now - 7 * 24 * HOUR,
  );
  const averageWait = closedToday.length
    ? closedToday.reduce((sum, t) => sum + (t.calledAt! - t.joinedAt) / 60000, 0) /
      closedToday.length
    : 0;
  const predicted = lambda * (averageWait / 60);
  const gap = predicted > 0 ? Math.abs(queueLength - predicted) / Math.max(1, predicted) : 0;

  const staleThreshold = serviceMinutes * cfg.staleMultiplier;
  const staleTickets: StaleTicket[] = queue
    .map((t) => ({
      ticket: t,
      minutes: Math.round(((t.status === "called" ? (t.calledAt ?? t.joinedAt) : t.joinedAt) - 0) * 0 + (now - (t.status === "called" ? (t.calledAt ?? t.joinedAt) : t.joinedAt)) / 60000),
    }))
    .filter((s) => s.minutes > staleThreshold)
    .sort((a, b) => b.minutes - a.minutes);

  /* ---- recommendation cards ---- */
  const cards: AdvisoryCard[] = [];

  if (rho >= 1 || waitNow > cfg.targetWaitMinutes) {
    if (Number.isFinite(waitPlusOne) && (waitNow - waitPlusOne > 2 || !Number.isFinite(waitNow))) {
      cards.push({
        id: "open-counter",
        tone: "warn",
        title: "Open one more counter",
        body: `Utilisation is ${Math.round(rho * 100)}%. Opening one more counter would cut expected wait from ~${fmt(waitNow)} min to ~${fmt(waitPlusOne)} min.`,
      });
    } else {
      cards.push({
        id: "over-capacity",
        tone: "warn",
        title: "Demand is outpacing capacity",
        body: `Utilisation is ${Math.round(rho * 100)}% and expected wait is ~${fmt(waitNow)} min. Consider faster handling or pausing new joins until the backlog clears.`,
      });
    }
  } else if (rho < cfg.lowUtilisation && c > 1) {
    cards.push({
      id: "consolidate",
      tone: "info",
      title: "Consolidate counters",
      body: `Utilisation is only ${Math.round(rho * 100)}% across ${c} counters. Closing one would still hold expected wait near ~${fmt(waitMinusOne)} min and free up a staff member.`,
    });
  } else {
    cards.push({
      id: "balanced",
      tone: "good",
      title: "Staffing looks right",
      body: `Utilisation is ${Math.round(rho * 100)}% with ${c} counter${c === 1 ? "" : "s"} open and expected wait ~${fmt(waitNow)} min, inside your ${cfg.targetWaitMinutes} min target.`,
    });
  }

  let historicalDelta: number | null = null;
  if (historicalLambda !== null && historicalLambda > 0) {
    historicalDelta = Math.round(((liveLambda - historicalLambda) / historicalLambda) * 100);
    const weekdayLabel = nowDate.toLocaleDateString(undefined, { weekday: "long" });
    if (Math.abs(historicalDelta) >= 20 && recentJoins.length >= cfg.minSample) {
      cards.push({
        id: "historical",
        tone: historicalDelta > 0 ? "warn" : "info",
        title: historicalDelta > 0 ? "Busier than normal" : "Quieter than normal",
        body: `This hour is ${Math.abs(historicalDelta)}% ${historicalDelta > 0 ? "busier" : "quieter"} than a typical ${weekdayLabel} at ${String(hour).padStart(2, "0")}:00 (${round(historicalLambda)} joins/h over the last ${perDay.length} working day${perDay.length === 1 ? "" : "s"}). ${historicalDelta > 0 ? "Expect longer waits than usual." : "A counter could be freed up."}`,
      });
    }
  }

  if (staleTickets.length) {
    cards.push({
      id: "stale",
      tone: "warn",
      title: `${staleTickets.length} ticket${staleTickets.length === 1 ? "" : "s"} need review`,
      body: `Little's Law check: queue length is ${queueLength} but λ·W predicts ~${round(predicted)}. Tickets sitting past ${Math.round(staleThreshold)} min (${cfg.staleMultiplier}× average service time) are listed below — close or re-call them so the numbers stay honest.`,
    });
  }

  return {
    lambda: round(lambda),
    lambdaSource: useLive ? "live" : "historical",
    mu: round(mu),
    serviceMinutes,
    serviceMeasured: measured !== undefined,
    counters: c,
    rho: round(rho, 2),
    waitProbability: round(waitProbability, 2),
    waitNow,
    waitPlusOne,
    waitMinusOne,
    queueLength,
    averageWait: round(averageWait),
    littlesLawL: queueLength,
    littlesLawPredicted: round(predicted),
    littlesLawGap: round(gap, 2),
    historicalLambda: historicalLambda === null ? null : round(historicalLambda),
    historicalDelta,
    staleTickets,
    cards,
    computedAt: now,
  };
}

/** Formats a possibly-infinite minute value for display. */
export function formatMinutes(n: number) {
  return Number.isFinite(n) ? `${Math.round(n)} min` : "unbounded";
}
