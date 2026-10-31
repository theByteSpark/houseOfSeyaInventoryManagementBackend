import type { Prisma } from '@prisma/client';
import { prisma } from '@/config/db';
import type { AuthenticatedUser } from '@/middleware/authenticate';
import { createNotification } from '@/modules/notifications/notifications.service';
import { logger } from '@/utils/logger';

// Only Warehouse Manager (Role.USER) actions are tracked -- Admin wants
// visibility into what Warehouse Managers do, not a log of their own
// actions. Writes a durable AuditLog row every time, and (unless `notify`
// is explicitly false, used when the caller already raises its own
// business-event notification, e.g. "Purchase received") also raises the
// matching color-coded Notification so Admin sees it in real time too.
export async function logAudit(params: {
  user: AuthenticatedUser;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: string;
  entityId: string;
  entityLabel: string;
  payload?: Record<string, unknown> | null;
  notify?: boolean;
}) {
  if (params.user.role !== 'USER') return;

  try {
    const actor = await prisma.user.findUnique({ where: { id: params.user.id }, select: { name: true } });
    const userName = actor?.name ?? 'A warehouse manager';
    const warehouseId = params.user.warehouseId;

    await prisma.auditLog.create({
      data: {
        userId: params.user.id,
        userName,
        userRole: params.user.role,
        warehouseId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        entityLabel: params.entityLabel,
        payload: (params.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    if (params.notify === false) return;

    const verb = params.action === 'CREATE' ? 'created' : params.action === 'UPDATE' ? 'updated' : 'deleted';
    const notificationType =
      params.action === 'CREATE' ? 'ACTIVITY_CREATE' : params.action === 'UPDATE' ? 'ACTIVITY_UPDATE' : 'ACTIVITY_DELETE';

    await createNotification({
      warehouseId,
      type: notificationType,
      title: `${params.entityType} ${verb}`,
      message: `${userName} (Warehouse Manager) ${verb} ${params.entityLabel}.`,
      metadata: { entityType: params.entityType, entityId: params.entityId, action: params.action },
    });
  } catch (err) {
    // Audit logging must never block the real action it's describing.
    logger.error('logAudit failed', err);
  }
}
