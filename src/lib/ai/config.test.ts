import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// decrypt is identity in tests so we don't depend on real ciphertext.
vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: (v: string) => `plain:${v}`,
}))

import { loadAiConfig } from './config'

function dbReturning(row: Record<string, unknown> | null): SupabaseClient {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  }
  return chain as unknown as SupabaseClient
}

const ROW = {
  provider: 'openai',
  model: 'gpt-x',
  api_key: 'enc-key',
  system_prompt: null,
  is_active: false,
  auto_reply_enabled: false,
  auto_reply_max_per_conversation: 3,
  embeddings_api_key: null,
  auto_reply_hours_enabled: false,
  auto_reply_hours_start: 20,
  auto_reply_hours_end: 8,
  auto_reply_timezone: 'Asia/Kolkata',
}

describe('loadAiConfig requireActive', () => {
  it('returns null for an inactive config by default', async () => {
    expect(await loadAiConfig(dbReturning(ROW), 'acct')).toBeNull()
  })

  it('returns the config when requireActive is false (Playground path)', async () => {
    const config = await loadAiConfig(dbReturning(ROW), 'acct', {
      requireActive: false,
    })
    expect(config).not.toBeNull()
    expect(config!.provider).toBe('openai')
    expect(config!.apiKey).toBe('plain:enc-key')
    expect(config!.autoReplyHoursEnabled).toBe(false)
    expect(config!.autoReplyHoursStart).toBe(20)
    expect(config!.autoReplyHoursEnd).toBe(8)
    expect(config!.autoReplyTimezone).toBe('Asia/Kolkata')
  })

  it('loads a configured auto-reply hours window', async () => {
    const config = await loadAiConfig(
      dbReturning({
        ...ROW,
        auto_reply_hours_enabled: true,
        auto_reply_hours_start: 20,
        auto_reply_hours_end: 8,
      }),
      'acct',
      { requireActive: false },
    )
    expect(config!.autoReplyHoursEnabled).toBe(true)
    expect(config!.autoReplyHoursStart).toBe(20)
    expect(config!.autoReplyHoursEnd).toBe(8)
  })

  it('falls back to safe defaults when the columns are missing (stale schema cache)', async () => {
    const rowWithoutHours = {
      provider: 'openai',
      model: 'gpt-x',
      api_key: 'enc-key',
      system_prompt: null,
      is_active: false,
      auto_reply_enabled: false,
      auto_reply_max_per_conversation: 3,
      embeddings_api_key: null,
    }
    const config = await loadAiConfig(dbReturning(rowWithoutHours), 'acct', {
      requireActive: false,
    })
    expect(config!.autoReplyHoursEnabled).toBe(false)
    expect(config!.autoReplyHoursStart).toBe(20)
    expect(config!.autoReplyHoursEnd).toBe(8)
    expect(config!.autoReplyTimezone).toBe('Asia/Kolkata')
  })

  it('returns null when there is no row', async () => {
    expect(
      await loadAiConfig(dbReturning(null), 'acct', { requireActive: false }),
    ).toBeNull()
  })
})
