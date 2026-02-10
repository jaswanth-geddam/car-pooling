import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { CitiesService } from './cities.service';
import { CreateCityDto, SearchCityDto } from '../dto/city.dto';
import { Public } from '../auth/public.decorator';

@Controller('cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  /**
   * GET /cities/search
   * Search cities by name (for autocomplete)
   * Public endpoint - no authentication required
   */
  @Public()
  @Get('search')
  async searchCities(@Query() dto: SearchCityDto) {
    return this.citiesService.searchCities(dto);
  }

  /**
   * GET /cities
   * Get all cities with pagination
   */
  @Public()
  @Get()
  async getAllCities(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.citiesService.getAllCities(page, limit);
  }

  /**
   * GET /cities/:id
   * Get city by ID
   */
  @Public()
  @Get(':id')
  async getCityById(@Param('id', ParseIntPipe) id: number) {
    return this.citiesService.getCityById(id);
  }

  /**
   * POST /cities
   * Create a new city (should be admin only in production)
   */
  @Post()
  async createCity(@Body() dto: CreateCityDto) {
    return this.citiesService.createCity(dto);
  }

  /**
   * POST /cities/seed
   * Seed initial cities (run once)
   */
  @Public()
  @Post('seed')
  async seedCities() {
    await this.citiesService.seedCities();
    return { message: 'Cities seeded successfully' };
  }
}
