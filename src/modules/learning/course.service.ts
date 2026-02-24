import { prisma } from '../../lib/prisma';
import { NotFoundError, ForbiddenError } from '../../lib/errors';
import { cacheGet, cacheSet, cacheDel } from '../../lib/redis';
import { createAuditLog } from '../../lib/audit';

export interface CourseDto {
  title: string;
  description?: string;
}

export class CourseService {
  private cacheKey(tenantId: string, suffix = '') {
    return `courses:${tenantId}:${suffix}`;
  }

  async list(tenantId: string, query: { page?: number; limit?: number; search?: string }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, query.limit || 12);
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const cacheKey = this.cacheKey(tenantId, `list:${page}:${limit}:${search || ''}`);
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const where = {
      tenantId,
      isPublished: true,
      ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true, title: true, description: true, isPublished: true, createdAt: true,
          instructor: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { modules: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.course.count({ where }),
    ]);

    const result = { data: courses, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    await cacheSet(cacheKey, result, 300);
    return result;
  }

  async listAll(tenantId: string, query: { page?: number; limit?: number; search?: string }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, query.limit || 12);
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const where = {
      tenantId,
      ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where, skip, take: limit,
        select: {
          id: true, title: true, description: true, isPublished: true, createdAt: true,
          instructor: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { modules: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.course.count({ where }),
    ]);

    return { data: courses, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(courseId: string, tenantId: string) {
    const cacheKey = this.cacheKey(tenantId, `detail:${courseId}`);
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const course = await prisma.course.findFirst({
      where: { id: courseId, tenantId },
      include: {
        instructor: { select: { id: true, firstName: true, lastName: true } },
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: { orderBy: { order: 'asc' }, select: { id: true, title: true, type: true, order: true } },
          },
        },
      },
    });

    if (!course) throw new NotFoundError('Course');
    await cacheSet(cacheKey, course, 300);
    return course;
  }

  async create(dto: CourseDto & { instructorId: string }, tenantId: string, userId: string) {
    const course = await prisma.course.create({
      data: { ...dto, tenantId },
      select: { id: true, title: true, description: true, isPublished: true },
    });

    await cacheDel(this.cacheKey(tenantId, 'list:*'));
    await createAuditLog({
      userId, tenantId, action: 'COURSE_CREATED',
      resource: 'course', resourceId: course.id, after: dto,
    });

    return course;
  }

  async update(courseId: string, dto: Partial<CourseDto & { isPublished?: boolean; instructorId?: string }>, tenantId: string, userId: string, userRole: string) {
    const course = await prisma.course.findFirst({ where: { id: courseId, tenantId } });
    if (!course) throw new NotFoundError('Course');

    if (userRole === 'INSTRUCTOR' && course.instructorId !== userId) {
      throw new ForbiddenError('Not your course');
    }

    const before = { title: course.title, isPublished: course.isPublished };
    const updated = await prisma.course.update({
      where: { id: courseId },
      data: dto,
      select: { id: true, title: true, description: true, isPublished: true },
    });

    await cacheDel(this.cacheKey(tenantId, '*'));
    await createAuditLog({
      userId, tenantId, action: 'COURSE_UPDATED',
      resource: 'course', resourceId: courseId, before, after: dto,
    });

    return updated;
  }

  async delete(courseId: string, tenantId: string, userId: string) {
    const course = await prisma.course.findFirst({ where: { id: courseId, tenantId } });
    if (!course) throw new NotFoundError('Course');

    await prisma.course.delete({ where: { id: courseId } });
    await cacheDel(this.cacheKey(tenantId, '*'));
    await createAuditLog({
      userId, tenantId, action: 'COURSE_DELETED',
      resource: 'course', resourceId: courseId,
    });
  }
}

export const courseService = new CourseService();
