# Email Worker

Cloudflare Email Worker that receives forwarded bills at
`*@inbox.<yourdomain>` and POSTs them to HomeKeeper's
`/api/inbox/email` webhook so they auto-import as Invoice documents.

## One-time setup

Prereqs: your domain is on Cloudflare and Email Routing is enabled.

```bash
cd cloudflare/email-worker
npm install
npx wrangler login
npx wrangler secret put HOMEKEEPER_WEBHOOK_URL    # e.g. https://homekeeper.app/api/inbox/email
npx wrangler secret put INBOX_WEBHOOK_SECRET      # any random string; mirror it in Vercel
npx wrangler deploy
```

After deploy, in the Cloudflare dashboard:

1. Open your domain → **Email** → **Email Routing**.
2. Under **Routes**, set the **catch-all address** action to **Send to a Worker** → pick `homekeeper-inbox`.

That's it. Any email landing at `*@<yourdomain>` will hit the worker
and be forwarded to HomeKeeper.

## How it routes mail to a specific home

The recipient local-part is the inbox slug — e.g. `bills-a3f9k2b8` from
`bills-a3f9k2b8@inbox.example.com`. HomeKeeper looks it up in the
`home_inboxes` table to find the home. Each home gets its own slug
generated from Settings → Auto-import bills.
