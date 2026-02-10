import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private repo: Repository<User>,
  ) {}

  async create(data: Partial<User>): Promise<User> {
    const user = this.repo.create(data);
    return this.repo.save(user);
  }

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.repo.findOne({ where: { phone } });
  }

  async verifyEmail(token: string): Promise<User | null> {
    const user = await this.repo.findOne({
      where: { emailVerificationToken: token },
    });

    if (!user) return null;

    // Check if token is expired
    if (
      user.emailVerificationExpiry &&
      user.emailVerificationExpiry < new Date()
    ) {
      throw new BadRequestException('Verification link has expired');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined as any;
    user.emailVerificationExpiry = undefined as any;
    return this.repo.save(user);
  }

  async updateVerificationToken(
    userId: string,
    token: string,
    expiry: Date,
  ): Promise<void> {
    await this.repo.update(userId, {
      emailVerificationToken: token,
      emailVerificationExpiry: expiry,
    });
  }

  /**
   * Verify email using OTP (find by email, check OTP and expiry)
   */
  async verifyOtp(email: string, otp: string): Promise<User | null> {
    const user = await this.repo.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.emailVerificationToken !== otp) return null;

    if (
      user.emailVerificationExpiry &&
      user.emailVerificationExpiry < new Date()
    ) {
      throw new BadRequestException('OTP has expired');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined as any;
    user.emailVerificationExpiry = undefined as any;
    return this.repo.save(user);
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.repo.findOne({ where: { googleId } });
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.repo.findOne({
      where: { id: userId },
      select: [
        'id',
        'firstName',
        'lastName',
        'email',
        'phone',
        'isEmailVerified',
        'isPhoneVerified',
        'profilePicture',
        'rating',
        'totalRides',
        'createdAt',
      ],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(
    userId: string,
    data: Partial<Pick<User, 'firstName' | 'lastName' | 'profilePicture'>>,
  ): Promise<User> {
    await this.repo.update(userId, data);
    return this.getProfile(userId);
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.repo.update(userId, { password: hashedPassword });
  }
}
