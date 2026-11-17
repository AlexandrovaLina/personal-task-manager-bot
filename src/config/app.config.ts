import { registerAs } from '@nestjs/config';
import { AppConfig } from './interfaces';

export default registerAs('app', (): AppConfig => {
  return {
    healthUrl: process.env.HEALTH_CHECK_URL,
    port: +(process.env.APP_PORT ?? 3000),
    isRender: process.env.RENDER === 'true',
    gitCommit: process.env.RENDER_GIT_COMMIT,
  };
});
