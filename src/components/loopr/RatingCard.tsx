/**
 * RatingCard
 * Post-service satisfaction prompt shown to a customer on a served ticket.
 * Lets them pick a 1-5 star rating plus an optional note, and shows a
 * read-only "thanks" state once submitted.
 */
import { useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rateTicket, type Ticket } from "@/lib/loopr-store";

/** Post-service satisfaction prompt shown on a served ticket. */
export function RatingCard({
  ticket,
  ticketRef,
  onRated,
}: {
  ticket: Ticket;
  ticketRef: { id: string; token: string };
  onRated?: () => void;
}) {
  // Local UI state: star hover preview, chosen score, optional note, submit state.
  const [hover, setHover] = useState(0);
  const [score, setScore] = useState(ticket.rating ?? 0);
  const [note, setNote] = useState(ticket.ratingNote ?? "");
  const [busy, setBusy] = useState(false);
  const submitted = typeof ticket.rating === "number";

  // Already rated: show a read-only thank-you with the stored score.
  if (submitted) {
    return (
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-center">
        <p className="text-sm font-semibold">Thanks for the feedback!</p>
        <div className="mt-2 flex justify-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`size-5 ${n <= ticket.rating! ? "fill-accent-warm text-accent-warm" : "text-muted-foreground"}`}
            />
          ))}
        </div>
      </div>
    );
  }

  // Not yet rated: interactive star picker, note field, and submit handler.
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">How was your visit?</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Your rating helps this location improve its service.
      </p>
      <div className="mt-3 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} out of 5`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setScore(n)}
          >
            <Star
              className={`size-8 transition-colors ${
                n <= (hover || score)
                  ? "fill-accent-warm text-accent-warm"
                  : "text-muted-foreground"
              }`}
            />
          </button>
        ))}
      </div>
      <Input
        className="mt-3"
        id="rating-note"
        aria-label="Feedback note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything we could do better? (optional)"
      />
      <Button
        className="mt-3 w-full"
        disabled={!score || busy}
        onClick={async () => {
          // Submit rating (and optional note) to the backend, surfacing
          // success/error via toast and notifying the parent when done.
          setBusy(true);
          try {
            await rateTicket(ticketRef, score, note.trim() || undefined);
            toast.success("Thanks — your rating was sent.");
            onRated?.();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't send rating.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Submit rating
      </Button>
    </div>
  );
}
