import { prisma } from '../../lib/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../lib/errors';
import { createAuditLog } from '../../lib/audit';
import { BookingStatus } from '@prisma/client';

export interface CreateBookingDto {
  title: string;
  startTime: string;
  endTime: string;
  instructorId?: string;
  notes?: string;
}

export class BookingService {
  /**
   * Core conflict detection: checks if instructor has overlapping booking
   * Overlap formula: start1 < end2 AND end1 > start2
   */
  async detectConflict(
    instructorId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string
  ): Promise<boolean> {
    const conflict = await prisma.booking.findFirst({
      where: {
        instructorId,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: { in: ['REQUESTED', 'APPROVED', 'ASSIGNED'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    return !!conflict;
  }

  async list(tenantId: string, userId: string, userRole: string, query: {
    page?: number;
    limit?: number;
    status?: BookingStatus;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    // Students only see their own bookings
    if (userRole === 'STUDENT') where.studentId = userId;
    // Instructors see their assigned bookings
    if (userRole === 'INSTRUCTOR') where.instructorId = userId;

    if (query.status) where.status = query.status;
    if (query.startDate || query.endDate) {
      where.startTime = {};
      if (query.startDate) where.startTime.gte = new Date(query.startDate);
      if (query.endDate) where.startTime.lte = new Date(query.endDate);
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where, skip, take: limit,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, email: true } },
          instructor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      prisma.booking.count({ where }),
    ]);

    return { data: bookings, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(bookingId: string, tenantId: string, userId: string, userRole: string) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        instructor: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!booking) throw new NotFoundError('Booking');

    // Access check
    if (userRole === 'STUDENT' && booking.studentId !== userId) throw new ForbiddenError();
    if (userRole === 'INSTRUCTOR' && booking.instructorId !== userId) throw new ForbiddenError();

    return booking;
  }

  async create(dto: CreateBookingDto, studentId: string, tenantId: string, correlationId?: string) {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) throw new ValidationError('End time must be after start time');
    if (startTime < new Date()) throw new ValidationError('Cannot book in the past');

    // If instructor requested, check for conflict
    if (dto.instructorId) {
      const hasConflict = await this.detectConflict(dto.instructorId, startTime, endTime);
      if (hasConflict) throw new ConflictError('Instructor has a conflicting booking at this time');
    }

    const booking = await prisma.booking.create({
      data: {
        title: dto.title,
        startTime,
        endTime,
        studentId,
        instructorId: dto.instructorId,
        tenantId,
        notes: dto.notes,
        status: 'REQUESTED',
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        instructor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createAuditLog({
      userId: studentId, tenantId,
      action: 'BOOKING_CREATED', resource: 'booking', resourceId: booking.id,
      after: { status: 'REQUESTED', startTime, endTime },
      correlationId,
    });

    // Notify (stub)
    this.notifyStub('BOOKING_REQUESTED', booking);
    return booking;
  }

  async approve(bookingId: string, instructorId: string | undefined, adminId: string, tenantId: string, correlationId?: string) {
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.status !== 'REQUESTED') throw new ValidationError(`Cannot approve booking in status: ${booking.status}`);

    const assignedInstructorId = instructorId || booking.instructorId;

    // Check conflict for assigned instructor
    if (assignedInstructorId) {
      const hasConflict = await this.detectConflict(
        assignedInstructorId, booking.startTime, booking.endTime, bookingId
      );
      if (hasConflict) throw new ConflictError('Instructor has a conflicting booking');
    }

    const before = { status: booking.status, instructorId: booking.instructorId };
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: assignedInstructorId ? 'ASSIGNED' : 'APPROVED',
        instructorId: assignedInstructorId,
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        instructor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await createAuditLog({
      userId: adminId, tenantId,
      action: 'BOOKING_APPROVED', resource: 'booking', resourceId: bookingId,
      before, after: { status: updated.status, instructorId: updated.instructorId },
      correlationId,
    });

    this.notifyStub('BOOKING_APPROVED', updated);
    return updated;
  }

  async complete(bookingId: string, userId: string, tenantId: string) {
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
    if (!booking) throw new NotFoundError('Booking');
    if (!['APPROVED', 'ASSIGNED'].includes(booking.status)) {
      throw new ValidationError('Booking must be approved before completing');
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'COMPLETED' },
    });

    await createAuditLog({
      userId, tenantId,
      action: 'BOOKING_COMPLETED', resource: 'booking', resourceId: bookingId,
      before: { status: booking.status }, after: { status: 'COMPLETED' },
    });

    return updated;
  }

  async cancel(bookingId: string, userId: string, userRole: string, tenantId: string, correlationId?: string) {
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.status === 'COMPLETED') throw new ValidationError('Cannot cancel a completed booking');
    if (booking.status === 'CANCELLED') throw new ValidationError('Booking already cancelled');

    if (userRole === 'STUDENT' && booking.studentId !== userId) throw new ForbiddenError();

    const before = { status: booking.status };
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });

    await createAuditLog({
      userId, tenantId,
      action: 'BOOKING_CANCELLED', resource: 'booking', resourceId: bookingId,
      before, after: { status: 'CANCELLED' }, correlationId,
    });

    this.notifyStub('BOOKING_CANCELLED', updated);
    return updated;
  }

  // Email notification stub - console logger
  private notifyStub(event: string, booking: any) {
    const msg = `[EMAIL STUB] Event: ${event} | Booking: ${booking.id} | Student: ${booking.student?.firstName} | Instructor: ${booking.instructor?.firstName || 'unassigned'} | Time: ${booking.startTime}`;
    console.log(msg);
  }
}

export const bookingService = new BookingService();
