import Elysia, { t } from 'elysia';
import { UserRegistrationSchema, UserLoginSchema } from '@/schemas/user';
import {
	createUser,
	authenticateUser,
	findUserByUsername,
} from '@/lib/operations/user';
import { createSession } from '@/lib/operations/session';
import { env, isProd } from '@/lib/env';
import { StatusCodes } from 'http-status-codes';
import { defaultCookieOptions } from '@/lib/utils/cookies';
import { Responses } from '@nexusog/golakost';
import { until } from '@open-draft/until';
import { CreditIssueRequestStatus, UserRole } from '@/generated/prisma';
import { logger } from '@/lib/logger';
import { authMiddleware } from '@/middlewares/auth';
import { getUserTransactions } from '@/operations/user';

export const usersRoutes = new Elysia({
	prefix: '/users',
	tags: ['users'],
})
	// POST /users - Register a new user
	.post(
		'',
		async (ctx) => {
			const { body, cookie, status } = ctx;

			logger.info(
				`Registration attempt for user: ${body.username} with role: ${body.role}`,
			);

			// Check if username already exists
			const { data: existingUser, error: findUserError } = await until(
				() => findUserByUsername(body.username),
			);

			if (findUserError) {
				logger.error(
					`Failed to check existing user: ${findUserError.message}`,
					{ username: body.username },
				);
				return status(StatusCodes.INTERNAL_SERVER_ERROR, {
					error: true,
					message: `Failed to check existing user: ${findUserError.message}`,
				});
			}

			if (existingUser) {
				logger.warn(
					`Registration failed - username already exists: ${body.username}`,
				);
				return status(StatusCodes.CONFLICT, {
					error: true,
					message: 'Username already exists',
				});
			}

			// Create user with wallet generation for Plant/Industry
			const createUserData: any = {
				username: body.username,
				password: body.password,
				role: body.role,
				companyName:
					'companyName' in body ? body.companyName : undefined,
				governmentLicenseId:
					'governmentLicenseId' in body
						? body.governmentLicenseId
						: undefined,
				auditorUsername:
					'auditorUsername' in body
						? body.auditorUsername
						: undefined,
				did: body.did,
			};

			const { data: result, error: createUserError } = await until(() =>
				createUser(createUserData),
			);

			if (createUserError) {
				logger.error(
					`User creation failed: ${createUserError.message}`,
					{
						username: body.username,
						role: body.role,
					},
				);
				return status(StatusCodes.INTERNAL_SERVER_ERROR, {
					error: true,
					message: `Failed to create user: ${createUserError.message}`,
				});
			}

			// Create session for the new user
			const { data: session, error: sessionError } = await until(() =>
				createSession(result.user.id),
			);

			if (sessionError) {
				logger.error(
					`Session creation failed: ${sessionError.message}`,
					{
						userId: result.user.id,
						username: body.username,
					},
				);
				return status(StatusCodes.INTERNAL_SERVER_ERROR, {
					error: true,
					message: `Failed to create session: ${sessionError.message}`,
				});
			}

			// Set session cookie
			cookie[env.SESSION_COOKIE_NAME].set({
				...defaultCookieOptions,
				value: session.id,
				expires: session.expiresAt,
			});

			logger.success(
				`User registration completed successfully: ${body.username} (${result.user.id})`,
			);

			return status(StatusCodes.CREATED, {
				error: false,
				message: 'User created successfully',
				data: {
					user: {
						id: result.user.id,
						username: result.user.username,
						role: result.user.role,
						companyName: result.user.companyName ?? undefined,
						walletAddress: result.user.walletAddress ?? '',
						walletFunded: result.walletFunded ?? false,
						did: (result.user as any).did ?? '',
						assignedAuditor: result.user.assignedAuditor
							? {
									username:
										result.user.assignedAuditor.username,
							  }
							: undefined,
					},
				},
			});
		},
		{
			body: UserRegistrationSchema,
			response: {
				[StatusCodes.CREATED]: Responses.ConstructSuccessResponseSchema(
					t.Object({
						user: t.Object({
							id: t.String(),
							username: t.String(),
							role: t.String(),
							companyName: t.Optional(t.String()),
							walletAddress: t.String(),
							walletFunded: t.Boolean(),
							did: t.String(),
							assignedAuditor: t.Optional(
								t.Object({
									username: t.String(),
								}),
							),
						}),
					}),
				),
				[StatusCodes.CONFLICT]: Responses.ErrorResponseSchema,
				[StatusCodes.INTERNAL_SERVER_ERROR]:
					Responses.ErrorResponseSchema,
			},
		},
	)
	// POST /users/:username/login - Login user
	.post(
		'/:username/login',
		async (ctx) => {
			const { params, body, cookie, status } = ctx;

			logger.info(`Login attempt for user: ${params.username}`);

			// Authenticate user with DID
			const { data: user, error: authError } = await until(() =>
				authenticateUser(params.username, body.password, body.did),
			);

			if (authError) {
				logger.error(`Authentication error: ${authError.message}`, {
					username: params.username,
				});
				return status(StatusCodes.INTERNAL_SERVER_ERROR, {
					error: true,
					message: `Authentication failed: ${authError.message}`,
				});
			}

			if (!user) {
				logger.warn(
					`Login failed - invalid credentials for user: ${params.username}`,
				);
				return status(StatusCodes.UNAUTHORIZED, {
					error: true,
					message:
						'Invalid username, password, or DID (for Plant/Industry users)',
				});
			}

			// Create session
			const { data: session, error: sessionError } = await until(() =>
				createSession(user.id),
			);

			if (sessionError) {
				logger.error(
					`Session creation failed during login: ${sessionError.message}`,
					{
						userId: user.id,
						username: params.username,
					},
				);
				return status(StatusCodes.INTERNAL_SERVER_ERROR, {
					error: true,
					message: `Failed to create session: ${sessionError.message}`,
				});
			}

			// Set session cookie
			cookie[env.SESSION_COOKIE_NAME].set({
				...defaultCookieOptions,
				value: session.id,
				expires: session.expiresAt,
			});

			logger.success(
				`Login successful for user: ${params.username} (${user.id})`,
			);

			// Type assertion to access the did property
			const userWithDid = user as any;

			return status(StatusCodes.OK, {
				error: false,
				message: 'Login successful',
				data: {
					user: {
						id: user.id,
						username: user.username,
						role: user.role,
						companyName: user.companyName ?? undefined,
						walletAddress: user.walletAddress ?? '',
						did: userWithDid.did ?? '',
					},
				},
			});
		},
		{
			body: UserLoginSchema,
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
							did: t.String(),
						}),
					}),
				),
				[StatusCodes.UNAUTHORIZED]: Responses.ErrorResponseSchema,
				[StatusCodes.INTERNAL_SERVER_ERROR]:
					Responses.ErrorResponseSchema,
			},
		},
	)
	.guard((app) =>
		app.use(authMiddleware()).get(
			'/:username',
			async (ctx) => {
				const { username } = ctx.params;
				const { user, status } = ctx;

				logger.info(
					`Fetching transaction history for user: ${username}`,
				);

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
								retiredAmount: t.Number(),
								lifeTimeGeneratedCredits: t.Optional(
									t.Number(),
								),
								lifeTimeTransferredCredits: t.Optional(
									t.Number(),
								),
								lifeTimeRetiredCredits: t.Optional(t.Number()),
								lifeTimeBoughtCredits: t.Optional(t.Number()),
							}),
							credits: t.Array(
								t.Object({
									id: t.String(),
									amount: t.Number(),
								}),
							),
							transactions: t.Array(
								t.Object({
									id: t.String(),
									amount: t.Number(), // Keeping as number as requested
									issuedAt: t.String(), // Using ISO string format
									status: t.String(),
									issuer: t.Optional(t.String()),
									sender: t.Optional(t.String()),
									recipient: t.Optional(t.String()),
									txnHash: t.Optional(t.String()),
									type: t.String(), // ISSUE, TRANSFER_IN, TRANSFER_OUT
									anomaly: t.Boolean(),
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
