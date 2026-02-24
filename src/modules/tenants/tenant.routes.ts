import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticate, authorize, enforceTenant } from '../../middleware/auth';

const router = Router();

// GET /api/tenants - public, needed for login form slug lookup
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
    });
    res.json({ success: true, data: tenants });
  } catch (err) { next(err); }
});

// GET /api/tenants/me - current tenant info
router.get('/me', authenticate, enforceTenant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: { id: true, name: true, slug: true },
    });
    res.json({ success: true, data: tenant });
  } catch (err) { next(err); }
});

export default router;
