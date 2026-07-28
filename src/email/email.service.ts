import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import Redis from 'ioredis';

interface EmailJob {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private redis: Redis | null = null;
  private readonly QUEUE_KEY = 'email:queue';
  private isSmtpConfigured = false;

  constructor(private configService: ConfigService) {
    // Mail config from .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');

    if (smtpHost && smtpUser && smtpPass) {
      const port = this.configService.get<number>('SMTP_PORT', 587);
      const secure =
        this.configService.get<string>('SMTP_SECURE', 'false') === 'true';

      // Use 'gmail' service when host is Gmail for reliable defaults (STARTTLS, etc.)
      const isGmail = smtpHost.toLowerCase().includes('gmail.com');
      this.transporter = nodemailer.createTransport(
        isGmail
          ? { service: 'gmail', auth: { user: smtpUser, pass: smtpPass } }
          : {
              host: smtpHost,
              port: Number(port),
              secure,
              auth: { user: smtpUser, pass: smtpPass },
            },
      );
      this.isSmtpConfigured = true;
      this.logger.log(
        `SMTP configured (${isGmail ? 'gmail' : smtpHost}:${port}) - verifying connection...`,
      );
      // Verify SMTP connection on startup so you see auth errors immediately
      void this.transporter
        .verify()
        .then(() => this.logger.log('SMTP connection verified successfully'))
        .catch((err: Error) =>
          this.logger.error(
            `SMTP verification failed - emails may not send. ${err.message}. For Gmail use an App Password, not your normal password.`,
          ),
        );
    } else {
      this.logger.warn(
        'SMTP not configured - set SMTP_HOST, SMTP_USER and SMTP_PASS in .env. OTP will only appear in server console.',
      );
    }

    // Initialize Redis for email queue (for millions of users)
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
      this.startEmailWorker();
    }
  }

  /**
   * Send verification email to user
   */
  async sendVerificationEmail(
    email: string,
    firstName: string,
    verificationToken: string,
  ): Promise<void> {
    const appUrl = this.configService.get<string>(
      'APP_URL',
      'http://localhost:3000',
    );
    const verificationLink = `${appUrl}/api/v1/auth/verify-email?token=${verificationToken}`;

    // Always log the verification token for development
    this.logger.log('');
    this.logger.log('*'.repeat(70));
    this.logger.log(`VERIFICATION EMAIL for ${email}`);
    this.logger.log(`Token: ${verificationToken}`);
    this.logger.log(`Link: ${verificationLink}`);
    this.logger.log('*'.repeat(70));
    this.logger.log('');

    const emailJob: EmailJob = {
      to: email,
      subject: 'Verify Your Email - CarPool',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to CarPool!</h1>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Thank you for registering with CarPool. Please verify your email address to complete your registration and start sharing rides.</p>
              <p style="text-align: center;">
                <a href="${verificationLink}" class="button">Verify Email</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #4F46E5;">${verificationLink}</p>
              <p><strong>This link will expire in 24 hours.</strong></p>
              <p>If you didn't create an account, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} CarPool. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Hi ${firstName},
        
        Thank you for registering with CarPool. Please verify your email address by clicking the link below:
        
        ${verificationLink}
        
        This link will expire in 24 hours.
        
        If you didn't create an account, you can safely ignore this email.
        
        Best regards,
        CarPool Team
      `,
    };

    await this.queueEmail(emailJob);
  }

  /**
   * Send OTP email for registration verification
   */
  async sendOtpEmail(
    email: string,
    firstName: string,
    otp: string,
  ): Promise<void> {
    this.logger.log('');
    this.logger.log('*'.repeat(70));
    this.logger.log(`OTP EMAIL for ${email}`);
    this.logger.log(`OTP: ${otp}`);
    this.logger.log('*'.repeat(70));
    this.logger.log('');

    const emailJob: EmailJob = {
      to: email,
      subject: 'Your verification code - CarPool',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .otp-box { font-size: 28px; letter-spacing: 8px; font-weight: bold; color: #4F46E5; background: white; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; border: 2px dashed #4F46E5; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Verify your email</h1>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Use this one-time code to complete your CarPool registration:</p>
              <div class="otp-box">${otp}</div>
              <p><strong>This code expires in 10 minutes.</strong></p>
              <p>If you didn't request this, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} CarPool. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${firstName},\n\nYour CarPool verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nCarPool Team`,
    };

    // Send OTP immediately (no queue) so we get clear success/error and no Redis dependency
    await this.sendEmailDirect(emailJob);
  }

  /**
   * Send "email verified" confirmation after successful OTP verification
   */
  async sendEmailVerifiedEmail(
    email: string,
    firstName: string,
  ): Promise<void> {
    const emailJob: EmailJob = {
      to: email,
      subject: 'Email verified - CarPool',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Email verified</h1>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Your email has been successfully verified. You can now use all features of CarPool.</p>
              <p>Happy riding!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} CarPool. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${firstName},\n\nYour email has been successfully verified. You can now use all features of CarPool.\n\nHappy riding!\n\nCarPool Team`,
    };
    await this.queueEmail(emailJob);
  }

  /**
   * Send booking confirmation email
   */
  async sendBookingConfirmationEmail(
    email: string,
    firstName: string,
    bookingDetails: {
      bookingId: string;
      fromCity: string;
      toCity: string;
      departureDate: string;
      departureTime: string;
      seatsBooked: number;
      totalPrice: number;
      driverName: string;
      pickupPoint: string;
    },
  ): Promise<void> {
    const emailJob: EmailJob = {
      to: email,
      subject: `Booking Confirmed - ${bookingDetails.fromCity} to ${bookingDetails.toCity}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Booking Confirmed! ✓</h1>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Your ride has been booked successfully. Here are your trip details:</p>
              <div class="details">
                <div class="detail-row">
                  <span><strong>Booking ID:</strong></span>
                  <span>${bookingDetails.bookingId}</span>
                </div>
                <div class="detail-row">
                  <span><strong>Route:</strong></span>
                  <span>${bookingDetails.fromCity} → ${bookingDetails.toCity}</span>
                </div>
                <div class="detail-row">
                  <span><strong>Date:</strong></span>
                  <span>${bookingDetails.departureDate}</span>
                </div>
                <div class="detail-row">
                  <span><strong>Time:</strong></span>
                  <span>${bookingDetails.departureTime}</span>
                </div>
                <div class="detail-row">
                  <span><strong>Pickup Point:</strong></span>
                  <span>${bookingDetails.pickupPoint}</span>
                </div>
                <div class="detail-row">
                  <span><strong>Seats:</strong></span>
                  <span>${bookingDetails.seatsBooked}</span>
                </div>
                <div class="detail-row">
                  <span><strong>Driver:</strong></span>
                  <span>${bookingDetails.driverName}</span>
                </div>
                <div class="detail-row">
                  <span><strong>Total Price:</strong></span>
                  <span>₹${bookingDetails.totalPrice}</span>
                </div>
              </div>
              <p>Contact details will be shared once the driver confirms your booking.</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} CarPool. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await this.queueEmail(emailJob);
  }

  /**
   * Send ride creation confirmation email
   */
  async sendRideCreatedEmail(
    email: string,
    firstName: string,
    rideDetails: {
      rideId: string;
      fromCity: string;
      toCity: string;
      departureDate: string;
      departureTime: string;
      totalSeats: number;
      pricePerSeat: number;
    },
  ): Promise<void> {
    const emailJob: EmailJob = {
      to: email,
      subject: `Ride Published - ${rideDetails.fromCity} to ${rideDetails.toCity}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Ride is Live!</h1>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Your ride has been published successfully. Passengers can now find and book your ride.</p>
              <div class="details">
                <p><strong>Route:</strong> ${rideDetails.fromCity} → ${rideDetails.toCity}</p>
                <p><strong>Date:</strong> ${rideDetails.departureDate}</p>
                <p><strong>Time:</strong> ${rideDetails.departureTime}</p>
                <p><strong>Available Seats:</strong> ${rideDetails.totalSeats}</p>
                <p><strong>Price per Seat:</strong> ₹${rideDetails.pricePerSeat}</p>
              </div>
              <p>We'll notify you when passengers book your ride.</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} CarPool. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await this.queueEmail(emailJob);
  }

  /**
   * Queue email for async processing (scalable for millions of users)
   * Falls back to direct send if Redis is down so OTP/emails are never lost.
   */
  private async queueEmail(job: EmailJob): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.lpush(this.QUEUE_KEY, JSON.stringify(job));
        this.logger.log(
          `Email queued for ${job.to} (worker will send via SMTP)`,
        );
      } catch (err) {
        this.logger.warn(
          `Redis queue failed (${(err as Error).message}), sending email directly`,
        );
        await this.sendEmailDirect(job);
      }
    } else {
      await this.sendEmailDirect(job);
    }
  }

  /**
   * Send email directly
   */
  private async sendEmailDirect(job: EmailJob): Promise<void> {
    // If SMTP is not configured, log the email instead (and show OTP if present)
    if (!this.isSmtpConfigured || !this.transporter) {
      const otpMatch = (job.text || job.html || '').match(/\b(\d{6})\b/);
      this.logger.log('='.repeat(60));
      this.logger.log(`EMAIL (Not sent - SMTP not configured)`);
      this.logger.log(`To: ${job.to}`);
      this.logger.log(`Subject: ${job.subject}`);
      if (otpMatch) {
        this.logger.log(`>>> OTP for testing: ${otpMatch[1]} <<<`);
      }
      this.logger.log('='.repeat(60));
      return;
    }

    try {
      // Use authenticated SMTP user as From so domain matches (avoids "domain is example" / unverified domain rejections)
      const fromEmail = this.configService.get<string>('SMTP_USER');
      if (!fromEmail || fromEmail.includes('example')) {
        throw new Error(
          'SMTP_USER in .env must be your real email (e.g. yourname@gmail.com), not example.com',
        );
      }
      this.logger.log(
        `Sending email to ${job.to} via SMTP (from: ${fromEmail})...`,
      );
      await this.transporter.sendMail({
        from: `CarPool <${fromEmail}>`,
        to: job.to,
        subject: job.subject,
        html: job.html,
        text: job.text,
      });
      this.logger.log(`Email sent successfully to ${job.to}`);
    } catch (error) {
      const err = error as Error & {
        response?: string;
        responseCode?: number;
        code?: string;
      };
      const msg = err.message || String(error);
      const code = err.code ? ` [${err.code}]` : '';
      const extra = err.response
        ? ` | ${String(err.response).slice(0, 200)}`
        : '';
      this.logger.error(
        `Failed to send email to ${job.to}: ${msg}${code}${extra}`,
      );
      this.logger.warn(
        'Check: Gmail = use App Password (not normal password); check spam folder; ensure SMTP_* in .env and app restarted.',
      );
    }
  }

  /**
   * Background worker to process email queue
   */
  private startEmailWorker(): void {
    const redis = this.redis;
    if (!redis) {
      return;
    }

    const processQueue = async () => {
      while (true) {
        try {
          // Block and wait for email jobs
          const result = await redis.brpop(this.QUEUE_KEY, 0);
          if (result) {
            const job: EmailJob = JSON.parse(result[1]);
            await this.sendEmailDirect(job);
          }
        } catch (error) {
          this.logger.error('Email worker error:', error);
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    };

    // Start multiple workers for parallel processing
    const workerCount = this.configService.get<number>('EMAIL_WORKERS', 3);
    for (let i = 0; i < workerCount; i++) {
      processQueue();
    }
    this.logger.log(`Started ${workerCount} email workers`);
  }
}
