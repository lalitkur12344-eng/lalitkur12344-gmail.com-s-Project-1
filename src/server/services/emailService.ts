import nodemailer, { Transporter } from 'nodemailer';

export interface EmailSendOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  eventType?: string;
  complaintId?: string;
}

export interface EmailSendResult {
  success: boolean;
  status: 'sent' | 'delivered' | 'failed' | 'skipped';
  messageId?: string;
  errorCategory?: 'UNCONFIGURED' | 'INVALID_RECIPIENT' | 'AUTH_FAILURE' | 'CONNECTION_ERROR' | 'REJECTED' | 'UNKNOWN';
  errorDetails?: string;
  isRetryable: boolean;
}

// Config Helper
export function getEmailConfig() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.EMAIL_FROM || 'REC Bijnor Campus Care <campuscare@recb.ac.in>';
  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  const isConfigured = Boolean(
    host &&
    user &&
    pass &&
    !user.includes('YOUR_') &&
    !pass.includes('YOUR_') &&
    !host.includes('YOUR_')
  );

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    appBaseUrl,
    isConfigured,
  };
}

// Recipient email validator
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  // Standard RFC 5322 regex subset
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

// Test Mock Hook
let mockEmailSender: ((opts: EmailSendOptions) => Promise<EmailSendResult>) | null = null;

export function setMockEmailSender(sender: ((opts: EmailSendOptions) => Promise<EmailSendResult>) | null) {
  mockEmailSender = sender;
}

// Shared Transporter Cache
let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const cfg = getEmailConfig();
  if (!cfg.isConfigured) return null;

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.user,
        pass: cfg.pass,
      },
      connectionTimeout: 8000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  }

  return cachedTransporter;
}

// Render Reusable HTML Email Template with REC Bijnor Branding
export function renderEmailTemplate(data: {
  headline: string;
  greetingName: string;
  messageLines: string[];
  complaintId?: string;
  category?: string;
  priority?: string;
  status?: string;
  locationArea?: string;
  ctaText?: string;
  ctaUrl?: string;
  securityNotice?: string;
}): { html: string; text: string } {
  const cfg = getEmailConfig();
  const ctaUrl = data.ctaUrl || (data.complaintId ? `${cfg.appBaseUrl}?complaint=${data.complaintId}` : cfg.appBaseUrl);
  const ctaText = data.ctaText || 'View Complaint in Portal';

  // Text version
  let text = `RAJIKYA ENGINEERING COLLEGE, BIJNOR\nCAMPUS CARE MANAGEMENT SYSTEM\n========================================\n\n`;
  text += `Hello ${data.greetingName},\n\n`;
  text += `${data.headline}\n\n`;
  for (const line of data.messageLines) {
    text += `${line}\n`;
  }
  if (data.complaintId) {
    text += `\nTicket Details:\n`;
    text += `- Ticket ID: #${data.complaintId}\n`;
    if (data.category) text += `- Category: ${data.category}\n`;
    if (data.priority) text += `- Priority: ${data.priority}\n`;
    if (data.status) text += `- Current Status: ${data.status}\n`;
    if (data.locationArea) text += `- Location: ${data.locationArea}\n`;
  }
  text += `\nPortal Link: ${ctaUrl}\n\n`;
  if (data.securityNotice) {
    text += `Security Notice: ${data.securityNotice}\n\n`;
  }
  text += `REC Bijnor Campus Care | Jhalu Road, Bijnor, UP 246701\n`;
  text += `Emergency Helplines: Substation: +91 98370 11223 | Estate: 01342-241001\n`;

  // HTML version
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.headline}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; line-height: 1.5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background-color: #0f172a; padding: 24px; text-align: left; border-bottom: 3px solid #4338ca; }
    .header-title { color: #ffffff; font-size: 18px; font-weight: 700; margin: 0; }
    .header-sub { color: #94a3b8; font-size: 12px; margin-top: 4px; }
    .content { padding: 28px 24px; }
    .headline { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
    .greeting { font-size: 14px; color: #334155; margin-bottom: 12px; }
    .ticket-card { background: #f1f5f9; border-radius: 8px; border: 1px solid #cbd5e1; padding: 16px; margin: 20px 0; }
    .ticket-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #cbd5e1; font-size: 13px; }
    .ticket-row:last-child { border-bottom: none; }
    .ticket-label { color: #64748b; font-weight: 500; }
    .ticket-val { color: #0f172a; font-weight: 600; }
    .cta-button { display: inline-block; background-color: #4338ca; color: #ffffff !important; font-weight: 600; font-size: 13px; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin: 20px 0 10px 0; text-align: center; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 11px; color: #64748b; }
    .emergency { margin-top: 8px; color: #b91c1c; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-title">Rajkiya Engineering College, Bijnor</div>
      <div class="header-sub">Campus Care &amp; Facilities Management System</div>
    </div>
    <div class="content">
      <div class="greeting">Hello <strong>${data.greetingName}</strong>,</div>
      <div class="headline">${data.headline}</div>
      ${data.messageLines.map((line) => `<p style="font-size: 13px; color: #334155; margin: 8px 0;">${line}</p>`).join('')}

      ${
        data.complaintId
          ? `
      <div class="ticket-card">
        <div class="ticket-row">
          <span class="ticket-label">Ticket Reference:</span>
          <span class="ticket-val" style="color: #4338ca;">#${data.complaintId}</span>
        </div>
        ${data.category ? `<div class="ticket-row"><span class="ticket-label">Category:</span><span class="ticket-val">${data.category}</span></div>` : ''}
        ${data.priority ? `<div class="ticket-row"><span class="ticket-label">Priority:</span><span class="ticket-val">${data.priority}</span></div>` : ''}
        ${data.status ? `<div class="ticket-row"><span class="ticket-label">Status:</span><span class="ticket-val">${data.status}</span></div>` : ''}
        ${data.locationArea ? `<div class="ticket-row"><span class="ticket-label">Campus Area:</span><span class="ticket-val">${data.locationArea}</span></div>` : ''}
      </div>
      `
          : ''
      }

      <div style="text-align: center;">
        <a href="${ctaUrl}" class="cta-button">${ctaText}</a>
      </div>

      ${
        data.securityNotice
          ? `<p style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 20px;">
              <strong>Security Notice:</strong> ${data.securityNotice}
            </p>`
          : ''
      }
    </div>
    <div class="footer">
      <div>This is an official automated notification dispatched by REC Bijnor Campus Care Portal.</div>
      <div>Jhalu Road, Bijnor, Uttar Pradesh 246701</div>
      <div class="emergency">Campus Helplines: Substation: +91 98370 11223 | Estate Office: 01342-241001</div>
    </div>
  </div>
</body>
</html>
`;

  return { html, text };
}

// Render Reusable OTP Verification Email Template
export function renderOtpEmailTemplate(params: {
  greetingName: string;
  otp: string;
  purpose: string;
  expiresInMinutes: number;
}): { html: string; text: string } {
  const cfg = getEmailConfig();
  const text = `RAJIKYA ENGINEERING COLLEGE, BIJNOR\nCAMPUS CARE MANAGEMENT SYSTEM\n========================================\n\nHello ${params.greetingName},\n\nYour one-time verification code (OTP) for ${params.purpose} is:\n\n${params.otp}\n\nThis verification code is valid for ${params.expiresInMinutes} minutes.\nDo NOT share this code with anyone. Institutional staff or administrators will never ask for your verification code.\n\nPortal: ${cfg.appBaseUrl}\nRajkiya Engineering College, Jhalu Road, Bijnor, UP 246701\n`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verification Code - REC Bijnor Campus Care</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 24px 12px; color: #1e293b; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
    .header { background: linear-gradient(135deg, #1e1b4b, #312e81, #4338ca); color: #ffffff; padding: 28px 24px; text-align: center; }
    .badge { display: inline-block; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 6px; padding: 4px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .title { font-size: 20px; font-weight: 800; margin: 0 0 4px 0; }
    .content { padding: 32px 28px; line-height: 1.6; }
    .otp-box { background: #f8fafc; border: 2px dashed #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: #312e81; letter-spacing: 8px; margin: 8px 0; }
    .otp-sub { font-size: 12px; color: #64748b; }
    .security-callout { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 0 8px 8px 0; font-size: 12px; color: #991b1b; margin-top: 20px; }
    .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">REC Bijnor Identity Gateway</div>
      <h1 class="title">Official Verification Code</h1>
      <div style="font-size: 13px; color: #c7d2fe;">Campus Care Management System</div>
    </div>
    <div class="content">
      <p style="margin-top: 0; font-size: 15px;">Hello <strong>${params.greetingName}</strong>,</p>
      <p style="font-size: 14px; color: #334155;">
        You have requested to verify your official college identity for <strong>${params.purpose}</strong>. Use the secure single-use code below to complete your registration.
      </p>
      <div class="otp-box">
        <div class="otp-sub">YOUR SINGLE-USE VERIFICATION CODE</div>
        <div class="otp-code">${params.otp}</div>
        <div class="otp-sub">Valid for the next ${params.expiresInMinutes} minutes</div>
      </div>
      <div class="security-callout">
        <strong>Security Notice:</strong> Never disclose this verification code to anyone. College administrators, proctors, and technical staff will never ask for your code.
      </div>
    </div>
    <div class="footer">
      <div>Rajkiya Engineering College, Jhalu Road, Bijnor, UP 246701</div>
      <div style="margin-top: 4px;">Automated security notification · Do not reply to this email</div>
    </div>
  </div>
</body>
</html>`;

  return { html, text };
}

// Main Send Email Function
export async function sendEmail(opts: EmailSendOptions): Promise<EmailSendResult> {
  // If mock sender hook is registered (for testing), use it
  if (mockEmailSender) {
    return mockEmailSender(opts);
  }

  // Validate recipient email address
  if (!isValidEmail(opts.to)) {
    return {
      success: false,
      status: 'failed',
      errorCategory: 'INVALID_RECIPIENT',
      errorDetails: `Invalid recipient email address format: "${opts.to}"`,
      isRetryable: false, // Never retry malformed emails
    };
  }

  const cfg = getEmailConfig();

  // If SMTP is not configured, do not pretend to send
  if (!cfg.isConfigured) {
    return {
      success: false,
      status: 'skipped',
      errorCategory: 'UNCONFIGURED',
      errorDetails: 'SMTP credentials not configured in environment. Delivery skipped.',
      isRetryable: false,
    };
  }

  const transporter = getTransporter();
  if (!transporter) {
    return {
      success: false,
      status: 'skipped',
      errorCategory: 'UNCONFIGURED',
      errorDetails: 'SMTP Transporter could not be created.',
      isRetryable: false,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to: opts.to.trim(),
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });

    return {
      success: true,
      status: 'sent',
      messageId: info.messageId,
      isRetryable: false,
    };
  } catch (err: any) {
    const errMsg = String(err.message || err);
    console.error(`[Email Service] Failed to send email to ${opts.to}:`, errMsg);

    // Error categorization
    if (errMsg.includes('Invalid login') || errMsg.includes('EAUTH') || errMsg.includes('Username and Password not accepted')) {
      return {
        success: false,
        status: 'failed',
        errorCategory: 'AUTH_FAILURE',
        errorDetails: 'SMTP Authentication failed. Please check SMTP_USER and SMTP_PASS credentials.',
        isRetryable: false,
      };
    }

    if (errMsg.includes('EENVELOPE') || errMsg.includes('No recipients defined') || errMsg.includes('550') || errMsg.includes('553')) {
      return {
        success: false,
        status: 'failed',
        errorCategory: 'REJECTED',
        errorDetails: `Mailbox unavailable or rejected by host: ${errMsg}`,
        isRetryable: false,
      };
    }

    // Network / timeout error (transient, retryable)
    return {
      success: false,
      status: 'failed',
      errorCategory: 'CONNECTION_ERROR',
      errorDetails: `Temporary SMTP connection error: ${errMsg}`,
      isRetryable: true,
    };
  }
}

// Reset Transporter cache (useful after env change or in tests)
export function _resetEmailTransporterForTesting() {
  cachedTransporter = null;
  mockEmailSender = null;
}
