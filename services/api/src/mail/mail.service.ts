import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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

  async sendSetupEmail(
    toEmail: string,
    attendeeName: string,
    setupUrl: string,
    ttlHours: number,
  ): Promise<void> {
    const fromEmail = this.config.get<string>('SMTP_FROM_EMAIL') ?? 'hello@arrowtest.site';
    const fromName = this.config.get<string>('SMTP_FROM_NAME') ?? 'Magic Elves';

    const subject = 'Set up your Event Attendance account';
    
    const textContent = `Congrats for sending test email with Mailtrap!

Hello ${attendeeName},

An account has been provisioned for you at Lapu-Lapu City College Event Attendance System.
Please click the link below to set up your account and password:

${setupUrl}

This setup link is valid for ${ttlHours} hours.

If you are viewing this email in your inbox – the integration works.
Good luck! Hope it works.`;

    const htmlContent = `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  </head>
  <body style="font-family: sans-serif;">
    <div style="display: block; margin: auto; max-width: 600px;" class="main">
      <h1 style="font-size: 18px; font-weight: bold; margin-top: 20px">Congrats for sending test email with Mailtrap!</h1>
      <p>Hello <strong>${attendeeName}</strong>,</p>
      <p>An account has been provisioned for you. Please complete your registration and set your password by clicking the link below:</p>
      <p style="margin: 20px 0;">
        <a href="${setupUrl}" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Set Up Account</a>
      </p>
      <p>Or copy and paste this URL into your browser:</p>
      <p style="word-break: break-all; color: #4b5563;">${setupUrl}</p>
      <p>This setup link is valid for ${ttlHours} hours.</p>
      
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
      
      <img alt="Inspect with Tabs" src="https://assets-examples.mailtrap.io/integration-examples/welcome.png" style="width: 100%;">
      <p>If you are viewing this email in your inbox – the integration works.</p>
      <p>Now send your email using our SMTP server and integration of your choice!</p>
      <p>Good luck! Hope it works.</p>
    </div>
    <style>
      .main { background-color: white; }
      a:hover { border-left-width: 1em; min-height: 2em; }
    </style>
  </body>
</html>`;

    if (!this.isConfigured) {
      this.logger.log(`[SMTP Mail Sandbox - Inactive/Not Configured]
To: ${toEmail}
From: ${fromName} <${fromEmail}>
Subject: ${subject}
Text:
${textContent}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: toEmail,
        subject,
        text: textContent,
        html: htmlContent,
      });
      this.logger.log(`Setup email successfully sent to ${toEmail}`);
    } catch (error) {
      this.logger.error(`Failed to send setup email to ${toEmail}`, error);
      throw error;
    }
  }
}
