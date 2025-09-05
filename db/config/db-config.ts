import { registerAs } from '@nestjs/config';

import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

import { NamingStrategy } from './db-naming.strategy';

export default registerAs(
  'database',
  (): DataSourceOptions => ({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    entities: [join(__dirname, '../../**/*.entity.{ts,js}')],
    migrations: [join(__dirname, '../../db/migrations/*.{ts,js}')],
    namingStrategy: new NamingStrategy(),
    extra: {
      max: 10,
      connectionTimeoutMillis: 100000,
    },
    synchronize: false,
    logging: process.env.DATABASE_LOGGING_ENABLED === 'true',
  }),
);
