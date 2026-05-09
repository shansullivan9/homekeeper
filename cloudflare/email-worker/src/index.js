// Cloudflare Email Worker — receives mail addressed to
// *@inbox.homekeeper.online, parses out the attachments, and POSTs a
// JSON payload to HomeKeeper's /api/inbox/email webhook.
//
// To deploy:
//   1. cd cloudflare/email-worker
//   2. npm install postal-mime
//   3. npx wrangler deploy
//   4. In the Cloudflare dashboard → your domain → Email → Email Routing →
//      Email Workers → bind this worker as the destination for the catch-all.
//   5. Set worker secrets:
//        npx wrangler secret put HOMEKEEPER_WEBHOOK_URL
//        npx wrangler secret put INBOX_WEBHOOK_SECRET
//
// The worker runs on every incoming email at the catch-all rule.
// Forwarded bills, vendor statements, and HOA notices all flow through
// here.

import PostalMime from 'postal-mime';

export default {
  /**
   * @param {ForwardableEmailMessage} message
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async email(message, env, ctx) {
    if (!env.HOMEKEEPER_WEBHOOK_URL || !env.INBOX_WEBHOOK_SECRET) {
      // Hard-fail loudly in the dashboard logs; bouncing the email is
      // safer than silently dropping it.
      message.setReject('inbox webhook not configured');
      return;
    }

    let parsed;
    try {
      parsed = await PostalMime.parse(message.raw);
    } catch (err) {
      // Bad MIME — bounce so the sender knows their email didn't land.
      message.setReject('could not parse email');
      return;
    }

    const attachments = (parsed.attachments || [])
      .filter((a) => a.content && a.contentType)
      .map((a) => ({
        filename: a.filename || 'attachment',
        contentType: a.mimeType || a.contentType || 'application/octet-stream',
        // postal-mime exposes `content` as Uint8Array; base64-encode it
        // so we can ship it as JSON.
        content: bufferToBase64(a.content),
      }));

    const payload = {
      to: message.to,
      from: parsed.from?.address || message.from || '',
      subject: parsed.subject || '',
      attachments,
    };

    const res = await fetch(env.HOMEKEEPER_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.INBOX_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Don't bounce on 5xx — let the email be retried by Cloudflare.
      // Bouncing would notify the sender that their bill wasn't
      // delivered, which is bad UX for a temporary outage.
      // eslint-disable-next-line no-console
      console.error('webhook failed', res.status, await res.text().catch(() => ''));
      // We still ack to Cloudflare to avoid a redelivery storm — the
      // attachments are lost, but the sender's mail server already
      // believes the email was accepted.
    }
  },
};

function bufferToBase64(buf) {
  // Cloudflare Workers don't have Node's Buffer; do it manually.
  if (typeof buf === 'string') return btoa(buf);
  let binary = '';
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
