import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { authenticate, authorize, enforceTenant } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { moduleService } from './module.service';

const router = Router({ mergeParams: true });
router.use(authenticate, enforceTenant);

// GET /api/courses/:courseId/modules
router.get('/:courseId/modules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const modules = await moduleService.list(req.params.courseId, req.tenantId!);
    res.json({ success: true, data: modules });
  } catch (err) { next(err); }
});

// POST /api/courses/:courseId/modules
router.post('/:courseId/modules', authorize('INSTRUCTOR', 'ADMIN'),
  validate({ body: Joi.object({ title: Joi.string().min(1).max(200).required(), order: Joi.number().integer().optional() }) }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mod = await moduleService.create(req.params.courseId, req.body, req.tenantId!, req.user!.userId, req.user!.role);
      res.status(201).json({ success: true, data: mod });
    } catch (err) { next(err); }
  }
);

// PATCH /api/courses/:courseId/modules/:moduleId
router.patch('/:courseId/modules/:moduleId', authorize('INSTRUCTOR', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mod = await moduleService.update(req.params.moduleId, req.params.courseId, req.body, req.tenantId!);
      res.json({ success: true, data: mod });
    } catch (err) { next(err); }
  }
);

// DELETE /api/courses/:courseId/modules/:moduleId
router.delete('/:courseId/modules/:moduleId', authorize('INSTRUCTOR', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await moduleService.delete(req.params.moduleId, req.params.courseId, req.tenantId!);
      res.json({ success: true, message: 'Module deleted' });
    } catch (err) { next(err); }
  }
);

export default router;
