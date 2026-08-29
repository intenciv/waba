# Pushing this to GitHub

1. Create a new **empty** repository at https://github.com/new
   - Owner: your `intenciv` account (or an org, if you've set one up)
   - Name: `intenciv-whatsapp-crm` (or whatever you prefer — just update the
     remote URL below to match)
   - Leave "Add a README", ".gitignore" and "license" all **unchecked** —
     this zip already has a git history; an auto-created file on GitHub's
     side would conflict with it on first push.
   - Visibility: **Private** (this will hold Authkey/Supabase credentials
     later, even though none are committed right now).

2. Unzip this file, then from a terminal inside the unzipped folder:

   ```bash
   cd intenciv-whatsapp-crm
   git remote add origin https://github.com/<your-username>/intenciv-whatsapp-crm.git
   git push -u origin master
   ```

   If you're prompted for a password, GitHub no longer accepts your account
   password there — use a personal access token instead (Settings →
   Developer settings → Personal access tokens), or push via SSH if you
   have that set up.

3. Confirm it landed: refresh the GitHub repo page, you should see this
   README, `docs/authkey-integration-todo.md`, and `src/lib/whatsapp/authkey-api.ts`.

## What's in this zip

- A fork of [ArnasDon/wacrm](https://github.com/ArnasDon/wacrm) (MIT), renamed
  and re-described for IntenCiv — see the top of `README.md`.
- `src/lib/whatsapp/authkey-api.ts` — the Authkey messaging adapter. Two
  functions are real (template send, balance check); the rest throw a clear
  `AuthkeyNotConfirmedError` on purpose — see next file.
- `docs/authkey-integration-todo.md` — the six specific things to get from
  Authkey (payload shape, signature scheme, free-text send, etc.) before the
  webhook and live-reply pieces can be finished for real, in priority order.
- `.env.local.example` — updated with `AUTHKEY_API_KEY` in place of Meta's
  `META_APP_SECRET`.

## Once it's on GitHub

Come back to this chat and tell me the repo URL — I'll pick up from there:
connect it to a Railway project (already authenticated in this session),
provision Supabase, and keep building out the Authkey adapter as answers
come back from item by item in `docs/authkey-integration-todo.md`.
