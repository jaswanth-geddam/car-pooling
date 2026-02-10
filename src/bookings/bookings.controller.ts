import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import {
  CreateBookingDto,
  UpdateBookingStatusDto,
  RateBookingDto,
  GetUserBookingsDto,
} from '../dto/booking.dto';
import { GetUser } from '../auth/get-user.decorator';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * POST /bookings
   * Create a new booking for a ride
   */
  @Post()
  async createBooking(
    @GetUser('id') userId: string,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(userId, dto);
  }

  /**
   * GET /bookings
   * Get logged-in user's bookings (as passenger)
   */
  @Get()
  async getMyBookings(
    @GetUser('id') userId: string,
    @Query() dto: GetUserBookingsDto,
  ) {
    return this.bookingsService.getUserBookings(userId, dto);
  }

  /**
   * GET /bookings/:id
   * Get booking details by ID
   */
  @Get(':id')
  async getBookingById(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
  ) {
    return this.bookingsService.getBookingById(id, userId);
  }

  /**
   * GET /bookings/ride/:rideId
   * Get all bookings for a ride (only for the ride's driver)
   */
  @Get('ride/:rideId')
  async getRideBookings(
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @GetUser('id') userId: string,
  ) {
    return this.bookingsService.getRideBookings(rideId, userId);
  }

  /**
   * PUT /bookings/:id/status
   * Update booking status (confirm/reject by driver, cancel by passenger)
   */
  @Put(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateBookingStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateBookingStatus(id, userId, dto);
  }

  /**
   * POST /bookings/:id/rate
   * Rate a completed booking
   */
  @Post(':id/rate')
  @HttpCode(HttpStatus.OK)
  async rateBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @Body() dto: RateBookingDto,
  ) {
    return this.bookingsService.rateBooking(id, userId, dto);
  }

  /**
   * POST /bookings/ride/:rideId/complete
   * Mark a ride as completed (driver only)
   */
  @Post('ride/:rideId/complete')
  @HttpCode(HttpStatus.OK)
  async completeRide(
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @GetUser('id') userId: string,
  ) {
    await this.bookingsService.completeRide(rideId, userId);
    return { message: 'Ride marked as completed' };
  }
}
