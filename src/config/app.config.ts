import { registerAs } from '@nestjs/config';
import { AppConfig } from './interfaces';

export default registerAs('app', (): AppConfig => {
  return {
    healthUrl: process.env.HEALTH_CHECK_URL,
  };
});
