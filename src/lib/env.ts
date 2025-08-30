import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const zodUint = z.coerce.number().int().positive();
const zodArray = z
	.string()
	.transform((str) => str.split(',').map((s) => s.trim()));

export const env = createEnv({
	server: {
		PORT: zodUint.default(3000),
		DATABASE_URL: z.url(),

		TRAFFIC_LOG: z.coerce.boolean().default(true),
		LOG_LEVEL: zodUint.optional().default(999),

		ORIGIN: z.string(),
		FRONTEND_ORIGINS: zodArray.default([]),

		// COOKIE NAMES
		SESSION_COOKIE_NAME: z.string().default('sid'),

		PRIMARY_ETH_ACCOUNT_PRIVATE_KEY: z.string(),
		ETHER_PROVIDER_URL: z.string(),
	},
	isServer: true,
	runtimeEnv: Bun.env,
	emptyStringAsUndefined: true,
});

export const isProd = Bun.env.NODE_ENV === 'production';
