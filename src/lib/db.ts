import { PrismaClient } from '@/generated/prisma';
import { logger } from '@/lib/logger';

const globalForDb = globalThis as unknown as { db: PrismaClient };

logger.debug('Initializing database connection...');

const db =
	globalForDb.db ||
	new PrismaClient({
		log:
			Bun.env.NODE_ENV == 'development'
				? ['query', 'error', 'warn']
				: ['warn', 'error'],
	});

if (Bun.env.NODE_ENV !== 'production') globalForDb.db = db;

logger.info('Database connection established successfully');

export default db;
