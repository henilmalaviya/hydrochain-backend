import swagger from '@elysiajs/swagger';
import { logger as niceLogger } from '@tqman/nice-logger';
import { Elysia } from 'elysia';
import { env } from '@/lib/env';
import cors from '@elysiajs/cors';
import { usersRoutes } from './routes/users';
import { logger } from '@/lib/logger';

logger.info('🚀 Starting HydroChain Backend Server...');

const app = new Elysia({
	precompile: true,
})
	.use(
		cors({
			origin: env.FRONTEND_ORIGINS,
		}),
	)
	.use(swagger())
	.use(
		niceLogger({
			mode: 'live',
			withTimestamp: true,
			enabled: env.TRAFFIC_LOG,
			withBanner: true,
		}),
	)
	.use(usersRoutes)
	.get(
		'/',
		() => {
			logger.debug('Health check endpoint accessed');
			return 'OK';
		},
		{
			tags: ['misc'],
		},
	)
	.listen(env.PORT);

logger.success(
	`🌊 HydroChain Backend Server is running on http://localhost:${env.PORT}`,
);
logger.info(
	`📝 API Documentation available at http://localhost:${env.PORT}/swagger`,
);
logger.info(`📊 Log Level: ${env.LOG_LEVEL}`);
