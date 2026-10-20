import { app } from '@/app';
import { env } from '@/config/env';
import { initNotificationsWebSocket } from '@/modules/notifications/ws';
import { logger } from '@/utils/logger';

const server = app.listen(env.PORT, () => {
  logger.info(`House of Seya backend listening on http://localhost:${env.PORT}`);
});

initNotificationsWebSocket(server);
