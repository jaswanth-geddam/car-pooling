import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Booking, BookingStatus } from '../entities/booking.entity';
import { Ride, RideStatus } from '../entities/ride.entity';
import { User } from '../entities/user.entity';
import {
  CreateBookingDto,
  UpdateBookingStatusDto,
  RateBookingDto,
  GetUserBookingsDto,
} from '../dto/booking.dto';
import { EmailService } from '../email/email.service';
import { RidesService } from '../rides/rides.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private bookingRepo: Repository<Booking>,
    @InjectRepository(Ride)
    private rideRepo: Repository<Ride>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private dataSource: DataSource,
    private emailService: EmailService,
    private ridesService: RidesService,
  ) {}

  /**
   * Create a booking with transaction (essential for concurrent bookings)
   */
  async createBooking(
    passengerId: string,
    dto: CreateBookingDto,
  ): Promise<Booking> {
    // Use transaction to prevent race conditions with seat availability
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the ride row for update
      const ride = await queryRunner.manager
        .createQueryBuilder(Ride, 'ride')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('ride.fromCity', 'fromCity')
        .leftJoinAndSelect('ride.toCity', 'toCity')
        .leftJoinAndSelect('ride.driver', 'driver')
        .where('ride.id = :id', { id: dto.rideId })
        .getOne();

      if (!ride) {
        throw new NotFoundException('Ride not found');
      }

      // Validations
      if (ride.driverId === passengerId) {
        throw new BadRequestException('You cannot book your own ride');
      }
      if (ride.status !== RideStatus.ACTIVE) {
        throw new BadRequestException('This ride is no longer available');
      }
      const seatsToBook = dto.seatsBooked ?? 1;
      if (ride.availableSeats < seatsToBook) {
        throw new BadRequestException(
          `Only ${ride.availableSeats} seats available`,
        );
      }

      // Check if user already has a booking for this ride
      const existingBooking = await queryRunner.manager.findOne(Booking, {
        where: {
          passengerId,
          rideId: dto.rideId,
          status: BookingStatus.PENDING,
        },
      });
      if (existingBooking) {
        throw new ConflictException(
          'You already have a pending booking for this ride',
        );
      }

      // Get passenger details
      const passenger = await queryRunner.manager.findOne(User, {
        where: { id: passengerId },
      });
      if (!passenger) {
        throw new NotFoundException('User not found');
      }
      if (!passenger.isEmailVerified) {
        throw new BadRequestException(
          'Please verify your email before booking',
        );
      }

      // Calculate total price
      const totalPrice = Number(ride.pricePerSeat) * seatsToBook;

      // Create booking
      const booking = queryRunner.manager.create(Booking, {
        passengerId,
        rideId: dto.rideId,
        seatsBooked: seatsToBook,
        totalPrice,
        passengerNote: dto.passengerNote,
        status: BookingStatus.PENDING,
      });

      await queryRunner.manager.save(booking);

      // Update available seats
      ride.availableSeats -= seatsToBook;
      if (ride.availableSeats <= 0) {
        ride.status = RideStatus.FULL;
      }
      await queryRunner.manager.save(ride);

      await queryRunner.commitTransaction();

      // Send confirmation email (outside transaction)
      await this.emailService.sendBookingConfirmationEmail(
        passenger.email,
        passenger.firstName,
        {
          bookingId: booking.id,
          fromCity: ride.fromCity.name,
          toCity: ride.toCity.name,
          departureDate: ride.departureDate.toISOString().split('T')[0],
          departureTime: ride.departureTime,
          seatsBooked: seatsToBook,
          totalPrice,
          driverName: `${ride.driver.firstName} ${ride.driver.lastName}`,
          pickupPoint: ride.pickupPoint,
        },
      );

      this.logger.log(`Booking created: ${booking.id} for ride ${dto.rideId}`);
      return booking;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get booking by ID
   */
  async getBookingById(bookingId: string, userId: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: [
        'ride',
        'ride.fromCity',
        'ride.toCity',
        'ride.driver',
        'passenger',
      ],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Only allow access to own bookings or driver of the ride
    if (booking.passengerId !== userId && booking.ride.driverId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Share contact only if booking is confirmed
    if (booking.status === BookingStatus.CONFIRMED) {
      booking.contactShared = true;
    }

    return booking;
  }

  /**
   * Get user's bookings (as passenger)
   */
  async getUserBookings(
    userId: string,
    dto: GetUserBookingsDto,
  ): Promise<{ bookings: Booking[]; total: number }> {
    const { status, type = 'all', page = 1, limit = 20 } = dto;

    const queryBuilder = this.bookingRepo
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.ride', 'ride')
      .leftJoinAndSelect('ride.fromCity', 'fromCity')
      .leftJoinAndSelect('ride.toCity', 'toCity')
      .leftJoinAndSelect('ride.driver', 'driver')
      .where('booking.passengerId = :userId', { userId });

    if (status) {
      queryBuilder.andWhere('booking.status = :status', { status });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (type === 'upcoming') {
      queryBuilder.andWhere('ride.departureDate >= :today', { today });
    } else if (type === 'past') {
      queryBuilder.andWhere('ride.departureDate < :today', { today });
    }

    queryBuilder
      .orderBy('ride.departureDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [bookings, total] = await queryBuilder.getManyAndCount();

    return { bookings, total };
  }

  /**
   * Get bookings for a ride (for driver)
   */
  async getRideBookings(rideId: string, driverId: string): Promise<Booking[]> {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    if (ride.driverId !== driverId) {
      throw new ForbiddenException('Access denied');
    }

    return this.bookingRepo.find({
      where: { rideId },
      relations: ['passenger'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Update booking status (confirm/reject by driver, cancel by passenger)
   */
  async updateBookingStatus(
    bookingId: string,
    userId: string,
    dto: UpdateBookingStatusDto,
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['ride', 'ride.driver', 'passenger'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isDriver = booking.ride.driverId === userId;
    const isPassenger = booking.passengerId === userId;

    if (!isDriver && !isPassenger) {
      throw new ForbiddenException('Access denied');
    }

    // Validate status transitions
    if (dto.status === BookingStatus.CONFIRMED) {
      if (!isDriver) {
        throw new ForbiddenException('Only driver can confirm bookings');
      }
      if (booking.status !== BookingStatus.PENDING) {
        throw new BadRequestException('Can only confirm pending bookings');
      }
    }

    if (dto.status === BookingStatus.REJECTED) {
      if (!isDriver) {
        throw new ForbiddenException('Only driver can reject bookings');
      }
      if (booking.status !== BookingStatus.PENDING) {
        throw new BadRequestException('Can only reject pending bookings');
      }
      // Restore seats
      await this.ridesService.updateAvailableSeats(
        booking.rideId,
        booking.seatsBooked,
      );
    }

    if (dto.status === BookingStatus.CANCELLED) {
      if (!isPassenger) {
        throw new ForbiddenException('Only passenger can cancel bookings');
      }
      if (
        booking.status === BookingStatus.COMPLETED ||
        booking.status === BookingStatus.CANCELLED
      ) {
        throw new BadRequestException('Cannot cancel this booking');
      }
      booking.cancellationReason = dto.cancellationReason || '';
      booking.cancelledAt = new Date();
      // Restore seats
      await this.ridesService.updateAvailableSeats(
        booking.rideId,
        booking.seatsBooked,
      );
    }

    booking.status = dto.status;
    const updatedBooking = await this.bookingRepo.save(booking);

    // TODO: Send status update email to passenger

    return updatedBooking;
  }

  /**
   * Rate a completed ride
   */
  async rateBooking(
    bookingId: string,
    userId: string,
    dto: RateBookingDto,
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['ride', 'passenger'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('Can only rate completed rides');
    }

    const isDriver = booking.ride.driverId === userId;
    const isPassenger = booking.passengerId === userId;

    if (!isDriver && !isPassenger) {
      throw new ForbiddenException('Access denied');
    }

    if (isPassenger) {
      if (booking.ratingForDriver) {
        throw new BadRequestException('You have already rated this ride');
      }
      booking.ratingForDriver = dto.rating;
      // Update driver's average rating
      await this.updateUserRating(booking.ride.driverId);
    } else {
      if (booking.ratingForPassenger) {
        throw new BadRequestException('You have already rated this passenger');
      }
      booking.ratingForPassenger = dto.rating;
      // Update passenger's average rating
      await this.updateUserRating(booking.passengerId);
    }

    return this.bookingRepo.save(booking);
  }

  /**
   * Update user's average rating
   */
  private async updateUserRating(userId: string): Promise<void> {
    // Calculate new average rating
    const result = await this.bookingRepo
      .createQueryBuilder('booking')
      .select('AVG(booking.ratingForDriver)', 'avgRating')
      .leftJoin('booking.ride', 'ride')
      .where('ride.driverId = :userId', { userId })
      .andWhere('booking.ratingForDriver IS NOT NULL')
      .getRawOne();

    const passengerResult = await this.bookingRepo
      .createQueryBuilder('booking')
      .select('AVG(booking.ratingForPassenger)', 'avgRating')
      .where('booking.passengerId = :userId', { userId })
      .andWhere('booking.ratingForPassenger IS NOT NULL')
      .getRawOne();

    // Use the higher of the two averages
    const driverAvg = result?.avgRating ? parseFloat(result.avgRating) : 0;
    const passengerAvg = passengerResult?.avgRating
      ? parseFloat(passengerResult.avgRating)
      : 0;
    const overallRating = Math.max(driverAvg, passengerAvg) || 0;

    await this.userRepo.update(userId, {
      rating: Math.round(overallRating * 10) / 10,
    });
  }

  /**
   * Complete a ride (mark all confirmed bookings as completed)
   */
  async completeRide(rideId: string, driverId: string): Promise<void> {
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    if (ride.driverId !== driverId) {
      throw new ForbiddenException('Access denied');
    }

    // Mark ride as completed
    ride.status = RideStatus.COMPLETED;
    await this.rideRepo.save(ride);

    // Mark all confirmed bookings as completed
    await this.bookingRepo.update(
      { rideId, status: BookingStatus.CONFIRMED },
      { status: BookingStatus.COMPLETED },
    );

    this.logger.log(`Ride ${rideId} marked as completed`);
  }
}
