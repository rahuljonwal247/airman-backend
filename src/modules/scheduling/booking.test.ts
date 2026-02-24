import { BookingService } from './booking.service';

jest.mock('../../lib/prisma', () => ({
  prisma: {
    booking: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

jest.mock('../../lib/audit', () => ({ createAuditLog: jest.fn() }));

import { prisma } from '../../lib/prisma';

describe('BookingService - Conflict Detection', () => {
  let service: BookingService;

  beforeEach(() => {
    service = new BookingService();
    jest.clearAllMocks();
  });

  const t = (hour: number) => new Date(`2025-06-15T${String(hour).padStart(2, '0')}:00:00Z`);

  it('should detect conflict when bookings overlap', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });
    const result = await service.detectConflict('instructor-1', t(9), t(11));
    expect(result).toBe(true);
  });

  it('should not detect conflict when bookings are adjacent', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await service.detectConflict('instructor-1', t(11), t(13));
    expect(result).toBe(false);
  });

  it('should not detect conflict for different instructor', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await service.detectConflict('instructor-2', t(9), t(11));
    expect(result).toBe(false);
  });

  it('should exclude the current booking when checking for self-conflict (update)', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await service.detectConflict('instructor-1', t(9), t(11), 'booking-1');
    expect(result).toBe(false);
    const call = (prisma.booking.findFirst as jest.Mock).mock.calls[0][0];
    expect(call.where.id).toEqual({ not: 'booking-1' });
  });

  it('should detect conflict when new booking contains existing booking', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({ id: 'inner-booking' });
    // Existing: 10-11, New: 9-12 (contains existing)
    const result = await service.detectConflict('instructor-1', t(9), t(12));
    expect(result).toBe(true);
  });
});

describe('BookingService - Create Booking', () => {
  let service: BookingService;

  beforeEach(() => {
    service = new BookingService();
    jest.clearAllMocks();
  });

  it('should throw ValidationError if endTime <= startTime', async () => {
    const { ValidationError } = require('../../lib/errors');
    await expect(service.create(
      { title: 'Test', startTime: '2025-12-01T11:00:00Z', endTime: '2025-12-01T09:00:00Z' },
      'student-1', 'tenant-1'
    )).rejects.toThrow(ValidationError);
  });

  it('should throw ConflictError if instructor has conflict', async () => {
    const { ConflictError } = require('../../lib/errors');
    jest.spyOn(service, 'detectConflict').mockResolvedValue(true);
    await expect(service.create(
      {
        title: 'Test',
        startTime: new Date(Date.now() + 86400000).toISOString(),
        endTime: new Date(Date.now() + 90000000).toISOString(),
        instructorId: 'inst-1'
      },
      'student-1', 'tenant-1'
    )).rejects.toThrow(ConflictError);
  });
});
