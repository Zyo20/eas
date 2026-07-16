import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * Result of a setup-email send.
 *
 * The bulk-create-account path treats the email as a *side effect*: the User
 * has already been created in the DB and the setup token has already been
 * signed by the time we try to send. If the SMTP provider rate-limits us
 * (Mailtrap free = 150/day, etc.), we MUST NOT throw — the admin still
 * needs the setup URL to copy/paste manually. Throw only when the admin
 * expects the email to be the primary delivery channel (single-account
 * create, where there's no bulk-partial-success UX to fall back on).
 */
export type SendResult =
  | { ok: true; messageId?: string }
  | { ok: false; reason: 'not_configured' | 'smtp_error'; errorMessage: string };

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: nodemailer.Transporter;
  private isConfigured = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT', 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (!host || !pass || pass === 'replace-me-with-mailtrap-token') {
      this.logger.warn(
        'SMTP Mailer is not fully configured (missing SMTP_HOST/SMTP_PASS or token is placeholder). ' +
          'Emails will be printed to console log instead of sent.',
      );
      this.isConfigured = false;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false, // 587 uses STARTTLS
      auth: {
        user,
        pass,
      },
    });
    this.isConfigured = true;
  }

  /**
   * Best-effort send. Returns SendResult instead of throwing so callers can
   * surface "email failed, copy the link manually" UX without losing the URL.
   * Rate-limit errors (535), network blips, etc. all become {ok: false} here.
   */
  async trySendSetupEmail(
    toEmail: string,
    attendeeName: string,
    setupUrl: string,
    ttlHours: number,
  ): Promise<SendResult> {
    const result = await this.sendSetupEmail(toEmail, attendeeName, setupUrl, ttlHours);
    if (result.ok) {
      this.logger.log(`Setup email successfully sent to ${toEmail}`);
    } else if (result.reason === 'not_configured') {
      this.logger.log(`[SMTP Mail Sandbox - Inactive/Not Configured]\nTo: ${toEmail}\nLink: ${setupUrl}`);
    } else {
      this.logger.error(`Failed to send setup email to ${toEmail}: ${result.errorMessage}`);
    }
    return result;
  }

  /**
   * Internal send. Does not throw. The public trySendSetupEmail wraps this
   * with the logging side effects. Kept as a private method so callers
   * can't accidentally call it directly and lose the result-handling.
   */
  private async sendSetupEmail(
    toEmail: string,
    attendeeName: string,
    setupUrl: string,
    ttlHours: number,
  ): Promise<SendResult> {
    const fromEmail = this.config.get<string>('SMTP_FROM_EMAIL') ?? 'hello@arrowtest.site';
    const fromName = this.config.get<string>('SMTP_FROM_NAME') ?? 'EAS';

    const subject = 'Set up your Event Attendance account';

    const textContent = `Hello ${attendeeName},

An account has been provisioned for you at the Event Attendance System.
Please click the link below to set up your account and password:

${setupUrl}

This setup link is valid for ${ttlHours} hours.

If you did not request this account, you can safely ignore this email.`;

    const htmlContent = `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Set up your Event Attendance account</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8fafc; padding: 20px;">
    <div style="max-width: 560px; margin: auto; background: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      <h1 style="font-size: 20px; font-weight: 600; color: #0f172a; margin: 0 0 16px;">Welcome to Event Attendance</h1>
      <p style="font-size: 14px; color: #334155; line-height: 1.5; margin: 0 0 16px;">
        Hello <strong>${attendeeName}</strong>,
      </p>
      <p style="font-size: 14px; color: #334155; line-height: 1.5; margin: 0 0 24px;">
        An account has been provisioned for you. Please complete your registration and set your password by clicking the button below:
      </p>
      <p style="margin: 0 0 24px;">
        <a href="${setupUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500; font-size: 14px;">Set up my account</a>
      </p>
      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 8px;">
        Or copy and paste this URL into your browser:
      </p>
      <p style="word-break: break-all; color: #475569; font-size: 12px; background: #f1f5f9; padding: 10px; border-radius: 4px; font-family: monospace; margin: 0 0 24px;">
        ${setupUrl}
      </p>
      <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
        This setup link is valid for ${ttlHours} hours. If you did not request this account, you can safely ignore this email.
      </p>
    </div>
  </body>
</html>`;

    if (!this.isConfigured) {
      return { ok: false, reason: 'not_configured', errorMessage: 'SMTP not configured' };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: toEmail,
        subject,
        text: textContent,
        html: htmlContent,
      });
      return { ok: true, messageId: info.messageId };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: 'smtp_error', errorMessage: msg };
    }
  }
}
