import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import {
  RegisterDto,
  LoginDto,
  VerifyEmailDto,
  ResendVerificationDto,
  VerifyOtpDto,
  ResendOtpDto,
} from '../dto/auth.dto';
import { User } from '../entities/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthResponse {
  user: Partial<User>;
  accessToken: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  /**
   * Register a new user
   */
  async register(
    dto: RegisterDto,
  ): Promise<{ message: string; userId: string }> {
    // Check if email already exists
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

    // Check if phone already exists
    const existingPhone = await this.usersService.findByPhone(dto.phone);
    if (existingPhone) {
      throw new ConflictException('Phone number already registered');
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    // Generate 6-digit OTP (valid 10 minutes)
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

    // Create user (with OTP stored for verification)
    await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email.toLowerCase(),
      phone: dto.phone,
      password: hashedPassword,
      emailVerificationToken: otp,
      emailVerificationExpiry: otpExpiry,
    });

    // Send OTP to email
    await this.emailService.sendOtpEmail(
      dto.email.toLowerCase(),
      dto.firstName,
      otp,
    );

    this.logger.log(
      `New user registered: ${dto.email.toLowerCase()}, OTP sent`,
    );

    return {
      message:
        'Registration successful. Check your email for the 6-digit OTP to verify your account.',
      userId: dto.email.toLowerCase(),
    };
  }

  /**
   * Verify OTP and return tokens so user can access the application
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResponse> {
    const user = await this.usersService.verifyOtp(
      dto.email.toLowerCase(),
      dto.otp,
    );

    if (!user) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    const tokens = await this.generateTokens(user);

    this.logger.log(`Email verified via OTP for user: ${user.email}`);

    // Send "email verified" confirmation (don't block response if email fails)
    void this.emailService
      .sendEmailVerifiedEmail(user.email, user.firstName)
      .catch((err) => this.logger.warn(`Verification confirmation email failed: ${(err as Error).message}`));

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        isEmailVerified: user.isEmailVerified,
        rating: user.rating,
        totalRides: user.totalRides,
        profilePicture: user.profilePicture,
      },
      ...tokens,
    };
  }

  /**
   * Resend OTP to email
   */
  async resendOtp(dto: ResendOtpDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email.toLowerCase());

    if (!user) {
      return { message: 'If the email exists, a new OTP has been sent.' };
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

    await this.usersService.updateVerificationToken(user.id, otp, otpExpiry);

    await this.emailService.sendOtpEmail(user.email, user.firstName, otp);

    return { message: 'A new OTP has been sent to your email.' };
  }

  /**
   * Login user
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email.toLowerCase());

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isEmailVerified) {
      throw new BadRequestException(
        'Please verify your email before logging in',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    const tokens = await this.generateTokens(user);

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        isEmailVerified: user.isEmailVerified,
        rating: user.rating,
        totalRides: user.totalRides,
        profilePicture: user.profilePicture,
      },
      ...tokens,
    };
  }

  /**
   * Verify email with token
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const user = await this.usersService.verifyEmail(dto.token);

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    this.logger.log(`Email verified for user: ${user.email}`);

    return { message: 'Email verified successfully. You can now log in.' };
  }

  /**
   * Resend verification email
   */
  async resendVerification(
    dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email.toLowerCase());

    if (!user) {
      // Don't reveal if email exists
      return {
        message: 'If the email exists, a verification link has been sent.',
      };
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date();
    verificationExpiry.setHours(verificationExpiry.getHours() + 24);

    await this.usersService.updateVerificationToken(
      user.id,
      verificationToken,
      verificationExpiry,
    );

    // Send verification email
    await this.emailService.sendVerificationEmail(
      user.email,
      user.firstName,
      verificationToken,
    );

    return { message: 'Verification email sent. Please check your inbox.' };
  }

  /**
   * Validate JWT token and return user
   */
  async validateToken(payload: JwtPayload): Promise<User | null> {
    return this.usersService.findById(payload.sub);
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: 900, // 15 minutes
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: 604800, // 7 days
      }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        },
      );

      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newAccessToken = await this.jwtService.signAsync(
        { sub: user.id, email: user.email },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: 900, // 15 minutes
        },
      );

      return { accessToken: newAccessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
