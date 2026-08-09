import type { Request, Response } from 'express';
import { ApiError } from '@/utils/apiError';
import { requireParam } from '@/utils/params';
import * as notificationsService from './notifications.service';

function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export async function listNotificationsHandler(req: Request, res: Response) {
  res.json(await notificationsService.listNotifications(requireUser(req)));
}

export async function getUnreadCountHandler(req: Request, res: Response) {
  res.json({ count: await notificationsService.getUnreadCount(requireUser(req)) });
}

export async function markAsReadHandler(req: Request, res: Response) {
  await notificationsService.markAsRead(requireUser(req), requireParam(req, 'id'));
  res.status(204).send();
}

export async function markAllAsReadHandler(req: Request, res: Response) {
  await notificationsService.markAllAsRead(requireUser(req));
  res.status(204).send();
}
