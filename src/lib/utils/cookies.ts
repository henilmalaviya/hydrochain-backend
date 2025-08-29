import { CookieOptions } from 'elysia';
import { isProd } from '../env';

export const defaultCookieOptions: CookieOptions = {
	httpOnly: true,
	path: '/',
	sameSite: 'lax',
	secure: isProd,
};
