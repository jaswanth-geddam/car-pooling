import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RidesService } from './rides.service';
import {
  CreateRideDto,
  SearchRideDto,
  UpdateRideDto,
} from '../dto/ride.dto';
import { Public } from '../auth/public.decorator';
import { GetUser } from '../auth/get-user.decorator';
import { RideStatus } from '../entities/ride.entity';

@Controller('rides')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  /**
   * GET /rides/search
   * Search for available rides (public endpoint)
   * Query params: fromCityId, toCityId, departureDate, seats, page, limit
   */
  @Public()
  @Get('search')
  async searchRides(@Query() dto: SearchRideDto) {
    return this.ridesService.searchRides(dto);
  }

  /**
   * GET /rides/:id
   * Get ride details by ID (public endpoint)
   */
  @Public()
  @Get(':id')
  async getRideById(@Param('id', ParseUUIDPipe) id: string) {
    return this.ridesService.getRideById(id);
  }

  /**
   * POST /rides
   * Create a new ride (authenticated users only)
   */
  @Post()
  async createRide(
    @GetUser('id') userId: string,
    @Body() dto: CreateRideDto,
  ) {
    return this.ridesService.createRide(userId, dto);
  }

  /**
   * GET /rides/my/driver
   * Get rides created by the logged-in user (as driver)
   */
  @Get('my/driver')
  async getMyDriverRides(
    @GetUser('id') userId: string,
    @Query('status') status?: RideStatus,
  ) {
    return this.ridesService.getDriverRides(userId, status);
  }

  /**
   * PUT /rides/:id
   * Update a ride (only by the driver who created it)
   */
  @Put(':id')
  async updateRide(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @Body() dto: UpdateRideDto,
  ) {
    return this.ridesService.updateRide(id, userId, dto);
  }

  /**
   * DELETE /rides/:id
   * Cancel a ride (only by the driver who created it)
   */
  @Delete(':id')
  async cancelRide(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
  ) {
    return this.ridesService.cancelRide(id, userId);
  }
}
