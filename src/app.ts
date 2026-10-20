import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { errorHandler } from '@/middleware/errorHandler';
import { authRoutes } from '@/modules/auth/auth.routes';
import { usersRoutes } from '@/modules/users/users.routes';
import { customersRoutes } from '@/modules/customers/customers.routes';
import { inventoryRoutes } from '@/modules/inventory/inventory.routes';
import { attributeOptionsRoutes } from '@/modules/attributeOptions/attributeOptions.routes';
import { enquiriesRoutes } from '@/modules/enquiries/enquiries.routes';
import { purchaseEnquiriesRoutes } from '@/modules/purchaseEnquiries/purchaseEnquiries.routes';
import { salesRoutes } from '@/modules/sales/sales.routes';
import { vendorsRoutes } from '@/modules/vendors/vendors.routes';
import { purchasesRoutes } from '@/modules/purchases/purchases.routes';
import { reportsRoutes } from '@/modules/reports/reports.routes';
import { importExportRoutes } from '@/modules/import-export/import-export.routes';

export const app = express();

const allowedOrigins = [
  env.CORS_ORIGIN,
  ...(env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((o) => o.trim()) : []),
];
logger.info(`CORS allowlist loaded: ${JSON.stringify(allowedOrigins)}`);

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.originalUrl} | Origin: ${req.headers.origin ?? '(none)'}`);
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        logger.info(`CORS allowed: ${origin ?? '(no origin header)'}`);
        callback(null, true);
      } else {
        logger.warn(`CORS rejected: "${origin}" not in allowlist ${JSON.stringify(allowedOrigins)}`);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/customers', customersRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/attribute-options', attributeOptionsRoutes);
app.use('/api/v1/enquiries', enquiriesRoutes);
app.use('/api/v1/purchase-enquiries', purchaseEnquiriesRoutes);
app.use('/api/v1/sales', salesRoutes);
app.use('/api/v1/vendors', vendorsRoutes);
app.use('/api/v1/purchases', purchasesRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/import', importExportRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);
