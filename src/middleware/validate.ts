import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from '../lib/errors';

export function validate(schema: {
  body?: Joi.Schema;
  query?: Joi.Schema;
  params?: Joi.Schema;
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    if (schema.body) {
      const { error } = schema.body.validate(req.body, { abortEarly: false });
      if (error) errors.push(...error.details.map((d) => d.message));
    }

    if (schema.query) {
      const { error } = schema.query.validate(req.query, { abortEarly: false });
      if (error) errors.push(...error.details.map((d) => d.message));
    }

    if (schema.params) {
      const { error } = schema.params.validate(req.params, { abortEarly: false });
      if (error) errors.push(...error.details.map((d) => d.message));
    }

    if (errors.length > 0) {
      return next(new ValidationError('Validation failed', errors));
    }

    next();
  };
}
