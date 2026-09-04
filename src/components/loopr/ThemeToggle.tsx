/**
 * ThemeToggle
 * Button that switches between light and dark mode, persisting the choice
 * in localStorage and respecting the OS preference on first load.
 */
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "loopr.theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  // Guards against writing to localStorage before the initial preference has loaded.
  const [ready, setReady] = useState(false);

  // On mount, resolve the initial theme from localStorage or the OS preference.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const prefers =
      stored === "dark" ||
      (stored === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(prefers);
    setReady(true);
  }, []);

  // Whenever the theme changes (after initial load), apply the "dark" class
  // to the document root and persist the choice.
  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark, ready]);

  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
