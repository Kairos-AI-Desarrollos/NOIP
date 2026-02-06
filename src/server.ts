import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';

app.listen(env.port, () => {
  logger.info(`Proxy running on port ${env.port}`, {
    environment: env.nodeEnv,
    openRouterBaseUrl: env.openRouterBaseUrl,
    cacheEnabled: env.cacheEnabled,
  });
});
