import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { authenticate, authorize, enforceTenant } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { lessonService } from './lesson.service';

const router = Router({ mergeParams: true });
router.use(authenticate, enforceTenant);

// GET /api/courses/:courseId/modules/:moduleId/lessons/:lessonId
router.get('/:courseId/modules/:moduleId/lessons/:lessonId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lesson = await lessonService.getById(req.params.lessonId, req.tenantId!);
      res.json({ success: true, data: lesson });
    } catch (err) { next(err); }
  }
);

// POST /api/courses/:courseId/modules/:moduleId/lessons
router.post('/:courseId/modules/:moduleId/lessons', authorize('INSTRUCTOR', 'ADMIN'),
  validate({
    body: Joi.object({
      title: Joi.string().min(1).max(200).required(),
      type: Joi.string().valid('TEXT', 'QUIZ').required(),
      content: Joi.string().optional(),
    }),
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lesson = await lessonService.create(req.params.moduleId, req.body, req.tenantId!);
      res.status(201).json({ success: true, data: lesson });
    } catch (err) { next(err); }
  }
);

// PATCH /api/courses/:courseId/modules/:moduleId/lessons/:lessonId
router.patch('/:courseId/modules/:moduleId/lessons/:lessonId', authorize('INSTRUCTOR', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lesson = await lessonService.update(req.params.lessonId, req.body, req.tenantId!);
      res.json({ success: true, data: lesson });
    } catch (err) { next(err); }
  }
);

// DELETE
router.delete('/:courseId/modules/:moduleId/lessons/:lessonId', authorize('INSTRUCTOR', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await lessonService.delete(req.params.lessonId, req.tenantId!);
      res.json({ success: true, message: 'Lesson deleted' });
    } catch (err) { next(err); }
  }
);

export default router;
