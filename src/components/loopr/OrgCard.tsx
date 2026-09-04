/**
 * OrgCard
 * Selectable card summarizing an organization/location: category icon,
 * name, blurb, average service time, and current queue size.
 */
import { Building2, Clock, HeartPulse, ShoppingCart } from "lucide-react";
import type { Organization } from "@/lib/loopr-store";

// Maps organization category strings to a representative icon.
const ICONS: Record<string, typeof Building2> = {
  Banking: Building2,
  Healthcare: HeartPulse,
  Retail: ShoppingCart,
};

export function OrgCard({
  org,
  waiting,
  selected,
  onSelect,
}: {
  org: Organization;
  waiting?: number;
  selected?: boolean;
  onSelect: () => void;
}) {
  const Icon = ICONS[org.category] ?? Building2;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-soft ${
        selected ? "border-brand ring-2 ring-brand/25" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-base font-semibold">{org.name}</h3>
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {org.category}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{org.blurb}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {org.avgServiceMinutes} min average service
            </span>
            {/* Waiting count is optional — only shown when the caller supplies it. */}
            {typeof waiting === "number" && (
              <span>
                {waiting} {waiting === 1 ? "person" : "people"} in line
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
