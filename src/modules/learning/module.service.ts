import { prisma } from '../../lib/prisma';
import { NotFoundError, ForbiddenError } from '../../lib/errors';
import { cacheDel } from '../../lib/redis';

export class ModuleService {
  private async verifyCourseAccess(courseId: string, tenantId: string) {
    const course = await prisma.course.findFirst({ where: { id: courseId, tenantId } });
    if (!course) throw new NotFoundError('Course');
    return course;
  }

  async list(courseId: string, tenantId: string) {
    await this.verifyCourseAccess(courseId, tenantId);
    return prisma.module.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      include: {
        lessons: { orderBy: { order: 'asc' }, select: { id: true, title: true, type: true, order: true } },
      },
    });
  }

  async create(courseId: string, dto: { title: string; order?: number }, tenantId: string, userId: string, userRole: string) {
    const course = await this.verifyCourseAccess(courseId, tenantId);
    if (userRole === 'INSTRUCTOR' && course.instructorId !== userId) throw new ForbiddenError('Not your course');

    const lastModule = await prisma.module.findFirst({ where: { courseId }, orderBy: { order: 'desc' } });
    const order = dto.order ?? (lastModule ? lastModule.order + 1 : 1);

    const module = await prisma.module.create({
      data: { title: dto.title, courseId, order },
    });
    await cacheDel(`courses:${tenantId}:*`);
    return module;
  }

  async update(moduleId: string, courseId: string, dto: { title?: string; order?: number }, tenantId: string) {
    await this.verifyCourseAccess(courseId, tenantId);
    const mod = await prisma.module.findFirst({ where: { id: moduleId, courseId } });
    if (!mod) throw new NotFoundError('Module');
    const updated = await prisma.module.update({ where: { id: moduleId }, data: dto });
    await cacheDel(`courses:${tenantId}:*`);
    return updated;
  }

  async delete(moduleId: string, courseId: string, tenantId: string) {
    await this.verifyCourseAccess(courseId, tenantId);
    const mod = await prisma.module.findFirst({ where: { id: moduleId, courseId } });
    if (!mod) throw new NotFoundError('Module');
    await prisma.module.delete({ where: { id: moduleId } });
    await cacheDel(`courses:${tenantId}:*`);
  }
}

export const moduleService = new ModuleService();
