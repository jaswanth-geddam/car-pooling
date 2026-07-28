import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Ride, RideStatus } from '../entities/ride.entity';
import { City } from '../entities/city.entity';
import { User } from '../entities/user.entity';
import {
  CreateRideDto,
  SearchRideDto,
  UpdateRideDto,
  PaginatedRidesResponseDto,
} from '../dto/ride.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);
  private redis: Redis | null = null;
  private readonly CACHE_TTL = 300; // 5 minutes cache

  constructor(
    @InjectRepository(Ride)
    private rideRepo: Repository<Ride>,
    @InjectRepository(City)
    private cityRepo: Repository<City>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {
    // Initialize Redis for caching (essential for millions of users)
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
    }
  }

  /**
   * Search rides with pagination and caching
   * Optimized for high traffic with Redis caching
   */
  async searchRides(dto: SearchRideDto): Promise<PaginatedRidesResponseDto> {
    const cacheKey = this.buildSearchCacheKey(dto);

    // Try cache first (critical for millions of users)
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for search: ${cacheKey}`);
        return JSON.parse(cached) as PaginatedRidesResponseDto;
      }
    }

    const {
      fromCityId,
      toCityId,
      departureDate,
      seats = 1,
      minPrice,
      maxPrice,
      allowLuggage,
      allowPets,
      page = 1,
      limit = 20,
      sortBy = 'departureTime',
      sortOrder = 'ASC',
    } = dto;

    // Build query with proper indexing
    const queryBuilder = this.rideRepo
      .createQueryBuilder('ride')
      .leftJoinAndSelect('ride.fromCity', 'fromCity')
      .leftJoinAndSelect('ride.toCity', 'toCity')
      .leftJoinAndSelect('ride.driver', 'driver')
      .select([
        'ride',
        'fromCity.id',
        'fromCity.name',
        'fromCity.state',
        'toCity.id',
        'toCity.name',
        'toCity.state',
        'driver.id',
        'driver.firstName',
        'driver.lastName',
        'driver.rating',
        'driver.totalRides',
        'driver.profilePicture',
      ])
      .where('ride.fromCityId = :fromCityId', { fromCityId })
      .andWhere('ride.toCityId = :toCityId', { toCityId })
      .andWhere('ride.departureDate = :departureDate', { departureDate })
      .andWhere('ride.availableSeats >= :seats', { seats })
      .andWhere('ride.status = :status', { status: RideStatus.ACTIVE });

    // Optional filters
    if (minPrice !== undefined) {
      queryBuilder.andWhere('ride.pricePerSeat >= :minPrice', { minPrice });
    }
    if (maxPrice !== undefined) {
      queryBuilder.andWhere('ride.pricePerSeat <= :maxPrice', { maxPrice });
    }
    if (allowLuggage !== undefined) {
      queryBuilder.andWhere('ride.allowLuggage = :allowLuggage', {
        allowLuggage,
      });
    }
    if (allowPets !== undefined) {
      queryBuilder.andWhere('ride.allowPets = :allowPets', { allowPets });
    }

    // Sorting
    const sortField =
      sortBy === 'departureTime'
        ? 'ride.departureTime'
        : sortBy === 'pricePerSeat'
          ? 'ride.pricePerSeat'
          : 'ride.createdAt';
    queryBuilder.orderBy(sortField, sortOrder);

    // Pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    // Execute with count
    const [rides, total] = await queryBuilder.getManyAndCount();

    const response: PaginatedRidesResponseDto = {
      rides: rides.map((ride) => ({
        id: ride.id,
        fromCity: {
          id: ride.fromCity.id,
          name: ride.fromCity.name,
          state: ride.fromCity.state,
        },
        toCity: {
          id: ride.toCity.id,
          name: ride.toCity.name,
          state: ride.toCity.state,
        },
        pickupPoint: ride.pickupPoint,
        dropPoint: ride.dropPoint,
        departureDate: ride.departureDate,
        departureTime: ride.departureTime,
        totalSeats: ride.totalSeats,
        availableSeats: ride.availableSeats,
        pricePerSeat: Number(ride.pricePerSeat),
        driver: {
          id: ride.driver.id,
          firstName: ride.driver.firstName,
          lastName: ride.driver.lastName,
          rating: Number(ride.driver.rating),
          totalRides: ride.driver.totalRides,
          profilePicture: ride.driver.profilePicture,
        },
        vehicleModel: ride.vehicleModel,
        vehicleColor: ride.vehicleColor,
        allowLuggage: ride.allowLuggage,
        allowPets: ride.allowPets,
        allowSmoking: ride.allowSmoking,
        status: ride.status,
        createdAt: ride.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };

    // Cache the result
    if (this.redis) {
      await this.redis.setex(
        cacheKey,
        this.CACHE_TTL,
        JSON.stringify(response),
      );
    }

    return response;
  }

  /**
   * Create a new ride
   */
  async createRide(driverId: string, dto: CreateRideDto): Promise<Ride> {
    // Verify driver exists and is verified
    const driver = await this.userRepo.findOne({ where: { id: driverId } });
    if (!driver) {
      throw new NotFoundException('User not found');
    }
    if (!driver.isEmailVerified) {
      throw new BadRequestException(
        'Please verify your email before creating rides',
      );
    }

    // Verify cities exist
    const [fromCity, toCity] = await Promise.all([
      this.cityRepo.findOne({ where: { id: dto.fromCityId } }),
      this.cityRepo.findOne({ where: { id: dto.toCityId } }),
    ]);

    if (!fromCity) {
      throw new NotFoundException('From city not found');
    }
    if (!toCity) {
      throw new NotFoundException('To city not found');
    }
    if (dto.fromCityId === dto.toCityId) {
      throw new BadRequestException('From and To cities cannot be the same');
    }

    // Validate departure date is in future
    const departureDate = new Date(dto.departureDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (departureDate < today) {
      throw new BadRequestException('Departure date must be in the future');
    }

    // Create ride
    const ride = this.rideRepo.create({
      driverId,
      fromCityId: dto.fromCityId,
      toCityId: dto.toCityId,
      pickupPoint: dto.pickupPoint,
      dropPoint: dto.dropPoint,
      departureDate: departureDate,
      departureTime: dto.departureTime,
      totalSeats: dto.totalSeats,
      availableSeats: dto.totalSeats,
      pricePerSeat: dto.pricePerSeat,
      vehicleModel: dto.vehicleModel,
      vehicleNumber: dto.vehicleNumber,
      vehicleColor: dto.vehicleColor,
      description: dto.description,
      allowLuggage: dto.allowLuggage ?? true,
      allowPets: dto.allowPets ?? false,
      allowSmoking: dto.allowSmoking ?? false,
    });

    const savedRide = await this.rideRepo.save(ride);

    // Invalidate search cache for this route
    await this.invalidateSearchCache(dto.fromCityId, dto.toCityId);

    // Send confirmation email
    await this.emailService.sendRideCreatedEmail(
      driver.email,
      driver.firstName,
      {
        rideId: savedRide.id,
        fromCity: fromCity.name,
        toCity: toCity.name,
        departureDate: dto.departureDate,
        departureTime: dto.departureTime,
        totalSeats: dto.totalSeats,
        pricePerSeat: dto.pricePerSeat,
      },
    );

    // Update driver's total rides count
    await this.userRepo.increment({ id: driverId }, 'totalRides', 1);

    return savedRide;
  }

  /**
   * Get ride by ID with full details
   */
  async getRideById(rideId: string): Promise<Ride> {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['fromCity', 'toCity', 'driver', 'bookings'],
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    return ride;
  }

  /**
   * Get rides created by a user (driver)
   */
  async getDriverRides(driverId: string, status?: RideStatus): Promise<Ride[]> {
    const whereClause: Record<string, unknown> = { driverId };
    if (status) {
      whereClause.status = status;
    }

    return this.rideRepo.find({
      where: whereClause,
      relations: ['fromCity', 'toCity'],
      order: { departureDate: 'ASC', departureTime: 'ASC' },
    });
  }

  /**
   * Update ride details
   */
  async updateRide(
    rideId: string,
    driverId: string,
    dto: UpdateRideDto,
  ): Promise<Ride> {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    if (ride.driverId !== driverId) {
      throw new ForbiddenException('You can only update your own rides');
    }
    if (
      ride.status === RideStatus.COMPLETED ||
      ride.status === RideStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot update completed or cancelled rides',
      );
    }

    // Update fields
    Object.assign(ride, dto);
    const updatedRide = await this.rideRepo.save(ride);

    // Invalidate cache
    await this.invalidateSearchCache(ride.fromCityId, ride.toCityId);

    return updatedRide;
  }

  /**
   * Cancel a ride
   */
  async cancelRide(rideId: string, driverId: string): Promise<Ride> {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['bookings'],
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    if (ride.driverId !== driverId) {
      throw new ForbiddenException('You can only cancel your own rides');
    }
    if (ride.status === RideStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed rides');
    }

    ride.status = RideStatus.CANCELLED;
    const cancelledRide = await this.rideRepo.save(ride);

    // Invalidate cache
    await this.invalidateSearchCache(ride.fromCityId, ride.toCityId);

    // TODO: Notify all passengers about cancellation

    return cancelledRide;
  }

  /**
   * Update available seats (called after booking)
   */
  async updateAvailableSeats(
    rideId: string,
    seatsChange: number,
  ): Promise<void> {
    await this.rideRepo
      .createQueryBuilder()
      .update(Ride)
      .set({
        availableSeats: () => `"availableSeats" + ${seatsChange}`,
      })
      .where('id = :rideId', { rideId })
      .execute();

    // Check if ride is full
    const ride = await this.rideRepo.findOne({ where: { id: rideId } });
    if (ride && ride.availableSeats <= 0) {
      ride.status = RideStatus.FULL;
      await this.rideRepo.save(ride);
    } else if (
      ride &&
      ride.availableSeats > 0 &&
      ride.status === RideStatus.FULL
    ) {
      ride.status = RideStatus.ACTIVE;
      await this.rideRepo.save(ride);
    }
  }

  /**
   * Build cache key for search queries
   */
  private buildSearchCacheKey(dto: SearchRideDto): string {
    return `rides:search:${dto.fromCityId}:${dto.toCityId}:${dto.departureDate}:${dto.seats}:${dto.page}:${dto.limit}:${dto.sortBy}:${dto.sortOrder}`;
  }

  /**
   * Invalidate search cache for a route
   */
  private async invalidateSearchCache(
    fromCityId: number,
    toCityId: number,
  ): Promise<void> {
    if (this.redis) {
      const pattern = `rides:search:${fromCityId}:${toCityId}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(
          `Invalidated ${keys.length} cache keys for route ${fromCityId}->${toCityId}`,
        );
      }
    }
  }
}
