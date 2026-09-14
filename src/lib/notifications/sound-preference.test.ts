import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  NOTIFICATION_SOUND_STORAGE_KEY,
  readNotificationSoundEnabled,
  writeNotificationSoundEnabled,
  shouldPlayNotificationSound,
} from "./sound-preference";

/**
 * These read/write helpers early-return their SSR-safe default when
 * `window` is undefined — true in this project's default `node` test
 * environment (no jsdom dependency for the whole test file just for
 * this one module). A minimal in-memory localStorage stubbed onto
 * `globalThis`, plus a truthy `window`, is enough to exercise the
 * browser branch directly.
 */
function stubBrowserGlobals() {
  const store = new Map<string, string>();
  const fakeLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", fakeLocalStorage);
  return fakeLocalStorage;
}

describe("notification sound preference", () => {
  beforeEach(() => {
    stubBrowserGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to enabled when nothing is stored", () => {
    expect(readNotificationSoundEnabled()).toBe(true);
  });

  it("round-trips a written value", () => {
    writeNotificationSoundEnabled(false);
    expect(readNotificationSoundEnabled()).toBe(false);
    expect(localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY)).toBe("false");

    writeNotificationSoundEnabled(true);
    expect(readNotificationSoundEnabled()).toBe(true);
  });

  it("falls back to the default for a garbage stored value", () => {
    localStorage.setItem(NOTIFICATION_SOUND_STORAGE_KEY, "not-a-boolean");
    expect(readNotificationSoundEnabled()).toBe(true);
  });

  it("defaults to enabled server-side (no window)", () => {
    vi.unstubAllGlobals();
    expect(readNotificationSoundEnabled()).toBe(true);
  });
});

describe("shouldPlayNotificationSound", () => {
  it("chimes for genuine inbound customer messages", () => {
    expect(shouldPlayNotificationSound({ sender_type: "customer" })).toBe(
      true,
    );
  });

  it("stays silent for the agent's own sends and bot/automation replies", () => {
    expect(shouldPlayNotificationSound({ sender_type: "agent" })).toBe(false);
    expect(shouldPlayNotificationSound({ sender_type: "bot" })).toBe(false);
  });
});
