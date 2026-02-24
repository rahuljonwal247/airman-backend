import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

interface AuditParams {
  userId?: string;
  tenantId: string;
  action: string;
  resource: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        before: params.before as any,
        after: params.after as any,
        correlationId: params.correlationId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    // Audit log failure should never break the main flow
    logger.error('Failed to write audit log', err);
  }
}

export function auditMiddleware(action: string, resource: string) {
  return async (userId: string | undefined, tenantId: string, resourceId?: string, before?: unknown, after?: unknown, correlationId?: string) => {
    await createAuditLog({ userId, tenantId, action, resource, resourceId, before, after, correlationId });
  };
}
