import {
  IsNumber,
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { RideStatus } from '../entities/ride.entity';

export class CreateRideDto {
  @IsNumber()
  @IsNotEmpty()
  fromCityId: number;

  @IsNumber()
  @IsNotEmpty()
  toCityId: number;

  @IsString()
  @IsNotEmpty()
  pickupPoint: string;

  @IsString()
  @IsNotEmpty()
  dropPoint: string;

  @IsDateString()
  @IsNotEmpty()
  departureDate: string;

  @IsString()
  @IsNotEmpty()
  departureTime: string; // Format: HH:mm

  @IsNumber()
  @Min(1)
  @Max(8)
  totalSeats: number;

  @IsNumber()
  @Min(0)
  pricePerSeat: number;

  @IsString()
  @IsOptional()
  vehicleModel?: string;

  @IsString()
  @IsOptional()
  vehicleNumber?: string;

  @IsString()
  @IsOptional()
  vehicleColor?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  allowLuggage?: boolean;

  @IsBoolean()
  @IsOptional()
  allowPets?: boolean;

  @IsBoolean()
  @IsOptional()
  allowSmoking?: boolean;
}

export class SearchRideDto {
  @IsNumber()
  @Type(() => Number)
  @IsNotEmpty()
  fromCityId: number;

  @IsNumber()
  @Type(() => Number)
  @IsNotEmpty()
  toCityId: number;

  @IsDateString()
  @IsNotEmpty()
  departureDate: string;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  @Min(1)
  @Max(8)
  seats?: number = 1;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  @Min(0)
  minPrice?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  maxPrice?: number;

  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  allowLuggage?: boolean;

  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  allowPets?: boolean;

  // Pagination
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  @Min(1)
  page?: number = 1;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  // Sorting
  @IsString()
  @IsOptional()
  sortBy?: 'departureTime' | 'pricePerSeat' | 'createdAt' = 'departureTime';

  @IsString()
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'ASC';
}

export class UpdateRideDto {
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(8)
  availableSeats?: number;

  @IsString()
  @IsOptional()
  pickupPoint?: string;

  @IsString()
  @IsOptional()
  dropPoint?: string;

  @IsString()
  @IsOptional()
  departureTime?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  pricePerSeat?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(RideStatus)
  @IsOptional()
  status?: RideStatus;
}

export class RideResponseDto {
  id: string;
  fromCity: {
    id: number;
    name: string;
    state: string;
  };
  toCity: {
    id: number;
    name: string;
    state: string;
  };
  pickupPoint: string;
  dropPoint: string;
  departureDate: Date;
  departureTime: string;
  totalSeats: number;
  availableSeats: number;
  pricePerSeat: number;
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    rating: number;
    totalRides: number;
    profilePicture: string;
  };
  vehicleModel: string;
  vehicleColor: string;
  allowLuggage: boolean;
  allowPets: boolean;
  allowSmoking: boolean;
  status: string;
  createdAt: Date;
}

export class PaginatedRidesResponseDto {
  rides: RideResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}
