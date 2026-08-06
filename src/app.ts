import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from '@/config/env';
import { errorHandler } from '@/middleware/errorHandler';
import { authRoutes } from '@/modules/auth/auth.routes';
import { usersRoutes } from '@/modules/users/users.routes';
import { customersRoutes } from '@/modules/customers/customers.routes';
import { inventoryRoutes } from '@/modules/inventory/inventory.routes';
import { salesRoutes } from '@/modules/sales/sales.routes';
import { vendorsRoutes } from '@/modules/vendors/vendors.routes';
import { purchasesRoutes } from '@/modules/purchases/purchases.routes';
import { reportsRoutes } from '@/modules/reports/reports.routes';

export const app = express();

const allowedOrigins = [
  env.CORS_ORIGIN,
  ...(env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((o) => o.trim()) : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
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
app.use('/api/v1/sales', salesRoutes);
app.use('/api/v1/vendors', vendorsRoutes);
app.use('/api/v1/purchases', purchasesRoutes);
app.use('/api/v1/reports', reportsRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);
