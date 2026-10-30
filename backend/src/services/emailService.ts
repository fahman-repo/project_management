import nodemailer, { Transporter } from 'nodemailer';
import env from '../config/env';

let transporter: Transporter | null = null;

export function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (!env.SMTP_HOST) return null;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        }
      : undefined,
  });

  return transporter;
}

/**
 * Send an email via SMTP or fallback to console log if SMTP is not configured.
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}): Promise<{ sent: boolean; simulated: boolean; messageId?: string; error?: string }> {
  const mailer = getTransporter();

  if (!mailer) {
    // eslint-disable-next-line no-console
    console.log(
      `[emailService:fallback] (SMTP not configured) -> To: ${to} | Subject: "${subject}" | Content preview: ${
        text ? text.slice(0, 100) : 'HTML email'
      }`
    );
    return { sent: false, simulated: true };
  }

  try {
    const info = await mailer.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
    return { sent: true, simulated: false, messageId: info.messageId };
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error(`[emailService] Failed sending to ${to}:`, error.message);
    return { sent: false, simulated: false, error: error.message };
  }
}

/**
 * Send a styled deadline reminder email for a Task or Milestone.
 */
export async function sendDeadlineReminder({
  user,
  entityType,
  title,
  projectName,
  dueDate,
  daysLeft,
  link,
}: {
  user: { name: string; email: string };
  entityType: 'task' | 'milestone';
  title: string;
  projectName: string;
  dueDate: string;
  daysLeft: number;
  link: string;
}): Promise<{ sent: boolean; simulated: boolean; error?: string }> {
  if (!user || !user.email) return { sent: false, simulated: false };

  const entityLabel = entityType === 'task' ? 'Task' : 'Milestone';
  const urgencyLabel = daysLeft === 1 ? 'Besok (H-1)' : `${daysLeft} Hari Lagi (H-3)`;
  const urgencyColor = daysLeft === 1 ? '#ef4444' : '#f59e0b';
  const actionUrl = `${env.FRONTEND_URL}${link}`;

  const subject = `[Pengingat Tenggat ${urgencyLabel}] ${entityLabel}: ${title}`;

  const text = `Halo ${user.name},\n\n` +
    `Pengingat bahwa ${entityLabel.toLowerCase()} "${title}" pada proyek "${projectName}" akan jatuh tempo dalam ${daysLeft} hari (${dueDate}).\n\n` +
    `Lihat detail di: ${actionUrl}\n\n` +
    `Salam,\nProjectFlow System`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { padding: 24px; border-bottom: 1px solid #f1f5f9; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 9999px; color: #ffffff; background-color: ${urgencyColor}; }
    .content { padding: 24px; }
    .item-title { font-size: 18px; font-weight: 700; margin: 12px 0 6px 0; color: #0f172a; }
    .meta { font-size: 13px; color: #64748b; margin-bottom: 20px; }
    .button { display: inline-block; background-color: #4f46e5; color: #ffffff !important; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none; }
    .footer { padding: 16px 24px; background: #f8fafc; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="badge">Jatuh Tempo ${urgencyLabel}</span>
      <h2 class="item-title">${entityLabel}: ${title}</h2>
      <div class="meta">Proyek: <strong>${projectName}</strong> &bull; Tenggat: <strong>${dueDate}</strong></div>
    </div>
    <div class="content">
      <p>Halo <strong>${user.name}</strong>,</p>
      <p>${entityLabel} ini memiliki batas waktu dalam <strong>${daysLeft} hari</strong>. Pastikan progres pekerjaan sudah sesuai dengan jadwal proyek.</p>
      <div style="margin-top: 24px;">
        <a href="${actionUrl}" class="button" target="_blank">Buka ${entityLabel} di ProjectFlow &rarr;</a>
      </div>
    </div>
    <div class="footer">
      Pemberitahuan otomatis dari sistem ProjectFlow. Harap jangan membalas email ini secara langsung.
    </div>
  </div>
</body>
</html>
  `;

  return sendEmail({
    to: user.email,
    subject,
    text,
    html,
  });
}

export default {
  sendEmail,
  sendDeadlineReminder,
};

