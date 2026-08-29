/**
 * Authkey WhatsApp API helpers — replacement for ./meta-api.ts.
 *
 * IMPORTANT: this file is intentionally incomplete. It implements only the
 * two operations Authkey's public docs (authkey.io/whatsapp-api-docs,
 * authkey.io/api-docs) actually document. Everything else throws
 * AuthkeyNotConfirmedError on purpose, rather than guessing a request/
 * response shape Authkey hasn't published — a wrong guess here would fail
 * silently against a real webhook and be far worse than an explicit error.
 *
 * See ../../../docs/authkey-integration-todo.md for exactly what's needed
 * from Authkey to finish each stubbed function, and IntenCiv's "WhatsApp
 * Desk" architecture brief, Section 05, for the business-side framing of
 * the same gaps.
 */

const AUTHKEY_BASE = 'https://console.authkey.io/restapi'

export class AuthkeyNotConfirmedError extends Error {
  constructor(operation: string, whatsNeeded: string) {
    super(
      `Authkey: "${operation}" is not implemented because Authkey's public docs ` +
        `don't specify it. Needed: ${whatsNeeded}. See docs/authkey-integration-todo.md.`
    )
    this.name = 'AuthkeyNotConfirmedError'
  }
}

export interface AuthkeyCredentials {
  /** Authkey account API key ("authkey" query param in their docs). */
  apiKey: string
}

export interface AuthkeySendResult {
  /**
   * UNCONFIRMED shape. Authkey's docs don't show a response body example
   * for requestjson.php, so this is a best-effort parse — log the raw
   * response the first few times this runs against a real account and
   * tighten this type once we've actually seen it.
   */
  raw: unknown
  messageId?: string
}

// ============================================================
// CONFIRMED — documented at authkey.io/whatsapp-api-docs
// ============================================================

export interface SendTemplateMessageArgs extends AuthkeyCredentials {
  /** Recipient's national number, no country code (matches Authkey's "mobile"). */
  mobile: string
  /** e.g. "91" for India. Matches Authkey's "country_code". */
  countryCode: string
  /** Authkey's approved-template id ("wid" in their docs). */
  templateId: string
  /** Body placeholder values, e.g. { var1: "Priya", var2: "CBC" }. */
  bodyValues?: Record<string, string>
  /** Only for templates with a media/document header. */
  headerValues?: { headerFileName: string; headerData: string }
}

/**
 * Send a pre-approved WhatsApp template via Authkey.
 * Documented at https://authkey.io/whatsapp-api-docs (POST requestjson.php).
 *
 * NOTE: Authkey's docs only show template sends (a "wid" is required on
 * every example, including the plain-text case). There is no evidence in
 * their public docs of a free-form/session-reply send that doesn't go
 * through a template id — see sendFreeformTextMessage below for why that
 * matters for live agent replies.
 */
export async function sendTemplateMessage(
  args: SendTemplateMessageArgs
): Promise<AuthkeySendResult> {
  const { apiKey, mobile, countryCode, templateId, bodyValues, headerValues } = args

  const body: Record<string, unknown> = {
    country_code: countryCode,
    mobile,
    wid: templateId,
    type: 'text',
  }
  if (bodyValues) body.bodyValues = bodyValues
  if (headerValues) body.headerValues = headerValues

  const response = await fetch(`${AUTHKEY_BASE}/requestjson.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Docs say "Authorization: Basic <authkey>" — unverified whether
      // this means HTTP Basic auth (base64 user:pass) or literally the
      // literal string "Basic <api key>". Confirm against a live account
      // before relying on this in production.
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Authkey API error: ${response.status} ${JSON.stringify(data)}`)
  }
  // messageId field name is a guess (Authkey doesn't document the success
  // response) — verify against a real response and correct this.
  const messageId =
    data && typeof data === 'object' && 'MessageId' in (data as Record<string, unknown>)
      ? String((data as Record<string, unknown>).MessageId)
      : undefined
  return { raw: data, messageId }
}

/**
 * Account balance check — documented at authkey.io/api-docs
 * (GET getbalance.php). Genuinely useful as a first smoke test: if this
 * doesn't return a clean 200 with real credentials, nothing else will.
 */
export async function getBalance(args: AuthkeyCredentials): Promise<unknown> {
  const response = await fetch(
    `${AUTHKEY_BASE}/getbalance.php?authkey=${encodeURIComponent(args.apiKey)}`
  )
  if (!response.ok) {
    throw new Error(`Authkey balance check failed: ${response.status}`)
  }
  return response.json()
}

// ============================================================
// NOT CONFIRMED — Authkey's public docs say nothing about these.
// Every function below is a stub until we have it in writing.
// ============================================================

export interface SendFreeformTextArgs extends AuthkeyCredentials {
  mobile: string
  countryCode: string
  text: string
}

/**
 * A live agent replying to an open conversation needs to send plain text,
 * not a pre-approved template — this is what Meta's Cloud API calls a
 * "session message" (free inside the 24h customer service window).
 * Authkey's docs show no such endpoint; every example requires a `wid`.
 * Confirm with Authkey whether this exists before Reception/Sales can
 * reply freely in the CRM inbox.
 */
export async function sendFreeformTextMessage(
  _args: SendFreeformTextArgs
): Promise<AuthkeySendResult> {
  throw new AuthkeyNotConfirmedError(
    'sendFreeformTextMessage',
    'a documented endpoint for a plain-text session reply (not template-based), or ' +
      'confirmation that every send — even in-session agent replies — must go through ' +
      'an approved template on Authkey'
  )
}

export interface DownloadMediaArgs extends AuthkeyCredentials {
  mediaId: string
}

/** How do we fetch a photo/PDF a customer sent us? No docs on this. */
export async function downloadInboundMedia(_args: DownloadMediaArgs): Promise<Blob> {
  throw new AuthkeyNotConfirmedError(
    'downloadInboundMedia',
    'the media download URL format Authkey\'s webhook gives us, whether it needs auth, ' +
      'and how long it stays valid'
  )
}

/**
 * Verifies the signature/secret on an inbound Authkey webhook POST.
 * Currently a pass-through — DO NOT deploy the webhook route with this
 * unimplemented. Meta's Cloud API HMAC-SHA256-signs every webhook with
 * the app secret; we don't yet know if Authkey does the equivalent.
 */
export function verifyAuthkeyWebhookSignature(_req: Request): boolean {
  throw new AuthkeyNotConfirmedError(
    'verifyAuthkeyWebhookSignature',
    'how Authkey signs or secrets its webhook POSTs (header name + algorithm), so an ' +
      'inbound endpoint doesn\'t accept forged requests from anyone who finds the URL'
  )
}
