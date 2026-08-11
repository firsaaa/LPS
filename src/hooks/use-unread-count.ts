"use client";

import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls GET /api/notifications/unread-count every 30s (NFR-06).
 * Pauses while the tab is hidden, resumes (with an immediate refresh) when visible again.
 */
export function useUnreadCount() {
  const [count, setCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch("/api/notifications/unread-count");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setCount(data.count ?? 0);
      } catch {
        // network hiccup — next poll will retry
      }
    }

    function startPolling() {
      if (intervalRef.current) return;
      fetchCount();
      intervalRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") startPolling();
      else stopPolling();
    }

    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return count;
}
