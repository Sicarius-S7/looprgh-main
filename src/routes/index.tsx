import { createFileRoute, Link } from "@tanstack/react-router";
import { LayoutDashboard, UserRound } from "lucide-react";
import { LooprLogo } from "@/components/loopr/LooprLogo";
import { ThemeToggle } from "@/components/loopr/ThemeToggle";

/**
 * Marketing landing page ("/"). Presents the product and links customers to
 * the queue-joining flow and staff to the dashboard/sign-in.
 */

// Route config: SEO meta tags and canonical link for the landing page.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Loopr — Join the queue from anywhere" },
      {
        name: "description",
        content:
          "Loopr replaces standing in line: join a queue remotely, watch your position and wait time update live, and let staff run the line from one dashboard.",
      },
      { property: "og:title", content: "Loopr — Join the queue from anywhere" },
      {
        property: "og:description",
        content:
          "Join a service queue from your phone, track your position live, and get called when it's your turn.",
      },
      { property: "og:url", content: "https://looprgh.com/" },
      { property: "og:image", content: "https://looprgh.com/og-image.jpg" },
      { name: "twitter:image", content: "https://looprgh.com/og-image.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://looprgh.com/" }],
  }),
  component: Landing,
});

// Feature highlights rendered in the "why Loopr" section.
const FEATURES = [
  {
    kicker: "Real-time",
    title: "Live position",
    body: "Watch your number move to the front of the line as staff work through the queue.",
  },
  {
    kicker: "Smart alerts",
    title: "Called, not shouted",
    body: "A push notification, chime and buzz the moment it is your turn at the counter.",
  },
  {
    kicker: "Insights",
    title: "Honest wait times",
    body: "Estimates come from each location's measured service time, not a guess.",
  },
];

function Landing() {
  return (
    <main className="min-h-screen overflow-hidden bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-12">
        <LooprLogo />
        <div className="flex items-center gap-3">
          <Link
            to="/staff"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Staff sign in
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pt-8 pb-20 sm:px-12 sm:pt-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-accent-warm/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-64 -right-24 size-96 rounded-full bg-brand/10 blur-3xl"
        />

        <div className="relative z-10 animate-fade-in">
          <span className="font-display text-xs font-bold tracking-[0.2em] text-accent-warm uppercase">
            Queue management, without the line
          </span>
          <h1 className="mt-6 max-w-3xl text-5xl leading-[1.05] font-extrabold tracking-tight md:text-7xl">
            The line moves
            <br />
            <span className="text-accent-warm">with you.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            Skip the physical wait. Join a queue remotely, watch your ticket progress
            live, and step in exactly when it is your turn.
          </p>
        </div>

        <div className="relative z-10 mt-14 grid gap-8 md:grid-cols-2">
          <div className="group rounded-[2rem] border border-border bg-card p-8 shadow-soft transition-all duration-500 hover:-translate-y-2 hover:shadow-xl sm:p-10">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent-warm-soft text-accent-warm">
              <UserRound className="size-6" />
            </span>
            <h2 className="mt-8 text-2xl font-bold">For customers</h2>
            <p className="mt-4 text-muted-foreground">
              Join the queue from your couch and track your live ticket with precision.
            </p>
            <Link
              to="/customer"
              search={{ org: undefined }}
              className="mt-8 block w-full rounded-xl bg-brand px-6 py-4 text-center font-bold text-brand-foreground transition-all hover:scale-[1.02] active:scale-95"
            >
              Join a queue
            </Link>
          </div>

          <div className="group rounded-[2rem] bg-brand p-8 shadow-soft transition-all duration-500 hover:-translate-y-2 hover:shadow-xl sm:p-10">
            <span className="flex size-12 items-center justify-center rounded-xl bg-brand-foreground/10 text-accent-warm">
              <LayoutDashboard className="size-6" />
            </span>
            <h2 className="mt-8 text-2xl font-bold text-brand-foreground">For staff</h2>
            <p className="mt-4 text-brand-foreground/70">
              Manage the flow, monitor capacity, and streamline service from one dashboard.
            </p>
            <Link
              to="/staff"
              className="mt-8 block w-full rounded-xl bg-accent-warm px-6 py-4 text-center font-bold text-accent-warm-foreground transition-all hover:scale-[1.02] active:scale-95"
            >
              Launch dashboard
            </Link>
          </div>
        </div>

        <div className="relative z-10 mt-24 grid gap-12 border-t border-border pt-12 md:grid-cols-3">
          {FEATURES.map(({ kicker, title, body }) => (
            <div key={title}>
              <h3 className="mb-3 text-xs font-bold tracking-wider text-accent-warm uppercase">
                {kicker}
              </h3>
              <p className="font-display mb-2 text-lg font-semibold">{title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>

        <footer className="relative z-10 mt-24 border-t border-border pt-8 text-center text-sm font-medium tracking-wide text-muted-foreground">
          © {new Date().getFullYear()} Loopr — real-time queue management for busy counters.
        </footer>
      </section>
    </main>
  );
}