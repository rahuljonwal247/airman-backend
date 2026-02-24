import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { authenticate, authorize, enforceTenant } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

class AvailabilityService {
  async list(tenantId: string, instructorId?: string) {
    return prisma.instructorAvailability.findMany({
      where: {
        tenantId,
        ...(instructorId ? { instructorId } : {}),
        endTime: { gte: new Date() },
      },
      include: {
        instructor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async create(dto: { startTime: string; endTime: string; isRecurring?: boolean }, instructorId: string, tenantId: string) {
    return prisma.instructorAvailability.create({
      data: {
        instructorId,
        tenantId,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        isRecurring: dto.isRecurring ?? false,
      },
    });
  }

  async delete(id: string, instructorId: string, tenantId: string) {
    const slot = await prisma.instructorAvailability.findFirst({
      where: { id, tenantId, instructorId },
    });
    if (!slot) throw new NotFoundError('Availability slot');
    await prisma.instructorAvailability.delete({ where: { id } });
  }
}

const availabilityService = new AvailabilityService();
const router = Router();
router.use(authenticate, enforceTenant);

// GET /api/availability
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slots = await availabilityService.list(req.tenantId!, req.query.instructorId as string);
    res.json({ success: true, data: slots });
  } catch (err) { next(err); }
});

// POST /api/availability - Instructors set their own
router.post('/', authorize('INSTRUCTOR', 'ADMIN'),
  validate({
    body: Joi.object({
      startTime: Joi.string().isoDate().required(),
      endTime: Joi.string().isoDate().required(),
      isRecurring: Joi.boolean().optional(),
    }),
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slot = await availabilityService.create(req.body, req.user!.userId, req.tenantId!);
      res.status(201).json({ success: true, data: slot });
    } catch (err) { next(err); }
  }
);

// DELETE /api/availability/:id
router.delete('/:id', authorize('INSTRUCTOR', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await availabilityService.delete(req.params.id, req.user!.userId, req.tenantId!);
      res.json({ success: true, message: 'Availability slot removed' });
    } catch (err) { next(err); }
  }
);

export default router;
