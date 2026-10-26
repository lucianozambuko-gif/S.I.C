import nodemailer from 'nodemailer';

let transport = null;
if (process.env.SMTP_HOST) {
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export const mailEnabled = () => Boolean(transport);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Sends an email. Never throws: a mail failure must not lose a lead. */
export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!to) return;
  if (!transport) {
    console.log(`[mail:off] would send "${subject}" to ${to}`);
    return;
  }
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to, subject, html, text, replyTo,
    });
  } catch (err) {
    console.error('[mail] send failed:', err.message);
  }
}

/** Black-and-gold email shell matching the site. */
export function emailLayout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#0A0908;font-family:Helvetica,Arial,sans-serif;color:#F5EEE4">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0908;padding:32px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#15120F;border:1px solid #3a3024;border-radius:16px">
<tr><td style="padding:28px 32px 8px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:4px;color:#D9B77E">S.I.C · SERVICE INVESTMENT CONNECTIONS</td></tr>
<tr><td style="padding:8px 32px 0;font-family:Georgia,serif;font-style:italic;font-size:30px;line-height:1.15;color:#E9CB8B">${esc(title)}</td></tr>
<tr><td style="padding:18px 32px 30px;font-size:15px;line-height:1.6;color:#d4cabd">${bodyHtml}</td></tr>
<tr><td style="padding:18px 32px;border-top:1px solid #2a2520;font-size:12px;color:#8a7f72">S.I.C · Johannesburg, South Africa · Est. 2016</td></tr>
</table></td></tr></table></body></html>`;
}

export function detailsTable(pairs) {
  const rows = pairs
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px 8px 0;color:#8a7f72;font-size:13px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:8px 0;color:#F5EEE4;font-size:14px;white-space:pre-wrap">${esc(v)}</td></tr>`
    )
    .join('');
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>`;
}
