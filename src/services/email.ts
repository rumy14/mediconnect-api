import nodemailer from 'nodemailer';
import { config } from '../config';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

export async function sendWelcomeEmail(to: string, firstName: string): Promise<void> {
  // If SMTP is not configured, log and skip
  if (!config.smtp.host || !config.smtp.user) {
    console.log(`[EMAIL] SMTP not configured. Would send welcome email to ${to}`);
    return;
  }

  try {
    const t = getTransporter();
    await t.sendMail({
      from: config.smtp.from,
      to,
      subject: 'Welcome to MediConnect! 🏥',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a1a; color: #f0f4ff; margin: 0; padding: 0; }
            .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
            .card { background: #0f172a; border: 1px solid rgba(37,99,235,0.15); border-radius: 16px; padding: 40px 32px; }
            .logo { font-size: 28px; text-align: center; margin-bottom: 8px; }
            h1 { font-size: 24px; text-align: center; background: linear-gradient(135deg, #2563eb, #7c3aed, #00d4ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin: 0 0 4px 0; }
            .subtitle { text-align: center; color: #64748b; font-size: 14px; margin-bottom: 24px; }
            .greeting { font-size: 16px; margin-bottom: 16px; }
            .btn { display: inline-block; background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fff; padding: 12px 32px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 15px; }
            .btn-wrap { text-align: center; margin: 24px 0; }
            .features { margin: 24px 0; padding: 0; list-style: none; }
            .features li { padding: 8px 0; color: #94a3b8; font-size: 14px; }
            .features li::before { content: '✓ '; color: #22c55e; }
            .footer-text { text-align: center; color: #475569; font-size: 12px; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="logo">◆</div>
              <h1>MediConnect</h1>
              <p class="subtitle">Doctor Appointment Booking</p>
              <p class="greeting">Hi <strong>${firstName}</strong>,</p>
              <p style="color:#94a3b8;font-size:15px;line-height:1.6;">
                Welcome to <strong>MediConnect</strong>! 🎉<br><br>
                Your account has been created successfully. You can now browse top doctors, check their availability, and book appointments in seconds.
              </p>
              <div class="btn-wrap">
                <a href="https://ai.nma-it.com/mediconnect-v1.0.0.apk" class="btn">📱 Download the App</a>
              </div>
              <ul class="features">
                <li>Browse doctors by specialty</li>
                <li>View real-time availability</li>
                <li>Book and manage appointments</li>
                <li>Get reminders for upcoming visits</li>
              </ul>
              <p style="color:#94a3b8;font-size:13px;line-height:1.5;">
                A welcome call is on its way to your registered phone number — our team will walk you through the app!
              </p>
              <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0;">
              <p style="color:#475569;font-size:13px;text-align:center;">
                NMA IT Consulting<br>
                AI Automation That Actually Works
              </p>
            </div>
            <p class="footer-text">
              © 2026 NMA IT Services. All rights reserved.<br>
              You received this because you created a MediConnect account.
            </p>
          </div>
        </body>
        </html>
      `,
    });
    console.log(`[EMAIL] Welcome email sent to ${to}`);
  } catch (error) {
    console.error('[EMAIL] Failed to send welcome email:', error);
    // Don't throw — email failure shouldn't block registration
  }
}
