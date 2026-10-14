export interface SendOtpResult {
  success: boolean;
  message: string;
  isSimulated: boolean;
  simulatedOtp?: string;
  provider: 'simulated' | 'twilio' | 'msg91' | 'aws_sns';
  error?: string;
}

export class OtpService {
  private provider: string;

  constructor() {
    this.provider = process.env.OTP_PROVIDER || 'simulated';
  }

  async sendOtp(phone: string, code: string): Promise<SendOtpResult> {
    const isDev = process.env.NODE_ENV !== 'production' || this.provider === 'simulated';

    if (this.provider === 'twilio') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        console.warn('[OTP] Twilio configured but missing credentials in environment. Falling back to simulated OTP.');
        return {
          success: true,
          message: `[DEMO MODE - Credentials Not Configured] Passcode: ${code}`,
          isSimulated: true,
          simulatedOtp: code,
          provider: 'simulated',
        };
      }

      try {
        const body = new URLSearchParams({
          To: phone,
          From: fromNumber,
          Body: `[Sentinel Campus] Your institutional verification passcode is ${code}. Valid for 10 minutes.`,
        });

        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(errData.message || `Twilio dispatch failed: ${res.status}`);
        }

        return {
          success: true,
          message: `Passcode delivered via SMS to ${phone}.`,
          isSimulated: false,
          provider: 'twilio',
        };
      } catch (err: unknown) {
        console.error('[OTP] Twilio dispatch error:', err);
        return {
          success: false,
          message: 'Failed to deliver SMS passcode via Twilio provider.',
          isSimulated: false,
          provider: 'twilio',
          error: (err as Error).message,
        };
      }
    }

    // Default: Development simulated provider
    return {
      success: true,
      message: `[DEMO MODE] Passcode generated: ${code}`,
      isSimulated: true,
      simulatedOtp: code,
      provider: 'simulated',
    };
  }
}

export const otpService = new OtpService();
