import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import { ApiError } from '@/utils/apiError';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { isCompanyLevel } from '@/utils/warehouseScope';
import { pushToUsers } from '@/modules/notifications/ws';
import { logger } from '@/utils/logger';

// Warehouse Manager activity notifications tell Admin-tier roles what a
// Warehouse Manager did -- they're never meant for Warehouse Manager's own
// eyes (not even their own actions, and not a peer manager's at the same
// warehouse). ADMIN ("Warehouse Admin") and up still see them normally.
const ADMIN_ONLY_TYPES = ['ACTIVITY_CREATE', 'ACTIVITY_UPDATE', 'ACTIVITY_DELETE'] as const;

// A notification is visible to a user if it's company-wide (warehouseId null)
// or scoped to their own warehouse. Company-level roles see everything.
function visibilityWhere(user: AuthenticatedUser): Prisma.NotificationWhereInput {
  const base: Prisma.NotificationWhereInput = isCompanyLevel(user)
    ? {}
    : { OR: [{ warehouseId: null }, { warehouseId: user.warehouseId ?? '__none__' }] };

  if (user.role !== 'USER') return base;
  return { AND: [base, { type: { notIn: [...ADMIN_ONLY_TYPES] } }] };
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

// Resolves which userIds should receive a notification scoped to the given
// warehouse — mirrors visibilityWhere() above, just from the recipient side
// instead of the viewer side. Null warehouseId = every user (company-wide).
async function resolveRecipientIds(warehouseId: string | null, type: NotificationType): Promise<string[]> {
  const adminOnly = (ADMIN_ONLY_TYPES as readonly string[]).includes(type);

  const companyLevelUsers = await prisma.user.findMany({
    where: { role: { in: ['COMPANY_ADMIN', 'SUPER_ADMIN'] } },
    select: { id: true },
  });
  const companyLevelIds = companyLevelUsers.map((u) => u.id);

  if (warehouseId === null) {
    if (adminOnly) {
      const adminUsers = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'COMPANY_ADMIN', 'SUPER_ADMIN'] } },
        select: { id: true },
      });
      return adminUsers.map((u) => u.id);
    }
    const allUsers = await prisma.user.findMany({ select: { id: true } });
    return allUsers.map((u) => u.id);
  }

  // adminOnly: only that warehouse's own ADMIN ("Warehouse Admin") -- never
  // its USER ("Warehouse Manager") staff -- plus company-level roles above.
  const warehouseUsers = await prisma.userWarehouse.findMany({
    where: { warehouseId, ...(adminOnly ? { user: { role: 'ADMIN' } } : {}) },
    select: { userId: true },
  });

  return [...new Set([...companyLevelIds, ...warehouseUsers.map((m) => m.userId)])];
}

// Internal helper for other modules to raise a notification. Not exposed via HTTP.
export async function createNotification(input: {
  warehouseId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const notification = await prisma.notification.create({
    data: {
      warehouseId: input.warehouseId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });

  try {
    const recipientIds = await resolveRecipientIds(input.warehouseId ?? null, input.type);
    pushToUsers(recipientIds, {
      type: 'notification',
      id: notification.id,
      notificationType: notification.type,
      title: notification.title,
      message: notification.message,
    });
  } catch (err) {
    // Real-time delivery is best-effort — the notification row already
    // exists, so the 30s poll picks it up regardless.
    logger.error('Failed to push notification over WebSocket', err);
  }
}
