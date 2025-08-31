import { CreditIssueRequestStatus, UserRole } from '@/generated/prisma';
import { issueCreditOnBlockchain } from '@/lib/blockchain/hydrogenCreditContract';
import { authMiddleware } from '@/middlewares/auth';
import {
	acceptCreditIssueRequest,
	createCreditIssueRequest,
	getCreditIssueRequestById,
	getCreditIssueRequestsAsAuditor,
	rejectCreditIssueRequest,
} from '@/operations/request';
import { Responses } from '@nexusog/golakost';
import { until } from '@open-draft/until';
import Elysia, { t } from 'elysia';
import { StatusCodes } from 'http-status-codes';

export const issuesRoutes = new Elysia({
	prefix: '/issues',
})
	.guard((app) =>
		app
			.use(authMiddleware([UserRole.Plant]))
			// POST /request/issue
			.post(
				'',
				async (ctx) => {
					const { user, status } = ctx;

					const { data, error } = await until(() =>
						createCreditIssueRequest(
							user.id,
							ctx.body.amount,
							ctx.body.metadata,
						),
					);

					if (error) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to create credit issue request: ${error.message}`,
						});
					}

					const creditId = data.id;

					return status(StatusCodes.CREATED, {
						error: false,
						message: 'Credit issue request created successfully',
						data: {
							id: creditId,
							metadata: ctx.body.metadata,
						},
					});
				},
				{
					body: t.Object({
						amount: t.Number(),
						metadata: t.Optional(t.String()),
					}),
					response: {
						[StatusCodes.CREATED]:
							Responses.ConstructSuccessResponseSchema(
								t.Object({
									id: t.String(),
									metadata: t.Optional(t.String()),
								}),
							),
						[StatusCodes.INTERNAL_SERVER_ERROR]:
							Responses.ErrorResponseSchema,
					},
				},
			),
	)
	.guard((app) =>
		app
			.use(authMiddleware([UserRole.Auditor]))
			// POST /request/issues/:creditId/accept
			.post(
				'/:creditId/accept',
				async (ctx) => {
					const { creditId } = ctx.params;
					const { status, user } = ctx;

					const {
						data: creditRequest,
						error: getCreditIssueRequestFetchError,
					} = await until(() => getCreditIssueRequestById(creditId));

					if (getCreditIssueRequestFetchError) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to get credit issue request: ${getCreditIssueRequestFetchError.message}`,
						});
					}

					if (!creditRequest) {
						return status(StatusCodes.NOT_FOUND, {
							error: true,
							message: 'Credit issue request not found',
						});
					}

					if (creditRequest.status !== 'PENDING') {
						return status(StatusCodes.BAD_REQUEST, {
							error: true,
							message: 'Credit issue request is not pending',
						});
					}

					// call blockchain to issue credits
					const { data: txn, error: issueCreditError } = await until(
						() =>
							issueCreditOnBlockchain(
								creditRequest.id,
								creditRequest.user.walletAddress!,
								creditRequest.amount,
							),
					);

					if (issueCreditError) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to issue credit: ${issueCreditError.message}`,
						});
					}

					const { error } = await until(() =>
						acceptCreditIssueRequest(user.id, creditId, txn.hash),
					);

					if (error) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to accept credit issue request: ${error.message}`,
						});
					}

					return status(StatusCodes.OK, {
						error: false,
						message: 'Credit issue request accepted successfully',
						data: {
							id: creditId,
							txnHash: txn.hash,
						},
					});
				},
				{
					body: t.Object({}),
					response: {
						[StatusCodes.OK]:
							Responses.ConstructSuccessResponseSchema(
								t.Object({
									id: t.String(),
									txnHash: t.String(),
								}),
							),
						[StatusCodes.NOT_FOUND]: Responses.ErrorResponseSchema,
						[StatusCodes.INTERNAL_SERVER_ERROR]:
							Responses.ErrorResponseSchema,
						[StatusCodes.BAD_REQUEST]:
							Responses.ErrorResponseSchema,
					},
				},
			)
			// POST /request/issues/:creditId/reject
			.post(
				'/:creditId/reject',
				async (ctx) => {
					const { creditId } = ctx.params;
					const { status, user } = ctx;

					const {
						data: creditRequest,
						error: getCreditIssueRequestFetchError,
					} = await until(() => getCreditIssueRequestById(creditId));

					if (getCreditIssueRequestFetchError) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to get credit issue request: ${getCreditIssueRequestFetchError.message}`,
						});
					}

					if (!creditRequest) {
						return status(StatusCodes.NOT_FOUND, {
							error: true,
							message: 'Credit issue request not found',
						});
					}

					if (creditRequest.status !== 'PENDING') {
						return status(StatusCodes.BAD_REQUEST, {
							error: true,
							message: 'Credit issue request is not pending',
						});
					}

					const { error } = await until(() =>
						rejectCreditIssueRequest(user.id, creditId),
					);

					if (error) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to reject credit issue request: ${error.message}`,
						});
					}

					return status(StatusCodes.OK, {
						error: false,
						message: 'Credit issue request rejected successfully',
						data: {
							id: creditId,
						},
					});
				},
				{
					body: t.Object({}),
					response: {
						[StatusCodes.OK]:
							Responses.ConstructSuccessResponseSchema(
								t.Object({
									id: t.String(),
								}),
							),
						[StatusCodes.NOT_FOUND]: Responses.ErrorResponseSchema,
						[StatusCodes.INTERNAL_SERVER_ERROR]:
							Responses.ErrorResponseSchema,
						[StatusCodes.BAD_REQUEST]:
							Responses.ErrorResponseSchema,
					},
				},
			),
	)
	.guard((app) =>
		app
			.use(authMiddleware([UserRole.Auditor]))
			// GET /request/issues
			// return all issue requests assigned related to the requester
			.get(
				'',
				async (ctx) => {
					const { user, status } = ctx;

					const { data, error } = await until(() =>
						getCreditIssueRequestsAsAuditor(user.id),
					);

					if (error) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to get pending credit issue requests: ${error.message}`,
						});
					}

					return status(StatusCodes.OK, {
						error: false,
						message:
							'Pending credit issue requests retrieved successfully',
						data: data.map((req) => ({
							// credit id it self
							id: req.id,
							user: {
								username: req.user.username,
								companyName: req.user.companyName!,
							},
							amount: req.amount,
							metadata: req.metadata?.toString(),
							status: req.status,
							txnHash: req.txnHash,
							createdAt: req.createdAt,
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
										user: t.Object({
											username: t.String(),
											companyName: t.String(),
										}),
										amount: t.Number(),
										metadata: t.Optional(t.String()),
										status: t.Enum(
											CreditIssueRequestStatus,
										),
										txnHash: t.Nullable(t.String()),
										createdAt: t.Date(),
									}),
								),
							),
						[StatusCodes.INTERNAL_SERVER_ERROR]:
							Responses.ErrorResponseSchema,
					},
				},
			),
	);
