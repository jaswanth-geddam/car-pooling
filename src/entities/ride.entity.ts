import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { City } from './city.entity';
import { Booking } from './booking.entity';

export enum RideStatus {
  ACTIVE = 'active',
  FULL = 'full',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('rides')
@Index(['fromCityId', 'toCityId', 'departureDate']) // Composite index for search queries
@Index(['departureDate', 'status']) // Index for filtering active rides by date
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Driver relation
  @Index()
  @Column()
  driverId: string;

  @ManyToOne(() => User, (user) => user.ridesAsDriver)
  @JoinColumn({ name: 'driverId' })
  driver: User;

  // From City
  @Index()
  @Column()
  fromCityId: number;

  @ManyToOne(() => City)
  @JoinColumn({ name: 'fromCityId' })
  fromCity: City;

  // To City
  @Index()
  @Column()
  toCityId: number;

  @ManyToOne(() => City)
  @JoinColumn({ name: 'toCityId' })
  toCity: City;

  // Pickup and drop points (specific locations within cities)
  @Column()
  pickupPoint: string;

  @Column()
  dropPoint: string;

  // Date and time
  @Index()
  @Column({ type: 'date' })
  departureDate: Date;

  @Column({ type: 'time' })
  departureTime: string;

  // Seats
  @Column()
  totalSeats: number;

  @Column()
  availableSeats: number;

  // Pricing
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pricePerSeat: number;

  // Vehicle info
  @Column({ nullable: true })
  vehicleModel: string;

  @Column({ nullable: true })
  vehicleNumber: string;

  @Column({ nullable: true })
  vehicleColor: string;

  // Additional info
  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  allowLuggage: boolean;

  @Column({ default: false })
  allowPets: boolean;

  @Column({ default: false })
  allowSmoking: boolean;

  // Status
  @Index()
  @Column({
    type: 'enum',
    enum: RideStatus,
    default: RideStatus.ACTIVE,
  })
  status: RideStatus;

  // Bookings relation
  @OneToMany(() => Booking, (booking) => booking.ride)
  bookings: Booking[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
