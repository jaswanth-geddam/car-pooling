import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RidesModule } from './rides/rides.module';
import { BookingsModule } from './bookings/bookings.module';
import { CitiesModule } from './cities/cities.module';
import { EmailModule } from './email/email.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

// Entities
import { User } from './entities/user.entity';
import { City } from './entities/city.entity';
import { Ride } from './entities/ride.entity';
import { Booking } from './entities/booking.entity';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
        entities: [User, City, Ride, Booking],
        synchronize: configService.get<string>('NODE_ENV') !== 'production', // Auto-sync in dev only
        logging: configService.get<string>('NODE_ENV') !== 'production',
        // Connection pool settings for high traffic
        extra: {
          max: 20, // Maximum pool size
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
      }),
    }),

    // Feature modules
    EmailModule,
    AuthModule,
    UsersModule,
    CitiesModule,
    RidesModule,
    BookingsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global JWT auth guard - all routes are protected by default
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
