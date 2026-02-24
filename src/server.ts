import app from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { scheduleEscalationJob } from './jobs/escalation.job';

const PORT = parseInt(process.env.PORT || '4000', 10);

async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected');

    // Start background jobs (Level 2)
    scheduleEscalationJob();

    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

bootstrap();
