import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from '@/config/env';
import { errorHandler } from '@/middleware/errorHandler';
import { authRoutes } from '@/modules/auth/auth.routes';
import { usersRoutes } from '@/modules/users/users.routes';
import { customersRoutes } from '@/modules/customers/customers.routes';
import { inventoryRoutes } from '@/modules/inventory/inventory.routes';
import { invoicesRoutes } from '@/modules/invoices/invoices.routes';

export const app = express();

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/customers', customersRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/invoices', invoicesRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);
