import {
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCityDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;
}

export class SearchCityDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  @Min(1)
  limit?: number = 10;
}

export class CityResponseDto {
  id: number;
  name: string;
  state: string;
  country: string;
  displayName: string; // e.g., "Mumbai, Maharashtra"
}
