import type { Message } from "@/types";

/**
 * Device-scoped preference for the inbox "new message" notification
 * sound — same persistence model as the theme/contact-panel prefs in
 * `use-theme.tsx` / the inbox page (localStorage only, no server round
 * trip). Deliberately per-device: an agent sharing a login across a
 * desktop and a phone may want the chime on one and not the other.
 */
export const NOTIFICATION_SOUND_STORAGE_KEY = "wacrm:notifications:sound-enabled";

/** Sound is on by default so a fresh install/agent notices new messages
 * without having to discover a settings toggle first. */
export const DEFAULT_NOTIFICATION_SOUND_ENABLED = true;

export function readNotificationSoundEnabled(): boolean {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATION_SOUND_ENABLED;
  try {
    const stored = localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // localStorage can throw in private-browsing / sandboxed contexts.
  }
  return DEFAULT_NOTIFICATION_SOUND_ENABLED;
}

export function writeNotificationSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFICATION_SOUND_STORAGE_KEY, String(enabled));
  } catch {
    // Same private-browsing edge case as above; the in-memory state in
    // the calling hook still updates so the current tab works.
  }
}

/**
 * Whether a realtime `messages` INSERT should trigger the notification
 * sound. Only genuine inbound messages from the customer qualify —
 * never the agent's own sends (`sender_type: 'agent'`) or bot/automation
 * replies (`sender_type: 'bot'`), which also fire INSERT events on the
 * same realtime channel and would otherwise chime on every reply an
 * agent sends.
 */
export function shouldPlayNotificationSound(
  message: Pick<Message, "sender_type">,
): boolean {
  return message.sender_type === "customer";
}
