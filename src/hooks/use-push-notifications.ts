/**
 * usePushNotifications
 * Thin wrapper over the browser Notification API so the customer can opt in
 * to being alerted when their turn approaches, even with the tab in the
 * background.
 */
import { useCallback, useEffect, useState } from "react";

type PermissionState = "unsupported" | "default" | "granted" | "denied";

/**
 * Thin wrapper over the browser Notification API so the customer can opt in to
 * being alerted when their turn approaches, even with the tab in the background.
 */
export function usePushNotifications() {
  const [permission, setPermission] = useState<PermissionState>("default");

  // Determine initial permission state (or mark unsupported on SSR / old browsers).
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermissionState);
  }, []);

  // Prompts the user for notification permission; returns whether it was granted.
  const request = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    const result = await Notification.requestPermission();
    setPermission(result as PermissionState);
    return result === "granted";
  }, []);

  // Fires a browser notification if permission has been granted; clicking it
  // focuses the tab and dismisses the notification.
  const notify = useCallback(
    (title: string, body: string) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      try {
        const n = new Notification(title, { body, tag: "loopr-queue" });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        /* some browsers require a service worker; ignore silently */
      }
    },
    [],
  );

  return { permission, request, notify };
}
