import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { City } from '../entities/city.entity';
import { CreateCityDto, SearchCityDto, CityResponseDto } from '../dto/city.dto';

@Injectable()
export class CitiesService {
  private readonly logger = new Logger(CitiesService.name);
  private redis: Redis | null = null;
  private readonly CACHE_TTL = 3600; // 1 hour cache for cities

  constructor(
    @InjectRepository(City)
    private cityRepo: Repository<City>,
    private configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
    }
  }

  /**
   * Search cities by name with caching
   * Optimized for autocomplete/typeahead with millions of queries
   */
  async searchCities(dto: SearchCityDto): Promise<CityResponseDto[]> {
    const { query, limit = 10 } = dto;
    const normalizedQuery = query.toLowerCase().trim();

    // Cache key for this search
    const cacheKey = `cities:search:${normalizedQuery}:${limit}`;

    // Try cache first
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as CityResponseDto[];
      }
    }

    // Search database
    const cities = await this.cityRepo
      .createQueryBuilder('city')
      .where('LOWER(city.name) LIKE :query', { query: `${normalizedQuery}%` })
      .andWhere('city.isActive = :isActive', { isActive: true })
      .orderBy('city.name', 'ASC')
      .take(limit)
      .getMany();

    const result: CityResponseDto[] = cities.map((city) => ({
      id: city.id,
      name: city.name,
      state: city.state,
      country: city.country || 'India',
      displayName: `${city.name}, ${city.state}`,
    }));

    // Cache the result
    if (this.redis) {
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
    }

    return result;
  }

  /**
   * Get all cities (with pagination for admin)
   */
  async getAllCities(
    page = 1,
    limit = 50,
  ): Promise<{ cities: City[]; total: number }> {
    const [cities, total] = await this.cityRepo.findAndCount({
      where: { isActive: true },
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { cities, total };
  }

  /**
   * Get city by ID
   */
  async getCityById(id: number): Promise<City | null> {
    return this.cityRepo.findOne({ where: { id } });
  }

  /**
   * Create a new city (admin only)
   */
  async createCity(dto: CreateCityDto): Promise<City> {
    const city = this.cityRepo.create({
      ...dto,
      country: dto.country || 'India',
    });
    const savedCity = await this.cityRepo.save(city);

    // Invalidate search cache
    await this.invalidateSearchCache();

    return savedCity;
  }

  /**
   * Seed initial cities (run once)
   */
  async seedCities(): Promise<void> {
    const existingCount = await this.cityRepo.count();
    if (existingCount > 0) {
      this.logger.log('Cities already seeded');
      return;
    }

    // Major Indian cities
    const cities = [
      {
        name: 'Mumbai',
        state: 'Maharashtra',
        latitude: 19.076,
        longitude: 72.8777,
      },
      { name: 'Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.209 },
      {
        name: 'Bangalore',
        state: 'Karnataka',
        latitude: 12.9716,
        longitude: 77.5946,
      },
      {
        name: 'Hyderabad',
        state: 'Telangana',
        latitude: 17.385,
        longitude: 78.4867,
      },
      {
        name: 'Chennai',
        state: 'Tamil Nadu',
        latitude: 13.0827,
        longitude: 80.2707,
      },
      {
        name: 'Kolkata',
        state: 'West Bengal',
        latitude: 22.5726,
        longitude: 88.3639,
      },
      {
        name: 'Pune',
        state: 'Maharashtra',
        latitude: 18.5204,
        longitude: 73.8567,
      },
      {
        name: 'Ahmedabad',
        state: 'Gujarat',
        latitude: 23.0225,
        longitude: 72.5714,
      },
      {
        name: 'Jaipur',
        state: 'Rajasthan',
        latitude: 26.9124,
        longitude: 75.7873,
      },
      {
        name: 'Lucknow',
        state: 'Uttar Pradesh',
        latitude: 26.8467,
        longitude: 80.9462,
      },
      {
        name: 'Surat',
        state: 'Gujarat',
        latitude: 21.1702,
        longitude: 72.8311,
      },
      {
        name: 'Kanpur',
        state: 'Uttar Pradesh',
        latitude: 26.4499,
        longitude: 80.3319,
      },
      {
        name: 'Nagpur',
        state: 'Maharashtra',
        latitude: 21.1458,
        longitude: 79.0882,
      },
      {
        name: 'Indore',
        state: 'Madhya Pradesh',
        latitude: 22.7196,
        longitude: 75.8577,
      },
      {
        name: 'Thane',
        state: 'Maharashtra',
        latitude: 19.2183,
        longitude: 72.9781,
      },
      {
        name: 'Bhopal',
        state: 'Madhya Pradesh',
        latitude: 23.2599,
        longitude: 77.4126,
      },
      {
        name: 'Visakhapatnam',
        state: 'Andhra Pradesh',
        latitude: 17.6868,
        longitude: 83.2185,
      },
      { name: 'Patna', state: 'Bihar', latitude: 25.5941, longitude: 85.1376 },
      {
        name: 'Vadodara',
        state: 'Gujarat',
        latitude: 22.3072,
        longitude: 73.1812,
      },
      {
        name: 'Ghaziabad',
        state: 'Uttar Pradesh',
        latitude: 28.6692,
        longitude: 77.4538,
      },
      {
        name: 'Ludhiana',
        state: 'Punjab',
        latitude: 30.901,
        longitude: 75.8573,
      },
      {
        name: 'Agra',
        state: 'Uttar Pradesh',
        latitude: 27.1767,
        longitude: 78.0081,
      },
      {
        name: 'Nashik',
        state: 'Maharashtra',
        latitude: 19.9975,
        longitude: 73.7898,
      },
      {
        name: 'Faridabad',
        state: 'Haryana',
        latitude: 28.4089,
        longitude: 77.3178,
      },
      {
        name: 'Meerut',
        state: 'Uttar Pradesh',
        latitude: 28.9845,
        longitude: 77.7064,
      },
      {
        name: 'Rajkot',
        state: 'Gujarat',
        latitude: 22.3039,
        longitude: 70.8022,
      },
      {
        name: 'Varanasi',
        state: 'Uttar Pradesh',
        latitude: 25.3176,
        longitude: 82.9739,
      },
      {
        name: 'Srinagar',
        state: 'Jammu and Kashmir',
        latitude: 34.0837,
        longitude: 74.7973,
      },
      {
        name: 'Aurangabad',
        state: 'Maharashtra',
        latitude: 19.8762,
        longitude: 75.3433,
      },
      {
        name: 'Dhanbad',
        state: 'Jharkhand',
        latitude: 23.7957,
        longitude: 86.4304,
      },
      {
        name: 'Amritsar',
        state: 'Punjab',
        latitude: 31.634,
        longitude: 74.8723,
      },
      {
        name: 'Allahabad',
        state: 'Uttar Pradesh',
        latitude: 25.4358,
        longitude: 81.8463,
      },
      {
        name: 'Ranchi',
        state: 'Jharkhand',
        latitude: 23.3441,
        longitude: 85.3096,
      },
      {
        name: 'Coimbatore',
        state: 'Tamil Nadu',
        latitude: 11.0168,
        longitude: 76.9558,
      },
      {
        name: 'Jabalpur',
        state: 'Madhya Pradesh',
        latitude: 23.1815,
        longitude: 79.9864,
      },
      {
        name: 'Gwalior',
        state: 'Madhya Pradesh',
        latitude: 26.2183,
        longitude: 78.1828,
      },
      {
        name: 'Vijayawada',
        state: 'Andhra Pradesh',
        latitude: 16.5062,
        longitude: 80.648,
      },
      {
        name: 'Jodhpur',
        state: 'Rajasthan',
        latitude: 26.2389,
        longitude: 73.0243,
      },
      {
        name: 'Madurai',
        state: 'Tamil Nadu',
        latitude: 9.9252,
        longitude: 78.1198,
      },
      {
        name: 'Raipur',
        state: 'Chhattisgarh',
        latitude: 21.2514,
        longitude: 81.6296,
      },
      {
        name: 'Kota',
        state: 'Rajasthan',
        latitude: 25.2138,
        longitude: 75.8648,
      },
      {
        name: 'Chandigarh',
        state: 'Chandigarh',
        latitude: 30.7333,
        longitude: 76.7794,
      },
      {
        name: 'Guwahati',
        state: 'Assam',
        latitude: 26.1445,
        longitude: 91.7362,
      },
      {
        name: 'Solapur',
        state: 'Maharashtra',
        latitude: 17.6599,
        longitude: 75.9064,
      },
      {
        name: 'Hubli',
        state: 'Karnataka',
        latitude: 15.3647,
        longitude: 75.124,
      },
      {
        name: 'Mysore',
        state: 'Karnataka',
        latitude: 12.2958,
        longitude: 76.6394,
      },
      {
        name: 'Tiruchirappalli',
        state: 'Tamil Nadu',
        latitude: 10.7905,
        longitude: 78.7047,
      },
      {
        name: 'Bareilly',
        state: 'Uttar Pradesh',
        latitude: 28.367,
        longitude: 79.4304,
      },
      {
        name: 'Aligarh',
        state: 'Uttar Pradesh',
        latitude: 27.8974,
        longitude: 78.088,
      },
      {
        name: 'Moradabad',
        state: 'Uttar Pradesh',
        latitude: 28.8389,
        longitude: 78.7768,
      },
    ];

    for (const cityData of cities) {
      await this.cityRepo.save(
        this.cityRepo.create({ ...cityData, country: 'India' }),
      );
    }

    this.logger.log(`Seeded ${cities.length} cities`);
  }

  /**
   * Invalidate search cache
   */
  private async invalidateSearchCache(): Promise<void> {
    if (this.redis) {
      const keys = await this.redis.keys('cities:search:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
