# Authkey integration — what's confirmed, what isn't

This fork replaces wacrm's Meta Cloud API layer (`src/lib/whatsapp/meta-api.ts`)
with an Authkey-backed one (`src/lib/whatsapp/authkey-api.ts`), so IntenCiv can
keep 7399000299 on Authkey exactly as it is today (SMS, OTP, DLT, existing
WhatsApp campaigns) while adding a self-built multi-agent CRM on top.

Authkey's *public* docs (authkey.io/whatsapp-api-docs, authkey.io/api-docs)
only cover template-based sending and a balance check. Everything else below
is undocumented publicly and needs a direct answer from Authkey — get these
from the account dashboard, support chat, or the account manager, in this
order, before wiring the rest of the app:

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
Every example in Authkey's docs sends through a `wid` (approved template).
A live agent answering an open chat needs to send plain text, not always a
template — confirm whether Authkey has this, or whether every reply,
including live agent replies, must go through a template.

## 4. `requestjson.php` response shape (blocks: knowing if a send worked)
Send one real template message and capture the actual response body —
success and a deliberately-broken failure case (bad `wid`, bad number).
`sendTemplateMessage` in `authkey-api.ts` currently guesses at a `MessageId`
field; correct it once we've seen a real response.

## 5. Media download for inbound attachments (blocks: viewing what customers send)
When a customer sends a photo or PDF, what does Authkey's webhook give us to
fetch it — a direct URL, an id we exchange for a URL? Auth required? How long
is it valid? (Test-report sharing runs the other way — outbound — so this
specifically matters for anything a *customer* sends in.)

## 6. Confirm the send/webhook API works without the paid Agent Dashboard
This is the whole premise of building a CRM instead of paying per agent —
get this in writing before more engineering time goes in.

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
