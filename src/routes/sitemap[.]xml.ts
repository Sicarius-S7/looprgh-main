/**
 * Server route that generates /sitemap.xml for search engines.
 * It has no UI: the GET handler builds the XML document from the static list
 * of public pages below and returns it with a one-hour cache header.
 */
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Absolute site origin — sitemap <loc> entries must be fully qualified URLs.
const BASE_URL = "https://looprgh.com";

/** One page listed in the sitemap. */
interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Public, indexable pages. Add new routes here when they should rank.
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/customer", changefreq: "weekly", priority: "0.9" },
          { path: "/kiosk", changefreq: "monthly", priority: "0.5" },
          { path: "/staff", changefreq: "monthly", priority: "0.5" },
          { path: "/auth", changefreq: "monthly", priority: "0.4" },
        ];

        // Render each entry as a <url> block, skipping optional fields.
        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        // Wrap the entries in the sitemap protocol envelope.
        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        // Served as XML and cached for an hour by browsers/CDNs.
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});