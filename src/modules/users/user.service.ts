import { prisma } from '../../lib/prisma';
import { NotFoundError, ForbiddenError } from '../../lib/errors';
import { createAuditLog } from '../../lib/audit';
import { Role } from '@prisma/client';

export class UserService {
  async listUsers(tenantId: string, query: { page?: number; limit?: number; role?: string }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, query.limit || 20);
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(query.role ? { role: query.role as Role } : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, isApproved: true, isActive: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return { data: users, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getUser(userId: string, tenantId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isApproved: true, isActive: true, createdAt: true,
      },
    });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async approveUser(targetId: string, requestingUserId: string, tenantId: string) {
    const target = await prisma.user.findFirst({ where: { id: targetId, tenantId } });
    if (!target) throw new NotFoundError('User');

    const before = { isApproved: target.isApproved };
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { isApproved: true },
      select: { id: true, email: true, role: true, isApproved: true },
    });

    await createAuditLog({
      userId: requestingUserId,
      tenantId,
      action: 'USER_APPROVED',
      resource: 'user',
      resourceId: targetId,
      before,
      after: { isApproved: true },
    });

    return updated;
  }

  async createInstructor(
    dto: { email: string; password: string; firstName: string; lastName: string },
    requestingUserId: string,
    tenantId: string
  ) {
    const bcrypt = require('bcryptjs');
    const { ConflictError } = require('../../lib/errors');

    const existing = await prisma.user.findUnique({
      where: { email_tenantId: { email: dto.email, tenantId } },
    });
    if (existing) throw new ConflictError('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const instructor = await prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'INSTRUCTOR',
        isApproved: true,
        tenantId,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    await createAuditLog({
      userId: requestingUserId,
      tenantId,
      action: 'INSTRUCTOR_CREATED',
      resource: 'user',
      resourceId: instructor.id,
      after: { email: instructor.email, role: 'INSTRUCTOR' },
    });

    return instructor;
  }

  async updateRole(targetId: string, role: Role, requestingUserId: string, tenantId: string) {
    const target = await prisma.user.findFirst({ where: { id: targetId, tenantId } });
    if (!target) throw new NotFoundError('User');

    const before = { role: target.role };
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    await createAuditLog({
      userId: requestingUserId,
      tenantId,
      action: 'ROLE_CHANGED',
      resource: 'user',
      resourceId: targetId,
      before,
      after: { role },
    });

    return updated;
  }

  async listInstructors(tenantId: string) {
    return prisma.user.findMany({
      where: { tenantId, role: 'INSTRUCTOR', isApproved: true, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }
}

export const userService = new UserService();
