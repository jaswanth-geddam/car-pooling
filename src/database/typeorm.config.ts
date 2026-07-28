import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },

  autoLoadEntities: true,
  synchronize: false, // keep false
  logging: true,
};
