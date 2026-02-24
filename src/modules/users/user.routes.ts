import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { authenticate, authorize, enforceTenant } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { userService } from './user.service';

const router = Router();

router.use(authenticate, enforceTenant);

// GET /api/users - Admin only
router.get('/', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await userService.listUsers(req.tenantId!, {
      page: Number(req.query.page),
      limit: Number(req.query.limit),
      role: req.query.role as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /api/users/instructors - Students and above
router.get('/instructors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructors = await userService.listInstructors(req.tenantId!);
    res.json({ success: true, data: instructors });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUser(req.params.id, req.tenantId!);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// POST /api/users/:id/approve - Admin
router.post('/:id/approve', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.approveUser(req.params.id, req.user!.userId, req.tenantId!);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// POST /api/users/instructors - Admin creates instructor
router.post('/instructors', authorize('ADMIN'),
  validate({
    body: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required(),
      firstName: Joi.string().required(),
      lastName: Joi.string().required(),
    }),
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructor = await userService.createInstructor(req.body, req.user!.userId, req.tenantId!);
      res.status(201).json({ success: true, data: instructor });
    } catch (err) { next(err); }
  }
);

// PATCH /api/users/:id/role - Admin
router.patch('/:id/role', authorize('ADMIN'),
  validate({ body: Joi.object({ role: Joi.string().valid('STUDENT', 'INSTRUCTOR', 'ADMIN').required() }) }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.updateRole(req.params.id, req.body.role, req.user!.userId, req.tenantId!);
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  }
);

export default router;
