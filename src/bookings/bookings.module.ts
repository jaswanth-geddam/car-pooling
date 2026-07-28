import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { Booking } from '../entities/booking.entity';
import { Ride } from '../entities/ride.entity';
import { User } from '../entities/user.entity';
import { RidesModule } from '../rides/rides.module';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, Ride, User]), RidesModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
