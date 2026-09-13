import type { AiConfig } from './types'

// ============================================================
// Time-of-day gate for the AI auto-reply bot.
//
// Some accounts want human agents to own the inbox during the day and
// have the bot only pick up messages outside those hours (IntenCiv:
// agents 08:00–20:00 IST, bot 20:00–08:00 IST). `auto_reply_enabled`
// stays the master on/off switch; this is an optional restriction on
// top of it, checked once per inbound message right before the bot
// would otherwise reply.
// ============================================================

/** The subset of `AiConfig` this check needs — accepted as a plain
 *  object (not the full `AiConfig`) so callers/tests don't have to
 *  fabricate an entire config just to exercise the hour logic. */
export type AutoReplyHoursConfig = Pick<
  AiConfig,
  'autoReplyHoursEnabled' | 'autoReplyHoursStart' | 'autoReplyHoursEnd' | 'autoReplyTimezone'
>

/**
 * Current local hour-of-day (0–23) in an IANA timezone, using the
 * platform's own ICU data via `Intl` — no extra dependency, and no
 * hand-rolled DST/offset math to get wrong. Node ships with full ICU
 * by default (Node 13+), so this works the same in dev, tests, and on
 * Railway.
 *
 * Falls back to the server's local hour if `timezone` is missing or
 * not a zone `Intl` recognizes (e.g. a typo saved from an older client)
 * — a slightly-wrong window beats throwing and silently disabling the
 * bot account-wide.
 */
export function hourInTimeZone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    })
    return parseInt(formatter.format(date), 10)
  } catch {
    return date.getHours()
  }
}

/**
 * True when `now` falls inside the account's configured auto-reply
 * window. Returns true unconditionally when the restriction is off
 * (`autoReplyHoursEnabled: false`) — the default, and the same
 * behaviour as before this feature existed.
 *
 * `start`/`end` are hours-of-day (0–23). `start < end` is a same-day
 * window (e.g. 9–17); `start > end` wraps past midnight (e.g. 20–8
 * covers 20:00 through 07:59); `start === end` covers all 24 hours.
 */
export function isWithinAutoReplyHours(
  config: AutoReplyHoursConfig,
  now: Date = new Date(),
): boolean {
  if (!config.autoReplyHoursEnabled) return true

  const hour = hourInTimeZone(now, config.autoReplyTimezone)
  const { autoReplyHoursStart: start, autoReplyHoursEnd: end } = config

  if (start === end) return true
  if (start < end) return hour >= start && hour < end
  return hour >= start || hour < end // wraps midnight
}
