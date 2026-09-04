/**
 * Router factory. TanStack Start calls getRouter() once per request on the
 * server and once in the browser, so every request gets its own QueryClient
 * (never share one across requests — that would leak data between users).
 */
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen"; // generated from src/routes/**

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    // Exposed to loaders/components as route context.
    context: { queryClient },
    // Restore scroll position on back/forward navigation.
    scrollRestoration: true,
    // Always refetch preloaded route data rather than serving it stale.
    defaultPreloadStaleTime: 0,
  });

  return router;
};

