import { describe, it, expect } from 'vitest'
import { isWithinAutoReplyHours, hourInTimeZone } from './hours'

function cfg(overrides: Partial<Parameters<typeof isWithinAutoReplyHours>[0]> = {}) {
  return {
    autoReplyHoursEnabled: true,
    autoReplyHoursStart: 20,
    autoReplyHoursEnd: 8,
    autoReplyTimezone: 'UTC',
    ...overrides,
  }
}

// Build a UTC Date at a given hour so the assertions don't depend on
// the machine running the tests being in any particular timezone.
function atUtcHour(hour: number): Date {
  return new Date(Date.UTC(2026, 0, 15, hour, 0, 0))
}

describe('isWithinAutoReplyHours', () => {
  it('is always true when the restriction is disabled', () => {
    expect(isWithinAutoReplyHours(cfg({ autoReplyHoursEnabled: false }), atUtcHour(12))).toBe(true)
    expect(isWithinAutoReplyHours(cfg({ autoReplyHoursEnabled: false }), atUtcHour(23))).toBe(true)
  })

  describe('overnight window (20:00–08:00, wraps midnight)', () => {
    it('is true late at night', () => {
      expect(isWithinAutoReplyHours(cfg(), atUtcHour(20))).toBe(true) // window opens
      expect(isWithinAutoReplyHours(cfg(), atUtcHour(23))).toBe(true)
    })
    it('is true in the early morning', () => {
      expect(isWithinAutoReplyHours(cfg(), atUtcHour(0))).toBe(true)
      expect(isWithinAutoReplyHours(cfg(), atUtcHour(7))).toBe(true)
    })
    it('is false right at the boundary hour and through the day', () => {
      expect(isWithinAutoReplyHours(cfg(), atUtcHour(8))).toBe(false) // window closes
      expect(isWithinAutoReplyHours(cfg(), atUtcHour(12))).toBe(false)
      expect(isWithinAutoReplyHours(cfg(), atUtcHour(19))).toBe(false)
    })
  })

  describe('same-day window (e.g. 9–17, does not wrap)', () => {
    const day = cfg({ autoReplyHoursStart: 9, autoReplyHoursEnd: 17 })
    it('is true inside the window', () => {
      expect(isWithinAutoReplyHours(day, atUtcHour(9))).toBe(true)
      expect(isWithinAutoReplyHours(day, atUtcHour(16))).toBe(true)
    })
    it('is false outside the window', () => {
      expect(isWithinAutoReplyHours(day, atUtcHour(8))).toBe(false)
      expect(isWithinAutoReplyHours(day, atUtcHour(17))).toBe(false)
      expect(isWithinAutoReplyHours(day, atUtcHour(23))).toBe(false)
    })
  })

  it('treats start === end as "always on" (24h window)', () => {
    const always = cfg({ autoReplyHoursStart: 5, autoReplyHoursEnd: 5 })
    expect(isWithinAutoReplyHours(always, atUtcHour(0))).toBe(true)
    expect(isWithinAutoReplyHours(always, atUtcHour(12))).toBe(true)
    expect(isWithinAutoReplyHours(always, atUtcHour(23))).toBe(true)
  })

  it('reads the hour in the configured timezone, not the server clock', () => {
    // 2026-01-15T20:30:00Z is 2026-01-16T02:00:00+05:30 in Asia/Kolkata —
    // inside the 20–8 overnight window in IST even though the UTC hour
    // (20) would also pass here; use a boundary UTC hour that would
    // *fail* in UTC but pass in IST to prove the timezone conversion runs.
    const utc0830 = new Date(Date.UTC(2026, 0, 15, 8, 30)) // 08:30 UTC = 14:00 IST
    const ist = cfg({ autoReplyTimezone: 'Asia/Kolkata' })
    // 14:00 IST is inside neither 20-8 nor near it — should be false —
    // while the same instant read as UTC hour 8 would be right at the
    // boundary. This confirms the zone conversion, not just the hour math.
    expect(isWithinAutoReplyHours(ist, utc0830)).toBe(false)

    const utc1500 = new Date(Date.UTC(2026, 0, 15, 15, 0)) // 15:00 UTC = 20:30 IST
    expect(isWithinAutoReplyHours(ist, utc1500)).toBe(true)
  })

  it('falls back to the server-local hour for an unrecognized timezone', () => {
    const bogus = cfg({ autoReplyTimezone: 'Not/AZone' })
    // Should not throw, and should fall back to something deterministic.
    expect(() => isWithinAutoReplyHours(bogus, atUtcHour(12))).not.toThrow()
  })
})

describe('hourInTimeZone', () => {
  it('returns the IST hour for a known UTC instant', () => {
    // 18:30 UTC = 00:00 IST (next day)
    expect(hourInTimeZone(new Date(Date.UTC(2026, 0, 15, 18, 30)), 'Asia/Kolkata')).toBe(0)
  })
})
