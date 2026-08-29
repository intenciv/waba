/**
 * Authkey WhatsApp API helpers — replacement for ./meta-api.ts.
 *
 * IMPORTANT: this file is intentionally incomplete. It implements only the
 * operations Authkey's public docs (authkey.io/whatsapp-api-docs,
 * authkey.io/api-docs) actually document: template sends (single + bulk),
 * balance check. Everything else throws AuthkeyNotConfirmedError on
 * purpose, rather than guessing a request/response shape Authkey hasn't
 * published — a wrong guess here would fail silently against a real
 * webhook and be far worse than an explicit error.
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

export interface BulkRecipient {
  /** Recipient's national number, no country code. */
  mobile: string
  /** Body placeholder values for this recipient, e.g. { "1": "Priya" }. */
  bodyValues?: Record<string, string>
  /** Only for media templates: overrides the top-level headerValues per recipient. */
  headerValues?: { headerData: string }
}

export interface SendBulkTemplateMessageArgs extends AuthkeyCredentials {
  /** e.g. "91" for India. Applies to every recipient in this call. */
  countryCode: string
  /** Authkey's approved-template id ("wid" in their docs). */
  templateId: string
  /** 'text' for a plain/variable template, 'media' for an image/doc/video header. */
  type: 'text' | 'media'
  /** Up to 200 recipients per call (Authkey's documented cap for this endpoint). */
  recipients: BulkRecipient[]
  /** Dynamic value for a template's button (e.g. a per-recipient tracking param). */
  buttonParamValue?: string
  /** Dynamic value for a "copy offer code" button. */
  copyCodeValue?: string
  /** Limited-Time-Offer expiry, Unix time in milliseconds (only with copyCodeValue). */
  expirationTimeMs?: string
}

/**
 * Send one template to up to 200 recipients in a single call, with each
 * recipient getting their own bodyValues/headerValues.
 * Documented at https://authkey.io/whatsapp-api-docs
 * (POST requestjson_v2.0.php, "version": "2.0").
 *
 * Maps naturally onto this CRM's existing Broadcasts feature
 * (broadcasts / broadcast_recipients tables, migration 037/038) — the
 * broadcast sender can batch its recipient list into calls of <=200 here
 * instead of one Authkey request per contact.
 */
export async function sendBulkTemplateMessage(
  args: SendBulkTemplateMessageArgs
): Promise<AuthkeySendResult> {
  const {
    apiKey,
    countryCode,
    templateId,
    type,
    recipients,
    buttonParamValue,
    copyCodeValue,
    expirationTimeMs,
  } = args

  if (recipients.length === 0) {
    throw new Error('sendBulkTemplateMessage: recipients must not be empty')
  }
  if (recipients.length > 200) {
    throw new Error(
      `sendBulkTemplateMessage: Authkey's v2.0 endpoint caps a single call at 200 ` +
        `recipients; got ${recipients.length}. Split into batches before calling.`
    )
  }

  const body: Record<string, unknown> = {
    version: '2.0',
    country_code: countryCode,
    wid: templateId,
    type,
    data: recipients.map((r) => {
      const entry: Record<string, unknown> = { mobile: r.mobile }
      if (r.bodyValues) entry.bodyValues = r.bodyValues
      if (r.headerValues) entry.headerValues = r.headerValues
      return entry
    }),
  }
  if (buttonParamValue) body.button_param_value = buttonParamValue
  if (copyCodeValue) body.copy_code_value = copyCodeValue
  if (expirationTimeMs) body.expiration_time_ms = expirationTimeMs

  const response = await fetch(`${AUTHKEY_BASE}/requestjson_v2.0.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Authkey bulk API error: ${response.status} ${JSON.stringify(data)}`)
  }
  // Response shape for the v2.0 bulk endpoint is undocumented (same caveat
  // as sendTemplateMessage) — log and tighten once seen against a real
  // account.
  return { raw: data }
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
 * Authkey's docs show no such endpoint; every example — including the
 * bulk v2.0 endpoint above — requires a `wid`. Confirm with Authkey
 * whether this exists before Reception/Sales can reply freely in the
 * CRM inbox.
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
