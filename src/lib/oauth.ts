import { Google } from 'arctic';
import { env } from '@/lib/env';

export const google = new Google(
	env.GOOGLE_OAUTH_CLIENT_ID,
	env.GOOGLE_OAUTH_CLIENT_SECRET,
	`${env.ORIGIN}/auth/google/callback`,
);
