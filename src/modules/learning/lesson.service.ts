import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { cacheDel } from '../../lib/redis';

export class LessonService {
  private async verifyModuleAccess(moduleId: string, tenantId: string) {
    const mod = await prisma.module.findFirst({
      where: { id: moduleId },
      include: { course: { select: { tenantId: true } } },
    });
    if (!mod || mod.course.tenantId !== tenantId) throw new NotFoundError('Module');
    return mod;
  }

  async getById(lessonId: string, tenantId: string) {
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId },
      include: {
        module: { include: { course: { select: { tenantId: true, id: true } } } },
        quiz: { include: { questions: { orderBy: { order: 'asc' } } } },
      },
    });
    if (!lesson || lesson.module.course.tenantId !== tenantId) throw new NotFoundError('Lesson');
    return lesson;
  }

  async create(moduleId: string, dto: { title: string; type: 'TEXT' | 'QUIZ'; content?: string }, tenantId: string) {
    const mod = await this.verifyModuleAccess(moduleId, tenantId);
    const lastLesson = await prisma.lesson.findFirst({ where: { moduleId }, orderBy: { order: 'desc' } });
    const order = lastLesson ? lastLesson.order + 1 : 1;

    const lesson = await prisma.lesson.create({
      data: { title: dto.title, type: dto.type, content: dto.content, moduleId, order },
    });

    if (dto.type === 'QUIZ') {
      await prisma.quiz.create({ data: { lessonId: lesson.id } });
    }

    await cacheDel(`courses:${tenantId}:*`);
    return lesson;
  }

  async update(lessonId: string, dto: { title?: string; content?: string }, tenantId: string) {
    const lesson = await this.getById(lessonId, tenantId);
    const updated = await prisma.lesson.update({ where: { id: lessonId }, data: dto });
    await cacheDel(`courses:${tenantId}:*`);
    return updated;
  }

  async delete(lessonId: string, tenantId: string) {
    const lesson = await this.getById(lessonId, tenantId);
    await prisma.lesson.delete({ where: { id: lessonId } });
    await cacheDel(`courses:${tenantId}:*`);
  }
}

export const lessonService = new LessonService();
