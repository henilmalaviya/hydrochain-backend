import swagger from '@elysiajs/swagger';
import { logger as niceLogger } from '@tqman/nice-logger';
import { Elysia } from 'elysia';
import { env } from '@/lib/env';
import cors from '@elysiajs/cors';
import { usersRoutes } from './routes/users';

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
	.get('/', () => 'OK', {
		tags: ['misc'],
	})
	.listen(env.PORT);
