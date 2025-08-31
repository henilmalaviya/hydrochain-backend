import { CreditRetireRequestStatus, UserRole } from '@/generated/prisma';
import {
	getHolderByCreditId,
	retireCredit,
} from '@/lib/blockchain/hydrogenCreditContract';
import { logger } from '@/lib/logger';
import { authMiddleware } from '@/middlewares/auth';
import {
	acceptRetireRequest,
	createRetireRequest,
	getRetireRequestById,
	getRetireRequestByReqId,
	getRetireRequestsAsAuditor,
	rejectRetireRequest,
} from '@/operations/request';
import { getUserByWalletAddress } from '@/operations/user';
import { Responses } from '@nexusog/golakost';
import { until } from '@open-draft/until';
import Elysia, { t } from 'elysia';
import { StatusCodes } from 'http-status-codes';

export const retireRoute = new Elysia({
	prefix: '/retire',
})
	.guard((app) =>
		app
			.use(authMiddleware([UserRole.Industry]))
			// POST /retire
			.post(
				'',
				async (ctx) => {
					const { user, status } = ctx;
					const { creditId, metadata } = ctx.body;

					// check if the credit is already expired
					const {
						data: retireRequest,
						error: getRetireRequestError,
					} = await until(() => getRetireRequestById(creditId));

					if (getRetireRequestError) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: getRetireRequestError.message,
						});
					}

					if (retireRequest) {
						return status(StatusCodes.NOT_FOUND, {
							error: true,
							message: 'Credit is already expired',
						});
					}

					const { data, error: createRetireRequestError } =
						await until(() =>
							createRetireRequest(creditId, user.id, metadata),
						);

					if (createRetireRequestError) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: 'Failed to create retire request',
						});
					}

					return status(StatusCodes.CREATED, {
						error: false,
						message: 'Retire Request Created Successfully',
						data: {
							reqId: data.id,
							metadata,
						},
					});
				},
				{
					body: t.Object({
						creditId: t.String(),
						metadata: t.Optional(t.String()),
					}),
					response: {
						[StatusCodes.CREATED]:
							Responses.ConstructSuccessResponseSchema(
								t.Object({
									reqId: t.String(),
									metadata: t.Optional(t.String()),
								}),
							),
						[StatusCodes.INTERNAL_SERVER_ERROR]:
							Responses.ErrorResponseSchema,
						[StatusCodes.NOT_FOUND]: Responses.ErrorResponseSchema,
					},
				},
			),
	)
	.guard((app) =>
		app
			.use(authMiddleware([UserRole.Auditor]))
			// POST /retire/:reqId/accept
			.post(
				'/:reqId/accept',
				async (ctx) => {
					const { user, status, params } = ctx;
					const { reqId } = params;

					// Check if the retire request exists and belongs to a user assigned to this auditor
					const {
						data: retireRequest,
						error: getRetireRequestError,
					} = await until(() => getRetireRequestByReqId(reqId));

					if (getRetireRequestError) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: getRetireRequestError.message,
						});
					}

					if (!retireRequest) {
						return status(StatusCodes.NOT_FOUND, {
							error: true,
							message: 'Retire request not found',
						});
					}

					// Check if the auditor is assigned to the user who made the request
					if (retireRequest.user.assignedAuditorId !== user.id) {
						return status(StatusCodes.FORBIDDEN, {
							error: true,
							message:
								'You are not authorized to accept this request',
						});
					}

					// Check if the request is already processed
					if (
						retireRequest.status !==
						CreditRetireRequestStatus.PENDING
					) {
						return status(StatusCodes.BAD_REQUEST, {
							error: true,
							message: `This request has already been ${retireRequest.status.toLowerCase()}`,
						});
					}

					const { data: holdingUser, error } = await until(async () =>
						getUserByWalletAddress(
							await getHolderByCreditId(retireRequest.creditId),
						),
					);

					if (error) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: error.message,
						});
					}

					if (!holdingUser) {
						return status(StatusCodes.NOT_FOUND, {
							error: true,
							message: 'Holding user not found',
						});
					}

					// 1. Perform blockchain operation - Retire the credit
					let txnHash;
					try {
						// Use the auditor's private key to retire the credit
						const txn = await retireCredit(
							retireRequest.creditId,
							holdingUser.walletPrivateKey!,
						);
						txnHash = txn.hash;
					} catch (error) {
						logger.error('Failed to retire credit on blockchain', {
							error:
								error instanceof Error
									? error.message
									: String(error),
						});
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: 'Failed to retire credit on blockchain',
							details:
								error instanceof Error
									? error.message
									: String(error),
						});
					}

					// 2. Update database after successful blockchain operation
					const { error: acceptRetireRequestError } = await until(
						() => acceptRetireRequest(user.id, reqId, txnHash),
					);

					if (acceptRetireRequestError) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message:
								'Blockchain operation was successful, but failed to update database',
							details: acceptRetireRequestError.message,
						});
					}

					return status(StatusCodes.OK, {
						error: false,
						message: 'Retire Request Accepted Successfully',
						data: {
							reqId,
							txnHash,
							status: CreditRetireRequestStatus.RETIRED,
						},
					});
				},
				{
					response: {
						[StatusCodes.OK]:
							Responses.ConstructSuccessResponseSchema(
								t.Object({
									reqId: t.String(),
									txnHash: t.String(),
									status: t.String(),
								}),
							),
						[StatusCodes.INTERNAL_SERVER_ERROR]:
							Responses.ErrorResponseSchema,
						[StatusCodes.NOT_FOUND]: Responses.ErrorResponseSchema,
						[StatusCodes.FORBIDDEN]: Responses.ErrorResponseSchema,
						[StatusCodes.BAD_REQUEST]:
							Responses.ErrorResponseSchema,
					},
				},
			)
			// POST /retire/:reqId/reject
			.post(
				'/:reqId/reject',
				async (ctx) => {
					const { user, status, params } = ctx;
					const { reqId } = params;

					// Check if the retire request exists and belongs to a user assigned to this auditor
					const {
						data: retireRequest,
						error: getRetireRequestError,
					} = await until(() => getRetireRequestByReqId(reqId));

					if (getRetireRequestError) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: getRetireRequestError.message,
						});
					}

					if (!retireRequest) {
						return status(StatusCodes.NOT_FOUND, {
							error: true,
							message: 'Retire request not found',
						});
					}

					// Check if the auditor is assigned to the user who made the request
					if (retireRequest.user.assignedAuditorId !== user.id) {
						return status(StatusCodes.FORBIDDEN, {
							error: true,
							message:
								'You are not authorized to reject this request',
						});
					}

					// Check if the request is already processed
					if (
						retireRequest.status !==
						CreditRetireRequestStatus.PENDING
					) {
						return status(StatusCodes.BAD_REQUEST, {
							error: true,
							message: `This request has already been ${retireRequest.status.toLowerCase()}`,
						});
					}

					const { error: rejectRetireRequestError } = await until(
						() => rejectRetireRequest(user.id, reqId),
					);

					if (rejectRetireRequestError) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: 'Failed to reject retire request',
							details: rejectRetireRequestError.message,
						});
					}

					return status(StatusCodes.OK, {
						error: false,
						message: 'Retire Request Rejected Successfully',
						data: {
							reqId,
							status: CreditRetireRequestStatus.REJECTED,
						},
					});
				},
				{
					response: {
						[StatusCodes.OK]:
							Responses.ConstructSuccessResponseSchema(
								t.Object({
									reqId: t.String(),
									status: t.String(),
								}),
							),
						[StatusCodes.INTERNAL_SERVER_ERROR]:
							Responses.ErrorResponseSchema,
						[StatusCodes.NOT_FOUND]: Responses.ErrorResponseSchema,
						[StatusCodes.FORBIDDEN]: Responses.ErrorResponseSchema,
						[StatusCodes.BAD_REQUEST]:
							Responses.ErrorResponseSchema,
					},
				},
			),
	)
	.guard((app) =>
		app
			.use(authMiddleware([UserRole.Auditor]))
			// GET /retire
			.get(
				'',
				async (ctx) => {
					const { user, status } = ctx;

					const { data, error } = await until(() =>
						getRetireRequestsAsAuditor(user.id),
					);

					if (error) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to get retire requests: ${error.message}`,
						});
					}

					return status(StatusCodes.OK, {
						error: false,
						message: 'Retire requests retrieved successfully',
						data: data.map((req) => ({
							id: req.id,
							creditId: req.creditId,
							status: req.status,
							metadata: req.metadata,
							anomaly: req.anomaly,
						})),
					});
				},
				{
					response: {
						[StatusCodes.OK]:
							Responses.ConstructSuccessResponseSchema(
								t.Array(
									t.Object({
										id: t.String(),
										creditId: t.String(),
										status: t.Enum(
											CreditRetireRequestStatus,
										),
										metadata: t.Nullable(t.String()),
										anomaly: t.Boolean(),
									}),
								),
							),
						[StatusCodes.INTERNAL_SERVER_ERROR]:
							Responses.ErrorResponseSchema,
					},
				},
			),
	);
