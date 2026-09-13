-- ============================================================
-- 040_ai_auto_reply_hours.sql — restrict AI auto-reply to a time window
--
-- IntenCiv's ask: human agents own the WhatsApp inbox during the day
-- (08:00–20:00 IST); outside that window the AI auto-reply bot should
-- be the one answering, so a customer messaging at night still gets an
-- immediate response instead of silence until morning.
--
-- `auto_reply_enabled` (029_ai_reply.sql) is the bot's master on/off
-- switch for inbound messages. This adds an optional TIME-OF-DAY
-- restriction on top of it:
--
--   auto_reply_hours_enabled  — false (default) = no restriction, the
--                                bot behaves exactly as before, replying
--                                any time `auto_reply_enabled` is on.
--   auto_reply_hours_start /
--   auto_reply_hours_end      — local hour-of-day (0–23, in
--                                auto_reply_timezone) the bot is allowed
--                                to answer. start > end is a valid,
--                                expected shape — it means the window
--                                wraps past midnight (e.g. 20 → 8 covers
--                                20:00 through 07:59). start == end
--                                means "all day" (24h window).
--   auto_reply_timezone        — IANA zone the two hours above are
--                                interpreted in. Defaults to
--                                Asia/Kolkata (IntenCiv is Jaipur-based);
--                                editable per account for any other
--                                deployment of this CRM.
--
-- Defaults are pre-set to IntenCiv's actual ask (20:00–08:00 IST) so
-- turning the toggle on in Settings just works without also having to
-- retype the hours; any account can change all three from Settings →
-- Agent setup.
--
-- Enforced in application code (src/lib/ai/hours.ts,
-- src/lib/ai/auto-reply.ts) rather than in SQL — the auto-reply bot
-- already loads the full config row before deciding whether to answer,
-- so the check is a plain function call with no extra query.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS auto_reply_hours_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reply_hours_start smallint NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS auto_reply_hours_end smallint NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS auto_reply_timezone text NOT NULL DEFAULT 'Asia/Kolkata';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_configs_hours_start_range'
  ) THEN
    ALTER TABLE ai_configs
      ADD CONSTRAINT ai_configs_hours_start_range
      CHECK (auto_reply_hours_start BETWEEN 0 AND 23);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_configs_hours_end_range'
  ) THEN
    ALTER TABLE ai_configs
      ADD CONSTRAINT ai_configs_hours_end_range
      CHECK (auto_reply_hours_end BETWEEN 0 AND 23);
  END IF;
END $$;
