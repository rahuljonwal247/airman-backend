import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { authenticate, authorize, enforceTenant } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { bookingRateLimiter } from '../../middleware/rateLimiter';
import { bookingService } from './booking.service';

const router = Router();
router.use(authenticate, enforceTenant);

// GET /api/bookings - list with filters
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await bookingService.list(req.tenantId!, req.user!.userId, req.user!.role, {
      page: Number(req.query.page),
      limit: Number(req.query.limit),
      status: req.query.status as any,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /api/bookings/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await bookingService.getById(req.params.id, req.tenantId!, req.user!.userId, req.user!.role);
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
});

// POST /api/bookings - Students create
router.post('/', bookingRateLimiter,
  validate({
    body: Joi.object({
      title: Joi.string().min(3).max(200).required(),
      startTime: Joi.string().isoDate().required(),
      endTime: Joi.string().isoDate().required(),
      instructorId: Joi.string().uuid().optional(),
      notes: Joi.string().max(500).optional(),
    }),
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const booking = await bookingService.create(
        req.body, req.user!.userId, req.tenantId!, req.correlationId
      );
      res.status(201).json({ success: true, data: booking });
    } catch (err) { next(err); }
  }
);

// POST /api/bookings/:id/approve - Admin approves + optionally assigns instructor
router.post('/:id/approve', authorize('ADMIN'),
  validate({
    body: Joi.object({ instructorId: Joi.string().uuid().optional() }),
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const booking = await bookingService.approve(
        req.params.id, req.body.instructorId, req.user!.userId, req.tenantId!, req.correlationId
      );
      res.json({ success: true, data: booking });
    } catch (err) { next(err); }
  }
);

// POST /api/bookings/:id/complete - Instructor or Admin
router.post('/:id/complete', authorize('INSTRUCTOR', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const booking = await bookingService.complete(req.params.id, req.user!.userId, req.tenantId!);
      res.json({ success: true, data: booking });
    } catch (err) { next(err); }
  }
);

// POST /api/bookings/:id/cancel
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await bookingService.cancel(
      req.params.id, req.user!.userId, req.user!.role, req.tenantId!, req.correlationId
    );
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
});

export default router;
