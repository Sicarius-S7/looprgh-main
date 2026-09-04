import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { LooprLogo } from "@/components/loopr/LooprLogo";
import { ThemeToggle } from "@/components/loopr/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Staff authentication page ("/auth"). Lets staff sign in to an existing
 * account or sign up to create one, then redirects to the staff dashboard.
 */

// Route config: SEO meta tags for the sign-in page.
export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff sign in — Loopr" },
      {
        name: "description",
        content:
          "Sign in to your Loopr staff account to run your location's queue, or create an account to set up a new location.",
      },
      { property: "og:title", content: "Staff sign in — Loopr" },
      {
        property: "og:description",
        content: "Sign in to run your location's live queue on Loopr.",
      },
    ],
  }),
  component: AuthPage,
});

/**
 * Hard-coded demo/test accounts. These exist in the backend already and are
 * confirmed, so a tester can sign in with one tap instead of typing.
 */
const TEST_PASSWORD = "Loopr1234!";
const TEST_ACCOUNTS = [
  { label: "Manager", email: "manager@loopr.test" },
  { label: "Reception", email: "staff@loopr.test" },
  { label: "Customer", email: "customer@loopr.test" },
] as const;

function AuthPage() {
  const navigate = useNavigate();
  const { session, ready } = useAuth();
  // Form/UI state for toggling between sign-in and sign-up modes.
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  // Prefilled with the manager test account so testing needs no typing.
  const [email, setEmail] = useState<string>(TEST_ACCOUNTS[0].email);
  const [password, setPassword] = useState<string>(TEST_PASSWORD);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  // Already-authenticated staff get redirected straight to the dashboard.
  useEffect(() => {
    if (ready && session) void navigate({ to: "/staff", replace: true });
  }, [ready, session, navigate]);

  // Handles both sign-in and sign-up submissions via Supabase auth.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/staff`,
            data: { display_name: displayName.trim() || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created — you're signed in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Welcome back.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background pb-16">
      <header className="mx-auto flex max-w-lg items-center justify-between px-5 py-5">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
          <span className="sr-only">Back to home</span>
        </Link>
        <LooprLogo />
        <ThemeToggle />
      </header>

      <div className="mx-auto max-w-md px-5">
        <h1 className="text-2xl font-semibold">
          {mode === "signin" ? "Staff sign in" : "Create a staff account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to open your location's queue dashboard."
            : "Create an account to set up a location and run its queue."}
        </p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="display-name">Your name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Adjoa Mensah"
                className="h-12 rounded-xl bg-card"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-12 rounded-xl bg-card"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-12 rounded-xl bg-card"
            />
          </div>
          <Button type="submit" className="h-12 w-full rounded-xl" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {/* One-tap fill for the hard-coded test accounts. */}
        {mode === "signin" && (
          <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium">Test accounts</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Password for all three: <span className="font-mono">{TEST_PASSWORD}</span>
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {TEST_ACCOUNTS.map((a) => (
                <Button
                  key={a.email}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(TEST_PASSWORD);
                  }}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New to Loopr?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-semibold text-brand"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
