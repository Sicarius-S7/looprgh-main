/**
 * EmptyQueue
 * Friendly staff-facing empty state shown on the queue dashboard when there
 * are no customers currently waiting.
 */
import { CheckCircle2, Inbox } from "lucide-react";

/** Friendly staff-facing state when nobody is waiting. */
export function EmptyQueue({ servedToday }: { servedToday: number }) {
  return (
    <div className="animate-fade-in flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <span className="relative flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <span className="absolute inset-0 animate-ping-soft rounded-2xl bg-brand/15" />
        <Inbox className="size-6" />
      </span>
      <p className="mt-4 text-base font-semibold">The queue is clear</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        Nobody is waiting right now. Add a walk-in, or leave the counter QR up for remote
        joins.
      </p>
      {/* Only show the "served today" recap if at least one ticket was completed. */}
      {servedToday > 0 && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-success">
          <CheckCircle2 className="size-3.5" />
          {servedToday} served today — all caught up.
        </p>
      )}
    </div>
  );
}
