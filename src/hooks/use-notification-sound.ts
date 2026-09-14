"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NOTIFICATION_SOUND_STORAGE_KEY,
  DEFAULT_NOTIFICATION_SOUND_ENABLED,
  writeNotificationSoundEnabled,
} from "@/lib/notifications/sound-preference";

const SOUND_SRC = "/sounds/notification-tone.mp3";

/**
 * The inbox "new message" chime + its on/off preference.
 *
 * `enabled` starts at the safe SSR default and reconciles to the
 * stored value on mount (same two-step pattern as the inbox's
 * `contactPanelOpen` — reading localStorage in the initializer would
 * make the server-rendered markup mismatch the client's first paint).
 *
 * `play()` is a no-op while disabled, and swallows the promise
 * rejection browsers throw when audio is blocked by an autoplay
 * policy (e.g. the very first message before the agent has clicked
 * anywhere on the page yet) — a missed chime shouldn't surface as an
 * unhandled rejection or console error.
 */
export function useNotificationSound() {
  const [enabled, setEnabledState] = useState(
    DEFAULT_NOTIFICATION_SOUND_ENABLED,
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setEnabledState(stored === "true");
    } catch {
      // localStorage can throw in private-browsing / sandboxed contexts;
      // the state initializer's default already covers that case.
    }
  }, []);

  // Keep every tab in sync when the preference changes elsewhere (a
  // second monitor, another agent session on the same device, etc.) —
  // mirrors the `storage` listener in use-theme.tsx.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== NOTIFICATION_SOUND_STORAGE_KEY) return;
      setEnabledState(
        e.newValue === null
          ? DEFAULT_NOTIFICATION_SOUND_ENABLED
          : e.newValue === "true",
      );
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeNotificationSoundEnabled(next);
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    if (typeof Audio === "undefined") return;
    // Reuse one <audio> element rather than constructing a new one per
    // message — messages can arrive in quick bursts.
    if (!audioRef.current) {
      audioRef.current = new Audio(SOUND_SRC);
      audioRef.current.volume = 0.5;
    }
    const el = audioRef.current;
    el.currentTime = 0;
    el.play().catch(() => {
      // Blocked by the browser's autoplay policy (no user interaction
      // yet this page load) or the tab was backgrounded — nothing
      // actionable to do; the in-app unread badge still updates.
    });
  }, [enabled]);

  return { enabled, setEnabled, play };
}
