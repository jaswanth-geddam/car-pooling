import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CitiesController } from './cities.controller';
import { CitiesService } from './cities.service';
import { City } from '../entities/city.entity';

@Module({
  imports: [TypeOrmModule.forFeature([City]), ConfigModule],
  controllers: [CitiesController],
  providers: [CitiesService],
  exports: [CitiesService],
})
export class CitiesModule {}
