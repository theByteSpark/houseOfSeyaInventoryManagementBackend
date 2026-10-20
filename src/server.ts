import { app } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

app.listen(env.PORT, () => {
  logger.info(`House of Seya backend listening on http://localhost:${env.PORT} (NODE_ENV=${env.NODE_ENV})`);
});
