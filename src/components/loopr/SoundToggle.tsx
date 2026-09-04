/**
 * SoundToggle
 * Small button that mutes/unmutes the "your turn" call chime on this
 * device, syncing its state with the shared loopr-feedback module.
 */
import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isSoundOn, playSoftBlip, setSoundOn, subscribeFeedback } from "@/lib/loopr-feedback";

/** Mutes/unmutes the call chime on this device. */
export function SoundToggle() {
  const [on, setOn] = useState(true);

  // Keep local state in sync with the shared sound-preference store.
  useEffect(() => {
    const sync = () => setOn(isSoundOn());
    sync();
    return subscribeFeedback(sync);
  }, []);

  return (
    <button
      type="button"
      aria-label={on ? "Mute call sound" : "Unmute call sound"}
      aria-pressed={on}
      onClick={() => {
        // Toggle sound preference; play a confirmation blip when turning it on.
        const next = !on;
        setSoundOn(next);
        if (next) playSoftBlip();
      }}
      className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      {on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
    </button>
  );
}
