import crypto from 'crypto';
import { Resend } from 'resend';
import { UserProfile, UserRole } from '../db';

/**
 * In-Memory Challenge Store Record
 *
 * NOTE: This in-memory OTP challenge store and rate limit maps are development
 * and single-instance only. For production horizontal clustering or container
 * restarts, migrate to a persistent, distributed store (e.g., Redis).
 */
export interface StoredOtpRecord {
  email: string;
  userId: string;
  role: UserRole;
  otpHash: string;
  salt: string;
  expiresAt: number;
  attemptsRemaining: number;
  createdAt: number;
}

export interface RateLimitRecord {
  lastRequestedAt: number;
  requestTimestamps: number[];
}

export interface RequestOtpResult {
  success: boolean;
  message: string;
  error?: string;
  status?: number;
  messageId?: string;
  isSimulated?: boolean;
  simulatedOtp?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  userId?: string;
  role?: UserRole;
}

class EmailOtpService {
  private resendClient: Resend | null = null;
  private otpStore = new Map<string, StoredOtpRecord>();
  private rateLimitStore = new Map<string, RateLimitRecord>();

  private readonly OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
  private readonly RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_REQUESTS_PER_WINDOW = 5;
  private readonly MAX_VERIFICATION_ATTEMPTS = 5;

  constructor() {
    this.initResendClient();
  }

  private initResendClient(): void {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey && apiKey.trim()) {
      this.resendClient = new Resend(apiKey.trim());
    }
  }

  // Startup configuration validator
  validateConfig(): { valid: boolean; warning?: string } {
    const hmacSecret = process.env.OTP_HMAC_SECRET;
    if (!hmacSecret || hmacSecret.trim().length < 16) {
      return {
        valid: false,
        warning: 'OTP_HMAC_SECRET is missing or shorter than 16 characters in environment variables. OTP hashing will fail safely.',
      };
    }
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey || !resendKey.trim()) {
      return {
        valid: false,
        warning: 'RESEND_API_KEY is not configured. Live email delivery will be unavailable.',
      };
    }
    return { valid: true };
  }

  private getHmacSecret(): string {
    const secret = process.env.OTP_HMAC_SECRET;
    if (!secret || !secret.trim()) {
      throw new Error('FATAL: OTP_HMAC_SECRET environment variable is missing. Set a strong 32+ char secret in .env.');
    }
    return secret.trim();
  }

  getSenderEmail(): string {
    return (process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev').trim();
  }

  private getResend(): Resend | null {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey && apiKey.trim()) {
      if (!this.resendClient) {
        this.resendClient = new Resend(apiKey.trim());
      }
      return this.resendClient;
    }
    return null;
  }

  private hashOtp(otp: string, salt: string, userId: string, role: string): string {
    return crypto
      .createHmac('sha256', this.getHmacSecret())
      .update(`${otp}:${salt}:${userId}:${role}`)
      .digest('hex');
  }

  // Detect if credential looks like a phone number rather than an email address
  isPhoneCredential(credential: string): boolean {
    const trimmed = credential.trim();
    if (trimmed.includes('@')) return false;
    return /^[\d\s\-+()]{7,16}$/.test(trimmed);
  }

  // Rate Limiting & Cooldown check
  private checkRateLimit(key: string): { allowed: boolean; error?: string; remainingSeconds?: number } {
    const now = Date.now();
    const record = this.rateLimitStore.get(key) || {
      lastRequestedAt: 0,
      requestTimestamps: [],
    };

    // 1. Enforce 60-second cooldown
    const elapsedSinceLast = now - record.lastRequestedAt;
    if (elapsedSinceLast < this.RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((this.RESEND_COOLDOWN_MS - elapsedSinceLast) / 1000);
      return {
        allowed: false,
        error: `Please wait ${remainingSeconds} seconds before requesting another verification code.`,
        remainingSeconds,
      };
    }

    // 2. Enforce window rate limit (max 5 requests per 15 minutes)
    const validTimestamps = record.requestTimestamps.filter(
      (ts) => now - ts < this.RATE_LIMIT_WINDOW_MS
    );
    if (validTimestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
      return {
        allowed: false,
        error: 'Too many verification code requests. Please wait a few minutes before trying again.',
      };
    }

    return { allowed: true };
  }

  private recordRequest(key: string): void {
    const now = Date.now();
    const record = this.rateLimitStore.get(key) || {
      lastRequestedAt: 0,
      requestTimestamps: [],
    };
    record.lastRequestedAt = now;
    record.requestTimestamps = [
      ...record.requestTimestamps.filter((ts) => now - ts < this.RATE_LIMIT_WINDOW_MS),
      now,
    ];
    this.rateLimitStore.set(key, record);
  }

  // Professional Sentinel Campus Email Template
  private createEmailHtml(otp: string, fullName: string, role: string): string {
    const formattedRole = role.charAt(0).toUpperCase() + role.slice(1);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sentinel Campus One-Time Passcode</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
          <!-- Header with Sentinel Campus Crimson Accent -->
          <tr>
            <td style="background-color: #800020; padding: 28px 32px; text-align: left;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">Sentinel Campus</h1>
                    <p style="margin: 4px 0 0 0; color: #ffd6df; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Swami Keshvanand Institute of Technology (SKIT), Jaipur</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: #334155;">
                Hello <strong>${fullName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 22px; color: #64748b;">
                You requested a secure login passcode for your <strong>${formattedRole}</strong> institutional account on the Sentinel Campus Portal.
              </p>

              <!-- OTP Display Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center" style="background-color: #fdf2f4; border: 2px dashed #800020; border-radius: 12px; padding: 20px;">
                    <div style="font-size: 11px; font-weight: 700; color: #800020; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 8px;">Your Verification Passcode</div>
                    <div style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #800020; margin: 4px 0;">${otp}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Valid for <strong>5 minutes</strong> &bull; Single-use only</div>
                  </td>
                </tr>
              </table>

              <!-- Security Guidance -->
              <div style="background-color: #f8fafc; border-left: 4px solid #800020; padding: 14px 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
                <p style="margin: 0; font-size: 12px; line-height: 18px; color: #475569;">
                  <strong>Security Advisory:</strong> Never share this code with anyone. SKIT faculty, system administrators, or invigilators will never ask for your verification code.
                </p>
              </div>

              <p style="margin: 24px 0 0 0; font-size: 12px; line-height: 18px; color: #94a3b8;">
                If you did not request this verification code, please ignore this email or notify the SKIT Security Cell immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 16px;">
                Sentinel Campus &bull; IEEE IGNITE 2026 &bull; Problem Statement 23<br>
                Ramnagaria, Jagatpura, Jaipur, Rajasthan 302017
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private createEmailText(otp: string, fullName: string, role: string): string {
    return `Sentinel Campus | SKIT Jaipur

Hello ${fullName},

Your one-time authentication passcode for the Sentinel Campus portal (${role.toUpperCase()}) is:

${otp}

This passcode is valid for 5 minutes and can only be used once.

Security Advisory: Do not disclose this passcode to anyone. SKIT administrators will never ask for your authentication passcode.

If you did not request this passcode, please contact campus security immediately.`;
  }

  // Request & Dispatch OTP
  async requestOtp(
    user: UserProfile | null,
    targetEmail: string,
    requestedRole: UserRole
  ): Promise<RequestOtpResult> {
    const normalizedEmail = targetEmail.trim().toLowerCase();

    // 1. Rate Limiting Check on email
    const rateCheck = this.checkRateLimit(normalizedEmail);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: rateCheck.error,
        status: 429,
      };
    }

    // 2. Cryptographically secure 6-digit OTP
    const plainOtp = crypto.randomInt(100000, 1000000).toString();
    const salt = crypto.randomBytes(16).toString('hex');

    // 3. Timing-attack resistant handling if user is not found or role mismatch
    // Also verify that targetEmail matches user's registered primary or secondary email
    const emailMatchesUser =
      user &&
      (user.email.toLowerCase() === normalizedEmail ||
        user.secondaryEmail?.toLowerCase() === normalizedEmail);

    if (!user || !emailMatchesUser || (user.role !== requestedRole && user.role !== 'admin')) {
      // Perform dummy hashing so execution time matches real user path
      this.hashOtp(plainOtp, salt, 'dummy_user_id', requestedRole);
      this.recordRequest(normalizedEmail);

      // Safe, uniform message: do not reveal if account exists (Requirement 4 & 7)
      return {
        success: true,
        message: 'If an active account is registered with this email for the selected role, a verification code has been dispatched.',
        isSimulated: false,
      };
    }

    // 4. Hash and stage challenge bound to userId, email, and role
    const otpHash = this.hashOtp(plainOtp, salt, user.id, requestedRole);
    const storeKey = `${user.id}:${requestedRole}`;

    const now = Date.now();
    this.otpStore.set(storeKey, {
      email: normalizedEmail,
      userId: user.id,
      role: requestedRole,
      otpHash,
      salt,
      expiresAt: now + this.OTP_EXPIRY_MS,
      attemptsRemaining: this.MAX_VERIFICATION_ATTEMPTS,
      createdAt: now,
    });

    this.recordRequest(normalizedEmail);

    // 5. Send via Resend Email SDK
    const resend = this.getResend();
    // Requirement 5: Simulated OTP enabled ONLY when BOTH NODE_ENV !== 'production' AND ALLOW_SIMULATED_OTP === 'true'
    const allowSimulated =
      process.env.NODE_ENV !== 'production' && process.env.ALLOW_SIMULATED_OTP === 'true';

    if (resend) {
      try {
        const sender = this.getSenderEmail();
        const sendResult = await resend.emails.send({
          from: sender,
          to: normalizedEmail,
          subject: `[Sentinel Campus] Your Verification Passcode: ${plainOtp}`,
          html: this.createEmailHtml(plainOtp, user.fullName, requestedRole),
          text: this.createEmailText(plainOtp, user.fullName, requestedRole),
        });

        if (sendResult.error) {
          // Log sanitized error (no API key or OTP) (Requirement 6)
          console.warn('[Resend] API dispatch error:', {
            name: sendResult.error.name,
            statusCode: (sendResult.error as any).statusCode,
            message: sendResult.error.message,
          });

          // Requirement 7: When email dispatch fails, invalidate the associated OTP challenge
          this.otpStore.delete(storeKey);

          if (allowSimulated) {
            // Re-store challenge for simulated verification in explicit dev mode
            this.otpStore.set(storeKey, {
              email: normalizedEmail,
              userId: user.id,
              role: requestedRole,
              otpHash,
              salt,
              expiresAt: now + this.OTP_EXPIRY_MS,
              attemptsRemaining: this.MAX_VERIFICATION_ATTEMPTS,
              createdAt: now,
            });
            return {
              success: true,
              message: `[DEMO MODE - Resend Restricted] Passcode dispatched: ${plainOtp}`,
              isSimulated: true,
              simulatedOtp: plainOtp,
            };
          }

          return {
            success: false,
            error: `Failed to deliver authentication email: ${sendResult.error.message}`,
            status: (sendResult.error as any).statusCode || 502,
          };
        }

        // Successfully delivered via Resend (Requirement 6: Record message ID)
        const messageId = sendResult.data?.id;
        return {
          success: true,
          message: `Verification passcode dispatched to ${normalizedEmail}. Please check your inbox.`,
          messageId,
          isSimulated: false,
        };
      } catch (err: unknown) {
        const e = err as Error;
        console.error('[Resend] Dispatch exception:', e.message);

        // Invalidate challenge on error
        this.otpStore.delete(storeKey);

        if (allowSimulated) {
          this.otpStore.set(storeKey, {
            email: normalizedEmail,
            userId: user.id,
            role: requestedRole,
            otpHash,
            salt,
            expiresAt: now + this.OTP_EXPIRY_MS,
            attemptsRemaining: this.MAX_VERIFICATION_ATTEMPTS,
            createdAt: now,
          });
          return {
            success: true,
            message: `[DEMO MODE - Mail Exception] Passcode: ${plainOtp}`,
            isSimulated: true,
            simulatedOtp: plainOtp,
          };
        }

        return {
          success: false,
          error: 'Email delivery service temporarily unavailable. Please retry in a few moments.',
          status: 503,
        };
      }
    }

    // If Resend API key is not configured:
    this.otpStore.delete(storeKey);

    if (allowSimulated) {
      this.otpStore.set(storeKey, {
        email: normalizedEmail,
        userId: user.id,
        role: requestedRole,
        otpHash,
        salt,
        expiresAt: now + this.OTP_EXPIRY_MS,
        attemptsRemaining: this.MAX_VERIFICATION_ATTEMPTS,
        createdAt: now,
      });
      return {
        success: true,
        message: `[DEMO MODE - No Resend Key] Passcode generated: ${plainOtp}`,
        isSimulated: true,
        simulatedOtp: plainOtp,
      };
    }

    return {
      success: false,
      error: 'Institutional email service is not configured (RESEND_API_KEY missing).',
      status: 500,
    };
  }

  // Verify OTP (Requirement 9: Single-use, constant-time, 5 attempts max)
  verifyOtp(
    userId: string,
    requestedRole: UserRole,
    candidateOtp: string
  ): VerifyOtpResult {
    const storeKey = `${userId}:${requestedRole}`;
    const record = this.otpStore.get(storeKey);

    if (!record) {
      return {
        success: false,
        error: 'No active verification code found for this account and role. Please request a new code.',
      };
    }

    // 1. Check expiration (5 minutes)
    if (Date.now() > record.expiresAt) {
      this.otpStore.delete(storeKey);
      return {
        success: false,
        error: 'Verification code has expired. Passcodes are valid for 5 minutes. Please request a new code.',
      };
    }

    // 2. Check role binding
    if (record.role !== requestedRole) {
      return {
        success: false,
        error: `Role mismatch: This verification session is bound to ${record.role.toUpperCase()}, not ${requestedRole.toUpperCase()}.`,
      };
    }

    // 3. Decrement verification attempts
    record.attemptsRemaining -= 1;

    // 4. Constant-time hash verification
    const cleanCandidate = (candidateOtp || '').trim();
    const candidateHash = this.hashOtp(cleanCandidate, record.salt, record.userId, record.role);

    const isMatch =
      candidateHash.length === record.otpHash.length &&
      crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(record.otpHash, 'hex'));

    if (!isMatch) {
      if (record.attemptsRemaining <= 0) {
        this.otpStore.delete(storeKey);
        return {
          success: false,
          error: 'Maximum verification attempts exceeded. For your security, this code has been invalidated. Please request a new code.',
        };
      }

      this.otpStore.set(storeKey, record);
      return {
        success: false,
        error: `Incorrect verification code. ${record.attemptsRemaining} attempt${
          record.attemptsRemaining === 1 ? '' : 's'
        } remaining.`,
      };
    }

    // 5. Enforce Single-Use: Immediately delete verified record
    this.otpStore.delete(storeKey);

    return {
      success: true,
      userId: record.userId,
      role: record.role,
    };
  }

  // Check if a challenge is currently active (used by tests)
  hasActiveChallenge(userId: string, role: UserRole): boolean {
    return this.otpStore.has(`${userId}:${role}`);
  }

  // Clear memory for testing purposes
  resetStoreForTesting(): void {
    this.otpStore.clear();
    this.rateLimitStore.clear();
  }

  // Test helper to artificially store an OTP
  seedOtpForTesting(
    userId: string,
    role: UserRole,
    plainOtp: string,
    options?: { isExpired?: boolean; attemptsRemaining?: number }
  ): void {
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = this.hashOtp(plainOtp, salt, userId, role);
    const storeKey = `${userId}:${role}`;
    const now = Date.now();

    this.otpStore.set(storeKey, {
      email: 'test@skit.ac.in',
      userId,
      role,
      otpHash,
      salt,
      expiresAt: options?.isExpired ? now - 1000 : now + this.OTP_EXPIRY_MS,
      attemptsRemaining: options?.attemptsRemaining ?? this.MAX_VERIFICATION_ATTEMPTS,
      createdAt: now,
    });
  }
}

export const otpService = new EmailOtpService();
