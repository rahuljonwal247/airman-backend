import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { createAuditLog } from '../lib/audit';

const ESCALATION_HOURS = parseInt(process.env.ESCALATION_HOURS || '2', 10);
const JOB_INTERVAL_MS = parseInt(process.env.ESCALATION_CHECK_INTERVAL_MS || '300000', 10); // 5 min

/**
 * Background job: Escalates bookings that are still REQUESTED
 * and haven't had an instructor assigned within ESCALATION_HOURS.
 */
export async function runEscalationJob(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - ESCALATION_HOURS);

    const unassigned = await prisma.booking.findMany({
      where: {
        status: 'REQUESTED',
        instructorId: null,
        createdAt: { lte: cutoff },
        escalatedAt: null,
      },
      include: {
        tenant: { select: { id: true, name: true } },
        student: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (unassigned.length === 0) return;

    logger.info(`[EscalationJob] Found ${unassigned.length} booking(s) to escalate`);

    for (const booking of unassigned) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { escalatedAt: new Date() },
      });

      // Email stub - log escalation alert
      logger.warn(`[EMAIL STUB - ESCALATION] Tenant: ${booking.tenant.name} | Booking: ${booking.id} | Student: ${booking.student.firstName} ${booking.student.lastName} | No instructor assigned after ${ESCALATION_HOURS}h`);

      await createAuditLog({
        tenantId: booking.tenantId,
        action: 'BOOKING_ESCALATED',
        resource: 'booking',
        resourceId: booking.id,
        before: { status: 'REQUESTED', escalatedAt: null },
        after: { escalatedAt: new Date().toISOString() },
      });
    }
  } catch (err) {
    logger.error('[EscalationJob] Error during escalation run', err);
  }
}

export function scheduleEscalationJob(): NodeJS.Timeout {
  logger.info(`[EscalationJob] Scheduled — runs every ${JOB_INTERVAL_MS / 1000}s, escalates after ${ESCALATION_HOURS}h`);
  
  // Run immediately on startup
  runEscalationJob();
  
  // Then on interval
  return setInterval(runEscalationJob, JOB_INTERVAL_MS);
}
