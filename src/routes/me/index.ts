import { UserRole } from '@/generated/prisma';
import { authMiddleware } from '@/middlewares/auth';
import { getUserById } from '@/operations/user';
import { Responses } from '@nexusog/golakost';
import { until } from '@open-draft/until';
import Elysia, { t } from 'elysia';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/lib/logger';

export const meRoutes = new Elysia({
	prefix: '/me',
	tags: ['users'],
}).guard((app) =>
	app
		.use(authMiddleware())
		// GET /me - Get current user info
		.get(
			'',
			async (ctx) => {
				const { user } = ctx;

				logger.info(`Fetching user info for: ${user.username}`);

				const { data: userData, error } = await until(() =>
					getUserById(user.id),
				);

				if (error || !userData) {
					logger.error(
						`Failed to fetch user info: ${
							error?.message || 'User not found'
						}`,
						{
							userId: user.id,
							username: user.username,
						},
					);

					return ctx.status(StatusCodes.INTERNAL_SERVER_ERROR, {
						error: true,
						message: `Failed to fetch user info: ${
							error?.message || 'User not found'
						}`,
					});
				}

				// Construct response based on user role
				const userInfo = {
					username: userData.username,
					role: userData.role,
					companyName:
						userData.role === UserRole.Plant ||
						userData.role === UserRole.Industry
							? userData.companyName || undefined
							: undefined,
				};

				logger.success(
					`Successfully retrieved user info for: ${user.username}`,
				);

				return ctx.status(StatusCodes.OK, {
					error: false,
					message: 'User info retrieved successfully',
					data: userInfo,
				});
			},
			{
				response: {
					[StatusCodes.OK]: Responses.ConstructSuccessResponseSchema(
						t.Object({
							username: t.String(),
							role: t.String(),
							companyName: t.Optional(t.String()),
						}),
					),
					[StatusCodes.INTERNAL_SERVER_ERROR]:
						Responses.ErrorResponseSchema,
				},
			},
		),
);
