import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { isCompanyLevel } from '@/utils/warehouseScope';

// A notification is visible to a user if it's company-wide (warehouseId null)
// or scoped to their own warehouse. Company-level roles see everything.
function visibilityWhere(user: AuthenticatedUser): Prisma.NotificationWhereInput {
  if (isCompanyLevel(user)) return {};
  return { OR: [{ warehouseId: null }, { warehouseId: user.warehouseId ?? '__none__' }] };
}

function toDto(
  notification: {
    id: string;
    warehouseId: string | null;
    warehouse: { name: string } | null;
    type: NotificationType;
    title: string;
    message: string;
    metadata: Prisma.JsonValue;
    createdAt: Date;
  },
  isRead: boolean,
) {
  return {
    id: notification.id,
    warehouseId: notification.warehouseId,
    warehouseName: notification.warehouse?.name ?? null,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    metadata: notification.metadata,
    isRead,
    createdAt: notification.createdAt,
  };
}

const NOTIFICATION_INCLUDE = {
  warehouse: { select: { name: true } },
} satisfies Prisma.NotificationInclude;

export async function listNotifications(user: AuthenticatedUser, limit = 20) {
  const notifications = await prisma.notification.findMany({
    where: visibilityWhere(user),
    include: NOTIFICATION_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const reads = await prisma.notificationRead.findMany({
    where: { userId: user.id, notificationId: { in: notifications.map((n) => n.id) } },
    select: { notificationId: true },
  });
  const readIds = new Set(reads.map((r) => r.notificationId));

  return notifications.map((n) => toDto(n, readIds.has(n.id)));
}

export async function getUnreadCount(user: AuthenticatedUser): Promise<number> {
  const notifications = await prisma.notification.findMany({
    where: visibilityWhere(user),
    select: { id: true },
  });
  if (notifications.length === 0) return 0;

  const reads = await prisma.notificationRead.findMany({
    where: { userId: user.id, notificationId: { in: notifications.map((n) => n.id) } },
    select: { notificationId: true },
  });
  const readIds = new Set(reads.map((r) => r.notificationId));

  return notifications.filter((n) => !readIds.has(n.id)).length;
}

export async function markAsRead(user: AuthenticatedUser, notificationId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, ...visibilityWhere(user) },
  });
  if (!notification) throw ApiError.notFound('Notification not found.');

  await prisma.notificationRead.upsert({
    where: { notificationId_userId: { notificationId, userId: user.id } },
    update: {},
    create: { notificationId, userId: user.id },
  });
}

export async function markAllAsRead(user: AuthenticatedUser) {
  const notifications = await prisma.notification.findMany({
    where: visibilityWhere(user),
    select: { id: true },
  });
  if (notifications.length === 0) return;

  await prisma.notificationRead.createMany({
    data: notifications.map((n) => ({ notificationId: n.id, userId: user.id })),
    skipDuplicates: true,
  });
}

// Internal helper for other modules to raise a notification. Not exposed via HTTP.
export async function createNotification(input: {
  warehouseId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.notification.create({
    data: {
      warehouseId: input.warehouseId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
