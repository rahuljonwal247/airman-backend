import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many auth attempts. Try again in 15 minutes.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const bookingRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many booking requests.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
