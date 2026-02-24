/**
 * Integration test: Booking conflict detection against real DB
 * Uses testcontainers or a test DATABASE_URL env var.
 *
 * Run with: DATABASE_URL=... jest --testPathPattern=integration
 */

import { PrismaClient } from '@prisma/client';
import { BookingService } from '../modules/scheduling/booking.service';

const TEST_DB = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// Skip if no test DB available
const describeIf = TEST_DB ? describe : describe.skip;

let prismaTest: PrismaClient;
let service: BookingService;

const TENANT_ID = 'test-tenant-integration';
const INSTRUCTOR_ID = 'test-instructor-integration';
const STUDENT_ID = 'test-student-integration';

describeIf('BookingService Integration - Conflict Detection', () => {
  beforeAll(async () => {
    prismaTest = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
    service = new BookingService();

    // Create test fixtures
    await prismaTest.$executeRawUnsafe(`
      INSERT INTO tenants (id, name, slug, "isActive", "createdAt", "updatedAt")
      VALUES ('${TENANT_ID}', 'Test Tenant', 'test-integration-${Date.now()}', true, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `);
  });

  afterAll(async () => {
    await prismaTest.booking.deleteMany({ where: { tenantId: TENANT_ID } });
    await prismaTest.tenant.deleteMany({ where: { id: TENANT_ID } });
    await prismaTest.$disconnect();
  });

  it('should detect conflict from DB when overlapping booking exists', async () => {
    const start1 = new Date('2099-06-15T09:00:00Z');
    const end1 = new Date('2099-06-15T11:00:00Z');

    // Create a booking directly in DB
    await prismaTest.booking.create({
      data: {
        title: 'Existing',
        startTime: start1,
        endTime: end1,
        studentId: STUDENT_ID,
        instructorId: INSTRUCTOR_ID,
        tenantId: TENANT_ID,
        status: 'APPROVED',
      },
    });

    // Overlapping slot: 10:00 - 12:00
    const hasConflict = await service.detectConflict(
      INSTRUCTOR_ID,
      new Date('2099-06-15T10:00:00Z'),
      new Date('2099-06-15T12:00:00Z')
    );
    expect(hasConflict).toBe(true);
  });

  it('should not detect conflict when bookings do not overlap', async () => {
    const hasConflict = await service.detectConflict(
      INSTRUCTOR_ID,
      new Date('2099-06-15T13:00:00Z'),
      new Date('2099-06-15T15:00:00Z')
    );
    expect(hasConflict).toBe(false);
  });
});
