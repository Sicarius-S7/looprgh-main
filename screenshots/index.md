# Loopr — Screenshot Audit

All screenshots live in `/screenshots/`. Captured at desktop (1440px wide) and mobile (390px wide) viewports.

| Page | Route | State | Viewport | File | Loaded |
| --- | --- | --- | --- | --- | --- |
| Landing | `/` | default | desktop | `home-desktop.png` | Yes |
| Landing | `/` | default | mobile | `home-mobile.png` | Yes |
| Staff sign in | `/auth` | default | desktop | `login-desktop.png` | Yes |
| Staff sign in | `/auth` | default | mobile | `login-mobile.png` | Yes |
| Customer join | `/customer` | name entry | desktop | `customer-join-desktop.png` | Yes |
| Customer join | `/customer` | name entry | mobile | `customer-join-mobile.png` | Yes |
| Customer join | `/customer` | location picker | desktop | `customer-locations-desktop.png` | Yes |
| Customer join | `/customer` | location picker | mobile | `customer-locations-mobile.png` | Yes |
| Customer join | `/customer` | service + priority | desktop | `customer-service-select-desktop.png` | Yes |
| Customer join | `/customer` | service + priority | mobile | `customer-service-select-mobile.png` | Yes |
| Customer live ticket | `/customer` | issued ticket, live position | desktop | `customer-live-ticket-desktop.png` | Yes |
| Customer live ticket | `/customer` | issued ticket, live position | mobile | `customer-live-ticket-mobile.png` | Yes |
| Kiosk | `/kiosk` | location picker | desktop | `kiosk-desktop.png` | Yes |
| Kiosk | `/kiosk` | location picker | mobile | `kiosk-mobile.png` | Yes |
| Kiosk | `/kiosk` | check-in screen | desktop | `kiosk-checkin-desktop.png` | Yes |
| Kiosk | `/kiosk` | check-in screen | mobile | `kiosk-checkin-mobile.png` | Yes |
| Kiosk | `/kiosk` | staff exit PIN prompt | desktop | `kiosk-staff-exit-desktop.png` | Yes |
| Kiosk | `/kiosk` | staff exit PIN prompt | mobile | `kiosk-staff-exit-mobile.png` | Yes |
| Staff | `/staff` | signed out | desktop | `staff-signed-out-desktop.png` | Yes |
| Staff | `/staff` | signed out | mobile | `staff-signed-out-mobile.png` | Yes |
| Staff dashboard | `/staff` | signed in as manager | desktop | `staff-dashboard-desktop.png` | Yes |
| Staff dashboard | `/staff` | signed in as manager | mobile | `staff-dashboard-mobile.png` | Yes |
| Not found | `/does-not-exist` | 404 fallback | desktop | `not-found-desktop.png` | Yes |
| Not found | `/does-not-exist` | 404 fallback | mobile | `not-found-mobile.png` | Yes |

## Routes not screenshotted

- `/sitemap.xml` — machine-readable XML endpoint, no UI to capture. Verified it returns valid XML.

## Totals

- Routes discovered: 6 UI routes (`/`, `/auth`, `/customer`, `/kiosk`, `/staff`, 404 fallback) plus `/sitemap.xml`.
- Distinct page states captured: 12
- Screenshots created: 24

## Issue found and fixed during the audit

Joining a queue failed with a 404 from the `join_queue` backend routine: it generated the ticket's private access token with `gen_random_bytes`, which is not reachable from the routine's search path. The routine now builds the token from `gen_random_uuid()`, and customer/kiosk ticket issuance works end to end.
