import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Ride } from './ride.entity';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

@Entity('bookings')
@Index(['passengerId', 'status']) // Index for user booking queries
@Index(['rideId', 'status']) // Index for ride booking queries
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Passenger relation
  @Index()
  @Column()
  passengerId: string;

  @ManyToOne(() => User, (user) => user.bookings)
  @JoinColumn({ name: 'passengerId' })
  passenger: User;

  // Ride relation
  @Index()
  @Column()
  rideId: string;

  @ManyToOne(() => Ride, (ride) => ride.bookings)
  @JoinColumn({ name: 'rideId' })
  ride: Ride;

  // Number of seats booked
  @Column({ default: 1 })
  seatsBooked: number;

  // Total price for this booking
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number;

  // Status
  @Index()
  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;

  // Payment info (for future payment integration)
  @Column({ nullable: true })
  paymentId: string;

  @Column({ default: false })
  isPaid: boolean;

  // Contact shared
  @Column({ default: false })
  contactShared: boolean;

  // Notes
  @Column({ type: 'text', nullable: true })
  passengerNote: string;

  // Ratings
  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true })
  ratingForDriver: number;

  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true })
  ratingForPassenger: number;

  @Column({ nullable: true })
  cancellationReason: string;

  @Column({ nullable: true })
  cancelledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
