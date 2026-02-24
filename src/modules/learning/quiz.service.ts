import { prisma } from '../../lib/prisma';
import { NotFoundError, ForbiddenError } from '../../lib/errors';

interface QuestionDto {
  text: string;
  options: string[];
  correctAnswer: number;
  order?: number;
}

interface AttemptDto {
  answers: { questionId: string; selectedAnswer: number }[];
}

export class QuizService {
  private async verifyQuizAccess(quizId: string, tenantId: string) {
    const quiz = await prisma.quiz.findFirst({
      where: { id: quizId },
      include: {
        lesson: {
          include: { module: { include: { course: { select: { tenantId: true } } } } },
        },
        questions: { orderBy: { order: 'asc' } },
      },
    });
    if (!quiz || quiz.lesson.module.course.tenantId !== tenantId) throw new NotFoundError('Quiz');
    return quiz;
  }

  async getQuiz(quizId: string, tenantId: string, userId: string) {
    const quiz = await this.verifyQuizAccess(quizId, tenantId);

    // Get user's last attempt
    const lastAttempt = await prisma.quizAttempt.findFirst({
      where: { quizId, userId },
      orderBy: { completedAt: 'desc' },
    });

    // Strip correct answers for students
    const questions = quiz.questions.map(({ correctAnswer: _, ...q }) => q);
    return { ...quiz, questions, lastAttempt };
  }

  async addQuestion(quizId: string, dto: QuestionDto, tenantId: string) {
    await this.verifyQuizAccess(quizId, tenantId);
    const lastQ = await prisma.question.findFirst({ where: { quizId }, orderBy: { order: 'desc' } });
    const order = dto.order ?? (lastQ ? lastQ.order + 1 : 1);

    return prisma.question.create({
      data: { quizId, text: dto.text, options: dto.options, correctAnswer: dto.correctAnswer, order },
    });
  }

  async submitAttempt(quizId: string, dto: AttemptDto, userId: string, tenantId: string) {
    const quiz = await this.verifyQuizAccess(quizId, tenantId);

    if (quiz.questions.length === 0) throw new ForbiddenError('Quiz has no questions');

    const totalPoints = quiz.questions.length;
    let earnedPoints = 0;
    const incorrectQuestions: { questionId: string; yourAnswer: number; correctAnswer: number; questionText: string }[] = [];

    for (const answer of dto.answers) {
      const question = quiz.questions.find((q) => q.id === answer.questionId);
      if (!question) continue;

      if (answer.selectedAnswer === question.correctAnswer) {
        earnedPoints++;
      } else {
        incorrectQuestions.push({
          questionId: question.id,
          yourAnswer: answer.selectedAnswer,
          correctAnswer: question.correctAnswer,
          questionText: question.text,
        });
      }
    }

    const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;

    const attempt = await prisma.quizAttempt.create({
      data: {
        userId,
        quizId,
        answers: dto.answers,
        score,
        totalPoints,
        earnedPoints,
      },
    });

    return { attempt, score, earnedPoints, totalPoints, incorrectQuestions };
  }

  async getAttempts(quizId: string, userId: string, tenantId: string) {
    await this.verifyQuizAccess(quizId, tenantId);
    return prisma.quizAttempt.findMany({
      where: { quizId, userId },
      orderBy: { completedAt: 'desc' },
      take: 10,
    });
  }
}

export const quizService = new QuizService();
