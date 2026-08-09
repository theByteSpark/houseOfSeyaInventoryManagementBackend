import { app } from '@/app';
import { env } from '@/config/env';
import { initNotificationsWebSocket } from '@/modules/notifications/ws';

const server = app.listen(env.PORT, () => {
  console.log(`House of Seya backend listening on http://localhost:${env.PORT}`);
});

initNotificationsWebSocket(server);
