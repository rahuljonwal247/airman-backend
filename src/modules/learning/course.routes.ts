import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { authenticate, authorize, enforceTenant } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { courseService } from './course.service';

const router = Router();
router.use(authenticate, enforceTenant);

const courseSchema = {
  body: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().max(1000).optional(),
    instructorId: Joi.string().uuid().optional(),
    isPublished: Joi.boolean().optional(),
  }),
};

// GET /api/courses - paginated, searchable
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isAdminOrInstructor = ['ADMIN', 'INSTRUCTOR'].includes(req.user!.role);
    const result = isAdminOrInstructor
      ? await courseService.listAll(req.tenantId!, {
          page: Number(req.query.page) || 1,
          limit: Number(req.query.limit) || 12,
          search: req.query.search as string,
        })
      : await courseService.list(req.tenantId!, {
          page: Number(req.query.page) || 1,
          limit: Number(req.query.limit) || 12,
          search: req.query.search as string,
        });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /api/courses/:id
router.get('/:courseId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await courseService.getById(req.params.courseId, req.tenantId!);
    res.json({ success: true, data: course });
  } catch (err) { next(err); }
});

// POST /api/courses - Instructor or Admin
router.post('/', authorize('INSTRUCTOR', 'ADMIN'),
  validate(courseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = req.body.instructorId || req.user!.userId;
      const course = await courseService.create(
        { ...req.body, instructorId },
        req.tenantId!,
        req.user!.userId
      );
      res.status(201).json({ success: true, data: course });
    } catch (err) { next(err); }
  }
);

// PATCH /api/courses/:courseId
router.patch('/:courseId', authorize('INSTRUCTOR', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const course = await courseService.update(
        req.params.courseId, req.body, req.tenantId!, req.user!.userId, req.user!.role
      );
      res.json({ success: true, data: course });
    } catch (err) { next(err); }
  }
);

// DELETE /api/courses/:courseId - Admin only
router.delete('/:courseId', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await courseService.delete(req.params.courseId, req.tenantId!, req.user!.userId);
    res.json({ success: true, message: 'Course deleted' });
  } catch (err) { next(err); }
});

export default router;
