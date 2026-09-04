/**
 * useAuth
 * Exposes the current Supabase auth session/user, kept in sync with
 * auth state change events and the initial session fetch.
 */
import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Current Supabase session, kept in sync with auth state changes. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  // True once we've resolved the initial session (or an auth event has fired).
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Subscribe to future auth changes (sign in/out, token refresh, etc).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    // Also fetch the current session immediately on mount.
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, ready };
}
