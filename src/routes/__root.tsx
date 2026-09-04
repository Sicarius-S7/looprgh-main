import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

/**
 * Root route of the app.
 * Defines the outer HTML shell, global <head> metadata (title, description,
 * Open Graph/Twitter tags, JSON-LD structured data, fonts, favicon), and the
 * fallback UI shown for 404s and unhandled route errors.
 */

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";

// Rendered by TanStack Router when no matching route is found.
function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

// Rendered by TanStack Router when a route/component throws. Reports the
// error for diagnostics and offers the user a retry or a way back home.
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

// Root route definition: sets up shared router context (queryClient) and
// registers the shell/component/notFound/error components used app-wide.
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Global document <head> metadata applied to every page.
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Loopr — Smart queue management" },
      {
        name: "description",
        content:
          "Loopr is queue software for banks, clinics and shops: digital tickets, live wait times, kiosk check-in and a staff dashboard.",
      },
      { name: "author", content: "Loopr" },
      { property: "og:title", content: "Loopr — Smart queue management" },
      {
        property: "og:description",
        content:
          "Digital tickets, live wait times and a staff dashboard for banks, clinics and shops.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Loopr" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://looprgh.com/#organization",
              name: "Loopr",
              url: "https://looprgh.com",
              logo: "https://looprgh.com/favicon.png",
              description:
                "Loopr provides queue management software: remote digital tickets, live wait times, kiosk check-in and a staff dashboard.",
            },
            {
              "@type": "WebSite",
              "@id": "https://looprgh.com/#website",
              name: "Loopr",
              url: "https://looprgh.com",
              publisher: { "@id": "https://looprgh.com/#organization" },
              description:
                "Join a service queue from your phone and track your place in line, while staff run the line from one dashboard.",
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Outermost HTML document shell (html/head/body). Also injects an inline
// script that applies the persisted/system dark-mode preference before
// hydration to avoid a flash of incorrect theme.
function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('loopr.theme');var d=t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Top-level app component: wires up React Query and renders the active
// route via <Outlet />, plus the global toast notifications.
function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
