import {
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '../entities/booking.entity';

export class CreateBookingDto {
  @IsUUID()
  @IsNotEmpty()
  rideId: string;

  @IsNumber()
  @Min(1)
  @Max(8)
  @IsOptional()
  seatsBooked?: number = 1;

  @IsString()
  @IsOptional()
  passengerNote?: string;
}

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus)
  @IsNotEmpty()
  status: BookingStatus;

  @IsString()
  @IsOptional()
  cancellationReason?: string;
}

export class RateBookingDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating: number;
}

export class GetUserBookingsDto {
  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus;

  @IsString()
  @IsOptional()
  type?: 'past' | 'upcoming' | 'all' = 'all';

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
}

export class BookingResponseDto {
  id: string;
  ride: {
    id: string;
    fromCity: { id: number; name: string; state: string };
    toCity: { id: number; name: string; state: string };
    pickupPoint: string;
    dropPoint: string;
    departureDate: Date;
    departureTime: string;
    pricePerSeat: number;
    driver: {
      id: string;
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
    };
  };
  seatsBooked: number;
  totalPrice: number;
  status: BookingStatus;
  isPaid: boolean;
  contactShared: boolean;
  createdAt: Date;
}
