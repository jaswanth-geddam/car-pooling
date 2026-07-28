import { Controller, Get, Put, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { GetUser } from '../auth/get-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/profile
   * Get logged-in user's profile
   */
  @Get('profile')
  async getProfile(@GetUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  /**
   * PUT /users/profile
   * Update logged-in user's profile
   */
  @Put('profile')
  async updateProfile(
    @GetUser('id') userId: string,
    @Body()
    dto: { firstName?: string; lastName?: string; profilePicture?: string },
  ) {
    return this.usersService.updateProfile(userId, dto);
  }
}
