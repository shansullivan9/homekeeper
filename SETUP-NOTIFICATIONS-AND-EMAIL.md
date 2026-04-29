# Notifications + email digest setup

These two features ship as **Supabase Edge Functions** and require a
one-time deploy. Until you complete the steps below, the in-app
preferences UI works but no actual push or email is sent.

## 1. Generate VAPID keys (web push only)

```bash
npx web-push generate-vapid-keys
```

It prints a public and private key. Add them to your env:

- `.env.local` (local dev) and your hosting provider (Vercel etc.):
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>`
- Supabase → Project Settings → Edge Functions → Secrets:
  - `VAPID_PUBLIC_KEY=<public key>`
  - `VAPID_PRIVATE_KEY=<private key>`
  - `VAPID_SUBJECT=mailto:you@example.com`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected for
Edge Functions; you do **not** need to set them manually.

## 2. Email provider (weekly digest only)

Create a free [Resend](https://resend.com) account and verify a
sending domain. Set in Supabase → Edge Functions → Secrets:

- `RESEND_API_KEY=<your key>`
- `DIGEST_FROM_EMAIL=HomeKeeper <reports@yourdomain.com>`

(Or swap the `fetch('https://api.resend.com/emails', …)` call in
`supabase/functions/weekly-digest/index.ts` for SendGrid / Postmark
if you prefer.)

## 3. Deploy the functions

From the repo root:

```bash
# install Supabase CLI once
brew install supabase/tap/supabase  # mac
# or: npm install -g supabase

supabase login
supabase link --project-ref <your-project-ref>

supabase functions deploy send-reminders
supabase functions deploy weekly-digest
```

## 4. Schedule them

In Supabase Studio → **Database → Cron Jobs** (or via SQL):

```sql
-- daily reminders at 9am UTC
select cron.schedule(
  'homekeeper-daily-reminders',
  '0 9 * * *',
  $$ select net.http_post(
       url := 'https://<your-project-ref>.functions.supabase.co/send-reminders',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
       )
     ); $$
);

-- weekly digest Mondays at 8am UTC
select cron.schedule(
  'homekeeper-weekly-digest',
  '0 8 * * 1',
  $$ select net.http_post(
       url := 'https://<your-project-ref>.functions.supabase.co/weekly-digest',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret')
       )
     ); $$
);
```

(Replace `<your-project-ref>` with your project subdomain.)

The `cron_secret` parameter is optional — if your function doesn't
verify it, you can drop the Authorization header. To set one:

```sql
alter database postgres set app.settings.cron_secret = 'some-random-string';
```

## 5. Verify

- **Notifications:** sign in, go to Settings → Notifications → tap
  Enable. The in-app permission flow runs and your push endpoint is
  saved to `notification_preferences.push_subscription`. Trigger the
  function manually once to confirm:
  ```bash
  curl -X POST https://<your-project-ref>.functions.supabase.co/send-reminders
  ```
- **Email:** trigger `weekly-digest` the same way; check inboxes for
  every household member with an email on file in `profiles`.

## What's where in the repo

```
worker/index.js                      # SW push handler (next-pwa appends)
app/settings/notifications/page.tsx  # client subscription + prefs UI
supabase/functions/send-reminders/   # daily push fan-out
supabase/functions/weekly-digest/    # weekly email recap
```
