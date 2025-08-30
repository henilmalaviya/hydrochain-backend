import { UserRole } from '@/generated/prisma';
import { env } from '@/lib/env';
import { getSession } from '@/lib/operations/session';
import { until } from '@open-draft/until';
import Elysia from 'elysia';
import { StatusCodes } from 'http-status-codes';
import moment from 'moment';

export const authMiddleware = (allowedRoles?: UserRole[]) => {
	return new Elysia({
		name: 'authMiddleware',
	}).derive({ as: 'scoped' }, async (ctx) => {
		const { cookie, status } = ctx;

		const sessionId = cookie[env.SESSION_COOKIE_NAME].value;

		if (!sessionId) {
			return status(StatusCodes.UNAUTHORIZED, {
				error: 'Unauthorized',
				message: 'Session ID is required',
			});
		}

		const { data: session, error } = await until(() =>
			getSession(sessionId),
		);

		if (error || !session) {
			return status(StatusCodes.UNAUTHORIZED, {
				error: 'Unauthorized',
				message: 'Invalid session ID',
			});
		}

		if (moment().isAfter(session.expiresAt)) {
			return status(StatusCodes.UNAUTHORIZED, {
				error: 'Unauthorized',
				message: 'Session has expired',
			});
		}

		if (allowedRoles && !allowedRoles.includes(session.user.role)) {
			return status(StatusCodes.FORBIDDEN, {
				error: 'Forbidden',
				message: 'You do not have permission to access this resource',
			});
		}

		return {
			session: {
				id: session.id,
				createdAt: session.createdAt,
				expiresAt: session.expiresAt,
			},
			user: {
				id: session.user.id,
				username: session.user.username,
				role: session.user.role,
				assignedAuditorId: session.user.assignedAuditorId,
			},
		};
	});
};
