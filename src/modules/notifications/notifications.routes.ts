import { Router } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate } from '@/middleware/authenticate';
import * as controller from './notifications.controller';

export const notificationsRoutes = Router();

notificationsRoutes.use(authenticate);

notificationsRoutes.get('/', asyncHandler(controller.listNotificationsHandler));
notificationsRoutes.get('/unread-count', asyncHandler(controller.getUnreadCountHandler));
notificationsRoutes.post('/:id/read', asyncHandler(controller.markAsReadHandler));
notificationsRoutes.post('/read-all', asyncHandler(controller.markAllAsReadHandler));
