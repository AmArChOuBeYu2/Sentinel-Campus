import 'dotenv/config';
import { Resend } from 'resend';

async function runDiagnostic() {
  console.log('----------------------------------------------------');
  console.log('📧 Sentinel Campus Resend Diagnostic Tool');
  console.log('----------------------------------------------------');

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const testRecipient = process.env.RESEND_TEST_TO;

  if (!apiKey || !apiKey.trim()) {
    console.error('❌ Error: RESEND_API_KEY is missing in your .env file.');
    process.exit(1);
  }

  if (!testRecipient || !testRecipient.trim()) {
    console.error('❌ Error: RESEND_TEST_TO is not configured in your .env file.');
    console.error('   Please specify a verified recipient in .env (e.g. RESEND_TEST_TO=your_email@example.com)');
    process.exit(1);
  }

  console.log(`• Configured Sender:    ${fromEmail}`);
  console.log(`• Test Recipient:       ${testRecipient}`);
  console.log('• Dispatching test email via Resend SDK...');

  try {
    const resend = new Resend(apiKey.trim());
    const res = await resend.emails.send({
      from: fromEmail,
      to: testRecipient.trim(),
      subject: '[Sentinel Campus] Diagnostic Test Verification',
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 480px;">
          <h2 style="color: #800020; margin-top: 0;">Sentinel Campus Diagnostic Test</h2>
          <p>This is a verified test email sent from the Sentinel Campus Resend diagnostic tool.</p>
          <p style="font-size: 12px; color: #64748b;">Timestamp: ${new Date().toISOString()}</p>
        </div>
      `,
      text: `Sentinel Campus Diagnostic Test\nThis is a verified test email from the Sentinel Campus diagnostic tool.\nTimestamp: ${new Date().toISOString()}`,
    });

    if (res.error) {
      console.error('❌ Resend API returned an error:');
      console.error(`   Name:       ${res.error.name}`);
      console.error(`   Message:    ${res.error.message}`);
      process.exit(1);
    }

    console.log('✅ Resend test email dispatched successfully!');
    console.log(`• Message ID:           ${res.data?.id}`);
    console.log('----------------------------------------------------');
  } catch (err: unknown) {
    const e = err as Error;
    console.error('❌ Network or SDK exception during dispatch:');
    console.error(`   Message:    ${e.message}`);
    process.exit(1);
  }
}

runDiagnostic();
