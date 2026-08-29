import { NextResponse } from 'next/server'

// ============================================================
// Authkey WhatsApp webhook — DIAGNOSTIC LOGGER (temporary)
//
// Authkey's dashboard ("Configure Webhook") only documents the query
// params it appends for non-WhatsApp channels (Mobile, Email, Status,
// Log ID, Time) and doesn't publish an inbound-message payload spec.
// Rather than keep guessing from screenshots, this route just logs
// everything Authkey actually sends — method, full URL incl. query
// string, headers, and raw body — to stdout, which Railway captures.
// Point Authkey's "Whatsapp" channel webhook at this URL, trigger one
// real inbound message (and, separately, one outbound send to see the
// delivery-status callback), then read the Railway deploy logs for
// `[authkey-webhook]` to see the real shape. Once confirmed, replace
// this with a real handler — see docs/authkey-integration-todo.md.
//
// Auth: matches the pattern of the account's existing SMS webhook
// (intenciv.in/webhook.php?token=...) — a shared secret in the URL's
// `token` query param, checked against AUTHKEY_WEBHOOK_TOKEN. Use the
// full URL below (Railway env vars, not this file, hold the value):
//   https://<railway-domain>/api/whatsapp/authkey-webhook?token=<value>
// ============================================================

const EXPECTED_TOKEN = process.env.AUTHKEY_WEBHOOK_TOKEN

async function logAndRespond(request: Request, method: string) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  let bodyText = ''
  try {
    bodyText = await request.text()
  } catch {
    bodyText = '<unreadable body>'
  }

  console.log(
    '[authkey-webhook]',
    JSON.stringify(
      {
        method,
        url: request.url,
        query: Object.fromEntries(url.searchParams.entries()),
        headers,
        body: bodyText,
      },
      null,
      2
    )
  )

  if (!EXPECTED_TOKEN || token !== EXPECTED_TOKEN) {
    console.warn('[authkey-webhook] rejected: token missing/mismatched, or AUTHKEY_WEBHOOK_TOKEN unset')
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}

export async function GET(request: Request) {
  return logAndRespond(request, 'GET')
}

export async function POST(request: Request) {
  return logAndRespond(request, 'POST')
}
