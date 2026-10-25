export interface SmsSendOptions {
  to: string;
  body: string;
  eventType?: string;
  complaintId?: string;
  userId?: string;
}

export interface SmsSendResult {
  success: boolean;
  status: 'sent' | 'delivered' | 'failed' | 'skipped';
  messageId?: string;
  errorCategory?:
    | 'UNCONFIGURED'
    | 'INVALID_NUMBER'
    | 'RATE_LIMITED'
    | 'AUTH_FAILURE'
    | 'INSUFFICIENT_FUNDS'
    | 'PROVIDER_ERROR'
    | 'NETWORK_ERROR'
    | 'UNKNOWN';
  errorDetails?: string;
  isRetryable: boolean;
}

// Config Helper
export function getSmsConfig() {
  const provider = (process.env.SMS_PROVIDER || 'twilio').toLowerCase();
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';

  const isConfigured = Boolean(accountSid && authToken && fromNumber);

  return {
    provider,
    accountSid,
    authToken,
    fromNumber,
    appBaseUrl,
    isConfigured,
  };
}

// Phone Number Normalization to E.164
// Handles 10-digit Indian numbers, leading zeros, and full international formats
export function normalizeToE164(rawPhone: string): string | null {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  // Remove spaces, hyphens, brackets, dots
  let cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]/g, '');

  // Handle leading +
  if (cleaned.startsWith('+')) {
    const digitsOnly = cleaned.substring(1);
    if (/^\d{8,15}$/.test(digitsOnly)) {
      return '+' + digitsOnly;
    }
    return null;
  }

  // Handle 0-prefixed 10-digit Indian numbers (e.g. 09876543210 -> +919876543210)
  if (cleaned.startsWith('0') && cleaned.length === 11 && /^\d+$/.test(cleaned)) {
    cleaned = cleaned.substring(1);
  }

  // Handle standard 10-digit Indian mobile numbers (starts with 6, 7, 8, or 9)
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // Handle 12-digit Indian numbers with 91 prefix without plus (e.g. 919876543210)
  if (cleaned.startsWith('91') && cleaned.length === 12 && /^\d+$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return null;
}

// In-Memory Rate Limiting for SMS Spam Protection (sliding window per phone number)
interface RateLimitRecord {
  timestamps: number[];
  lastMessageHash?: string;
  lastMessageTime?: number;
}

const phoneRateLimits: Map<string, RateLimitRecord> = new Map();
const MAX_SMS_PER_PHONE_PER_HOUR = 6;
const DUPLICATE_WINDOW_MS = 3 * 60 * 1000; // 3 minutes duplicate suppression

export function checkSmsRateLimit(phone: string, messageBody: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const record = phoneRateLimits.get(phone) || { timestamps: [] };

  // Filter timestamps within last 1 hour
  const oneHourAgo = now - 60 * 60 * 1000;
  record.timestamps = record.timestamps.filter((t) => t > oneHourAgo);

  if (record.timestamps.length >= MAX_SMS_PER_PHONE_PER_HOUR) {
    return {
      allowed: false,
      reason: `Hourly SMS rate limit of ${MAX_SMS_PER_PHONE_PER_HOUR} messages reached for this number.`,
    };
  }

  // Check duplicate message within window
  const messageHash = messageBody.trim().toLowerCase();
  if (
    record.lastMessageHash === messageHash &&
    record.lastMessageTime &&
    now - record.lastMessageTime < DUPLICATE_WINDOW_MS
  ) {
    return {
      allowed: false,
      reason: `Duplicate SMS suppressed within 3-minute anti-spam window.`,
    };
  }

  return { allowed: true };
}

export function recordSmsSent(phone: string, messageBody: string): void {
  const now = Date.now();
  const record = phoneRateLimits.get(phone) || { timestamps: [] };
  record.timestamps.push(now);
  record.lastMessageHash = messageBody.trim().toLowerCase();
  record.lastMessageTime = now;
  phoneRateLimits.set(phone, record);
}

// Test Mock Hook
let mockSmsSender: ((opts: SmsSendOptions) => Promise<SmsSendResult>) | null = null;

export function setMockSmsSender(sender: ((opts: SmsSendOptions) => Promise<SmsSendResult>) | null) {
  mockSmsSender = sender;
}

// Reset rate limits for testing
export function _resetSmsRateLimitsForTesting() {
  phoneRateLimits.clear();
  mockSmsSender = null;
}

// Render Concise SMS Template (keeps under 160 chars where possible)
export function renderSmsTemplate(event: {
  eventType: string;
  complaintId?: string;
  status?: string;
  department?: string;
  actionSummary?: string;
}): string {
  const cfg = getSmsConfig();
  const shortLink = event.complaintId
    ? `${cfg.appBaseUrl}?c=${event.complaintId}`
    : cfg.appBaseUrl;

  switch (event.eventType) {
    case 'complaint_submitted':
      return `[REC Bijnor] Complaint #${event.complaintId} registered (${event.department || 'General'}). Track status: ${shortLink}`;

    case 'complaint_assigned':
      return `[REC Bijnor] Task Assigned: #${event.complaintId}. Priority task assigned to your duty roster. Details: ${shortLink}`;

    case 'complaint_reassigned':
      return `[REC Bijnor] Ticket #${event.complaintId} reassigned to ${event.department || 'new staff'}. Track: ${shortLink}`;

    case 'complaint_status_changed':
    case 'complaint_resolved':
      return `[REC Bijnor] Complaint #${event.complaintId} updated to: ${event.status || 'Updated'}. View & feedback: ${shortLink}`;

    case 'complaint_escalated':
      return `[REC Bijnor URGENT] Ticket #${event.complaintId} SLA BREACHED. Auto-escalated to Administration. Details: ${shortLink}`;

    default:
      return `[REC Bijnor Campus Care] #${event.complaintId || 'Notice'}: ${event.actionSummary || 'Update available.'} ${shortLink}`;
  }
}

// Main Send SMS Function
export async function sendSms(opts: SmsSendOptions): Promise<SmsSendResult> {
  // If mock sender hook is registered, use it
  if (mockSmsSender) {
    return mockSmsSender(opts);
  }

  // 1. Normalize phone number to E.164
  const normalizedPhone = normalizeToE164(opts.to);
  if (!normalizedPhone) {
    return {
      success: false,
      status: 'failed',
      errorCategory: 'INVALID_NUMBER',
      errorDetails: `Invalid phone number format: "${opts.to}". Numbers must be valid mobile numbers (e.g. +919876543210).`,
      isRetryable: false,
    };
  }

  // 2. Check rate limit & anti-spam
  const rateLimitCheck = checkSmsRateLimit(normalizedPhone, opts.body);
  if (!rateLimitCheck.allowed) {
    return {
      success: false,
      status: 'skipped',
      errorCategory: 'RATE_LIMITED',
      errorDetails: rateLimitCheck.reason || 'SMS Rate limit reached',
      isRetryable: false,
    };
  }

  const cfg = getSmsConfig();

  // 3. Check if SMS provider is configured
  if (!cfg.isConfigured) {
    return {
      success: false,
      status: 'skipped',
      errorCategory: 'UNCONFIGURED',
      errorDetails: 'SMS provider credentials (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN) not configured. Delivery skipped.',
      isRetryable: false,
    };
  }

  // 4. Dispatch via Twilio REST API
  if (cfg.provider === 'twilio') {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
      const basicAuth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');

      const formData = new URLSearchParams();
      formData.append('To', normalizedPhone);
      formData.append('From', cfg.fromNumber);
      formData.append('Body', opts.body);

      // Abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.message || `Twilio HTTP error ${response.status}`;
        const code = Number(data.code);

        // Analyze Twilio error codes
        if (code === 20003 || response.status === 401) {
          return {
            success: false,
            status: 'failed',
            errorCategory: 'AUTH_FAILURE',
            errorDetails: 'Twilio authentication failed. Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
            isRetryable: false,
          };
        }

        if (code === 21211 || code === 21614 || code === 21408) {
          return {
            success: false,
            status: 'failed',
            errorCategory: 'INVALID_NUMBER',
            errorDetails: `Twilio rejected destination number (${errorMsg})`,
            isRetryable: false,
          };
        }

        if (code === 21606 || code === 20008) {
          return {
            success: false,
            status: 'failed',
            errorCategory: 'INSUFFICIENT_FUNDS',
            errorDetails: 'Twilio account has insufficient funds or inactive balance.',
            isRetryable: false,
          };
        }

        // Retryable status codes (429, 500, 503)
        const isRetryable = response.status === 429 || response.status >= 500;
        return {
          success: false,
          status: 'failed',
          errorCategory: isRetryable ? 'NETWORK_ERROR' : 'PROVIDER_ERROR',
          errorDetails: `Twilio Error [${code || response.status}]: ${errorMsg}`,
          isRetryable,
        };
      }

      // Record successful dispatch into rate limiter
      recordSmsSent(normalizedPhone, opts.body);

      return {
        success: true,
        status: 'sent',
        messageId: data.sid,
        isRetryable: false,
      };
    } catch (err: any) {
      console.error(`[SMS Service] Failed to send SMS to ${normalizedPhone}:`, err.message);
      return {
        success: false,
        status: 'failed',
        errorCategory: 'NETWORK_ERROR',
        errorDetails: `Provider network failure: ${err.message}`,
        isRetryable: true,
      };
    }
  }

  return {
    success: false,
    status: 'skipped',
    errorCategory: 'UNCONFIGURED',
    errorDetails: `Unsupported SMS provider: ${cfg.provider}`,
    isRetryable: false,
  };
}
