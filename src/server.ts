import { app } from '@/app';
import { env } from '@/config/env';

app.listen(env.PORT, () => {
  console.log(`House of Seya backend listening on http://localhost:${env.PORT}`);
});
