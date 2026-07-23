import { Resend } from 'resend';
import { env } from '@/config/env';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  if (!resend) {
    console.warn(`[mailer] RESEND_API_KEY not configured. Password reset code for ${to}: ${code}`);
    return;
  }

  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject: 'Your House of Seya password reset code',
    html: `
      <p>Use the code below to reset your House of Seya password. It expires in 10 minutes.</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}
