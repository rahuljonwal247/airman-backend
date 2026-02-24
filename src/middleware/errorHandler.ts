import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = req.correlationId;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Application error', { message: err.message, stack: err.stack, correlationId });
    } else {
      logger.warn('Client error', { message: err.message, code: err.code, correlationId });
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err as any).details ? { details: (err as any).details } : {},
      },
      correlationId,
    });
    return;
  }

  // Prisma errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    if (prismaErr.code === 'P2025') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' }, correlationId });
      return;
    }
    if (prismaErr.code === 'P2002') {
      res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'Record already exists' }, correlationId });
      return;
    }
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack, correlationId });
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    correlationId,
  });
}
