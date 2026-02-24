import { Router, Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { authenticate, authorize, enforceTenant } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { quizService } from './quiz.service';

const router = Router();
router.use(authenticate, enforceTenant);

// GET /api/quizzes/:quizId
router.get('/:quizId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quiz = await quizService.getQuiz(req.params.quizId, req.tenantId!, req.user!.userId);
    res.json({ success: true, data: quiz });
  } catch (err) { next(err); }
});

// POST /api/quizzes/:quizId/questions - Instructor/Admin
router.post('/:quizId/questions', authorize('INSTRUCTOR', 'ADMIN'),
  validate({
    body: Joi.object({
      text: Joi.string().required(),
      options: Joi.array().items(Joi.string()).min(2).max(6).required(),
      correctAnswer: Joi.number().integer().min(0).required(),
      order: Joi.number().integer().optional(),
    }),
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const question = await quizService.addQuestion(req.params.quizId, req.body, req.tenantId!);
      res.status(201).json({ success: true, data: question });
    } catch (err) { next(err); }
  }
);

// POST /api/quizzes/:quizId/attempts - Student submits attempt
router.post('/:quizId/attempts',
  validate({
    body: Joi.object({
      answers: Joi.array().items(Joi.object({
        questionId: Joi.string().uuid().required(),
        selectedAnswer: Joi.number().integer().min(0).required(),
      })).min(1).required(),
    }),
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await quizService.submitAttempt(
        req.params.quizId, req.body, req.user!.userId, req.tenantId!
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
  }
);

// GET /api/quizzes/:quizId/attempts
router.get('/:quizId/attempts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attempts = await quizService.getAttempts(req.params.quizId, req.user!.userId, req.tenantId!);
    res.json({ success: true, data: attempts });
  } catch (err) { next(err); }
});

export default router;
