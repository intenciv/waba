# Authkey integration — what's confirmed, what isn't

This fork replaces wacrm's Meta Cloud API layer (`src/lib/whatsapp/meta-api.ts`)
with an Authkey-backed one (`src/lib/whatsapp/authkey-api.ts`), so IntenCiv can
keep 7399000299 on Authkey exactly as it is today (SMS, OTP, DLT, existing
WhatsApp campaigns) while adding a self-built multi-agent CRM on top.

Authkey's *public* docs (authkey.io/whatsapp-api-docs, authkey.io/api-docs)
cover template-based sending (single + bulk, up to 200 recipients per call),
a media/document header variant, and a balance check. Everything else below
is still undocumented publicly and needs a direct answer from Authkey — get
these from the account dashboard, support chat, or the account manager, in
this order, before wiring the rest of the app:

## 1. Inbound webhook payload (blocks: receiving any message at all)
Send yourself a test WhatsApp message on 7399000299 with the webhook pointed
at a request-bin/logging endpoint, and get the *exact* JSON Authkey POSTs.
Needed fields to confirm, matching what `src/app/api/whatsapp/webhook/route.ts`
expects per message:
- message body (text)
- sender's number
- a unique message id (for de-duplication)
- timestamp
- media/document metadata: type, an id or URL, filename, mime type
- how a status update (delivered/read) is distinguished from a new message

## 2. Webhook authentication (blocks: deploying the webhook safely)
Does Authkey sign the POST (a header + HMAC, like Meta's `X-Hub-Signature-256`)
or use a shared secret in the URL? Without this, the webhook endpoint is a
public URL anyone could POST fake messages to. `verifyAuthkeyWebhookSignature`
in `authkey-api.ts` throws until this is answered — that's deliberate, not a
bug to silently work around.

## 3. Free-form / session-reply send (blocks: agents replying live)
Every example in Authkey's docs — including the bulk v2.0 endpoint added
2026-08-29 — sends through a `wid` (approved template), even the "no
variable" case. A live agent answering an open chat needs to send plain
text, not always a template — confirm whether Authkey has this, or whether
every reply, including live agent replies, must go through a template.

## 4. `requestjson.php` / `requestjson_v2.0.php` response shape (blocks: knowing if a send worked)
Send one real template message (single and bulk) and capture the actual
response body — success and a deliberately-broken failure case (bad `wid`,
bad number). `sendTemplateMessage` and `sendBulkTemplateMessage` in
`authkey-api.ts` currently just return the raw parsed JSON and guess at a
`MessageId` field on the single-send path; correct both once we've seen a
real response.
**Note:** the *request* shape (bodyValues, headerValues, country_code,
mobile, wid, type) is now confirmed from Authkey's docs and matches what's
implemented — only the response shape is still unverified.

## 5. Media download for inbound attachments (blocks: viewing what customers send)
When a customer sends a photo or PDF, what does Authkey's webhook give us to
fetch it — a direct URL, an id we exchange for a URL? Auth required? How long
is it valid? (Test-report sharing runs the other way — outbound — so this
specifically matters for anything a *customer* sends in.)

## 6. Confirm the send/webhook API works without the paid Agent Dashboard
This is the whole premise of building a CRM instead of paying per agent —
get this in writing before more engineering time goes in.

---

## Confirmed 2026-08-29 (implemented)

Authkey's docs (pasted into this project's chat) confirmed and added:

- **Single template send** (`sendTemplateMessage`, POST `requestjson.php`) —
  request shape confirmed correct; already implemented.
- **Bulk template send** (`sendBulkTemplateMessage`, POST
  `requestjson_v2.0.php`, `"version": "2.0"`) — up to 200 recipients per
  call, each with their own `bodyValues`/`headerValues`. Maps directly onto
  this CRM's existing Broadcasts feature (`broadcasts` /
  `broadcast_recipients` tables) — the broadcast sender can batch its
  recipient list into calls of ≤200 instead of one Authkey request per
  contact. Also supports `button_param_value`, `copy_code_value`, and
  `expiration_time_ms` (LTO offers) — not wired up in the CRM UI yet since
  they're offer/coupon-template features, not immediately relevant to
  IntenCiv's report/appointment/reminder use cases, but the function accepts
  them if a future template needs them.
- **GET-based media send** (`request.php`, `template_type=media`) —
  documented but not implemented as a separate function; the POST JSON path
  (`sendTemplateMessage` with `headerValues`) already covers the same case
  and is more consistent with the rest of this file, so it wasn't
  duplicated.
- **Balance check** (`getBalance`, GET `getbalance.php`) — unchanged, was
  already implemented and confirmed correct.

None of this resolves items 1, 2, 3, 5, or 6 above — those are all about
**inbound** messaging and live agent replies, which Authkey's public docs
still don't cover at all.

---

## Also not carried over from wacrm as-is (needs its own decision, not just an API swap)

wacrm's Settings → WhatsApp connection flow (`src/components/settings/whatsapp-config.tsx`)
walks the *account owner* through Meta's own embedded signup — phone number
verification and WABA-to-app subscription via `verifyPhoneNumber` /
`registerPhoneNumber` / `subscribeWabaToApp` in `meta-api.ts`. None of that
applies to an Authkey-fronted number: 7399000299 is already registered and
managed on Authkey's side. That settings screen needs to become "paste your
Authkey API key" instead of "connect via Meta" — a UI change, not just a
function swap.

Likewise, template creation/submission (`submitMessageTemplate`,
`editMessageTemplate`, resumable media upload for template headers) calls
Meta's app directly for template approval. If Authkey handles template
submission on its own dashboard (likely, as a BSP), that whole flow may not
belong in the CRM at all — templates get created in Authkey's console and
just *referenced by id* (`wid`) from here.

## Diagnostic webhook deployed 2026-08-29

Rather than keep inferring the inbound payload shape from the Authkey
dashboard's webhook-config screen, we deployed a logging-only route that
captures whatever Authkey actually sends:

- Route: `src/app/api/whatsapp/authkey-webhook/route.ts` — logs method, URL,
  query params, headers and raw body to stdout (visible in Railway deploy
  logs) for both GET and POST, then responds. Rejects with 401 if the
  `token` query param doesn't match `AUTHKEY_WEBHOOK_TOKEN`.
- Railway env var `AUTHKEY_WEBHOOK_TOKEN` set (not committed to the repo).
- Full URL to paste into Authkey's Webhook Setup page:
  `https://web-production-49512.up.railway.app/api/whatsapp/authkey-webhook?token=376a9114c32eb5addfd48babf0c595463d77ae9060d98b25`

Next: create a new webhook entry in Authkey's dashboard with Select Channel
= "Whatsapp" (not "Whastapp Conversation" — unconfirmed which of the two is
the standard inbound-message channel; try "Whatsapp" first, since it's the
plain/unqualified option and closest to the existing SMS entry's pattern),
paste the URL above, method POST. Then:
1. Send an inbound WhatsApp message to the Authkey-connected business
   number from a personal phone.
2. Separately, send one outbound template message through the CRM (or
   Authkey's own console) to see the delivery-status callback shape.
3. Read Railway deploy logs (`get-logs`, filter for `[authkey-webhook]`) to
   see the real payloads for both.
4. Replace this diagnostic route with a real handler once the shape is
   known, and answer items 1/2/3/5/6 above from what was observed.

This is intentionally throwaway code — do not build message-processing
logic on top of it; delete it once the real handler exists.

## Conclusive finding 2026-08-29: inbound webhook does not fire

Tested twice with real inbound WhatsApp messages to the connected number
(after clearing an unrelated chatbot/fallback loop that was intercepting
messages on Authkey's side -- see incident note below):

- Webhook id 1026 (channel `wp`, our diagnostic route, method POST) was
  confirmed active in the dashboard both times.
- Railway deploy logs: zero HTTP requests reached the route for either
  test. No `[authkey-webhook]` log line at all.
- Authkey's own "Webhook Report" page: "No Report Found" both times --
  i.e. Authkey never even attempted a delivery, this isn't a network/auth
  failure on our end.

Conclusion: on this account/plan, Authkey's webhook mechanism does not
dispatch inbound WhatsApp message events, despite the UI allowing you to
configure one for the "wp" channel. Support has been asked directly
(2026-08-29) whether inbound webhook delivery is supported at all, and
whether a pollable Chat/Messages API exists as an alternative. Do not
re-test this same setup again without new guidance from Authkey support --
two independent real-message tests already confirm it's not a fluke.

### Incident note: chatbot/fallback loop

Separately, an old chatbot flow was found still bound to the WhatsApp
number (visible as "Answered"/"Repeated" chat stats and a live entry in
Chat Management for a real inbound message from "Ashok Kumar"). Deleting
the bot without first deactivating it triggered a run of repeated
outbound messages -- stopped via Authkey's dashboard (Chatbot/Fallback/
Chat Management), not anything on our end; Railway logs confirmed zero
involvement from our webhook or app throughout. If this recurs: check
Chatbot (any flow still Active), Fallback (a separate default-reply
config), and Chat Management (per-conversation "end/stop" action) in that
order, and escalate to Authkey support immediately if not resolved within
a few minutes, since it burns balance and risks the number's WhatsApp
quality rating.
