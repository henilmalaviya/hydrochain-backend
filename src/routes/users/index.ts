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
import { UserRole } from '@/generated/prisma';

export const usersRoutes = new Elysia({
	prefix: '/users',
	tags: ['users'],
})
	// POST /users - Register a new user
	.post(
		'',
		async (ctx) => {
			const { body, cookie, status } = ctx;

			// Check if username already exists
			const { data: existingUser, error: findUserError } = await until(
				() => findUserByUsername(body.username),
			);

			if (findUserError) {
				return status(StatusCodes.INTERNAL_SERVER_ERROR, {
					error: true,
					message: `Failed to check existing user: ${findUserError.message}`,
				});
			}

			if (existingUser) {
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
			};

			// Only add renewableEnergyProofId for Plant users
			if (
				body.role === UserRole.Plant &&
				'renewableEnergyProofId' in body
			) {
				createUserData.renewableEnergyProofId =
					body.renewableEnergyProofId;
			}

			const { data: result, error: createUserError } = await until(() =>
				createUser(createUserData),
			);

			if (createUserError) {
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

			// Authenticate user
			const { data: user, error: authError } = await until(() =>
				authenticateUser(params.username, body.password),
			);

			if (authError) {
				return status(StatusCodes.INTERNAL_SERVER_ERROR, {
					error: true,
					message: `Authentication failed: ${authError.message}`,
				});
			}

			if (!user) {
				return status(StatusCodes.UNAUTHORIZED, {
					error: true,
					message: 'Invalid username or password',
				});
			}

			// Create session
			const { data: session, error: sessionError } = await until(() =>
				createSession(user.id),
			);

			if (sessionError) {
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
						}),
					}),
				),
				[StatusCodes.UNAUTHORIZED]: Responses.ErrorResponseSchema,
				[StatusCodes.INTERNAL_SERVER_ERROR]:
					Responses.ErrorResponseSchema,
			},
		},
	);
