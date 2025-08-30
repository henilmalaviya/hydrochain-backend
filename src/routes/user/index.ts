import { CreditIssueRequestStatus, UserRole } from '@/generated/prisma';
import { authMiddleware } from '@/middlewares/auth';
import { getUserById, getUserTransactions } from '@/operations/user';
import { Responses } from '@nexusog/golakost';
import { until } from '@open-draft/until';
import Elysia, { t } from 'elysia';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/lib/logger';

export const userRoutes = new Elysia({
	prefix: '/user',
	tags: ['users'],
}).guard((app) =>
	app
		.use(authMiddleware())
		// GET /user/:username - Get user transaction history
		.get(
			'/:username',
			async (ctx) => {
				const { username } = ctx.params;
				const { user, status } = ctx;

				logger.info(
					`Fetching transaction history for user: ${username}`,
				);

				// Check if user is accessing their own data or is an Auditor
				if (
					user.username !== username &&
					user.role !== UserRole.Auditor
				) {
					logger.warn(
						`Unauthorized access attempt: ${user.username} tried to access ${username}'s transaction history`,
					);
					return status(StatusCodes.FORBIDDEN, {
						error: true,
						message:
							'You can only access your own transaction history',
					});
				}

				const { data, error } = await until(() =>
					getUserTransactions(username),
				);

				if (error) {
					logger.error(
						`Failed to fetch transaction history: ${error.message}`,
						{
							username,
							requesterId: user.id,
						},
					);

					return status(StatusCodes.INTERNAL_SERVER_ERROR, {
						error: true,
						message: `Failed to fetch transaction history: ${error.message}`,
					});
				}

				logger.success(
					`Successfully retrieved transaction history for user: ${username}`,
				);

				return status(StatusCodes.OK, {
					error: false,
					message: 'Transaction history retrieved successfully',
					data,
				});
			},
			{
				params: t.Object({
					username: t.String(),
				}),
				response: {
					[StatusCodes.OK]: Responses.ConstructSuccessResponseSchema(
						t.Object({
							user: t.Object({
								id: t.String(),
								username: t.String(),
								role: t.String(),
								companyName: t.Optional(t.String()),
								walletAddress: t.String(),
							}),
							creditSummary: t.Object({
								totalAmount: t.Number(),
								activeAmount: t.Number(),
								pendingAmount: t.Number(),
							}),
							transactions: t.Array(
								t.Object({
									id: t.String(),
									amount: t.Number(), // Keeping as number as requested
									issuedAt: t.String(), // Using ISO string format
									status: t.Enum(CreditIssueRequestStatus),
									issuer: t.Optional(t.String()),
									txnHash: t.Optional(t.String()), // Adding txnHash
								}),
							),
						}),
					),
					[StatusCodes.FORBIDDEN]: Responses.ErrorResponseSchema,
					[StatusCodes.INTERNAL_SERVER_ERROR]:
						Responses.ErrorResponseSchema,
				},
			},
		),
);
