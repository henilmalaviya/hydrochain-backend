import { UserRole } from '@/generated/prisma';
import { issueCreditOnBlockchain } from '@/lib/blockchain/hydrogenCreditContract';
import { authMiddleware } from '@/middlewares/auth';
import {
	acceptCreditIssueRequest,
	createCreditIssueRequest,
	getCreditIssueRequestById,
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
						createCreditIssueRequest(user.id, ctx.body.amount),
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
						},
					});
				},
				{
					body: t.Object({
						amount: t.Number(),
					}),
					response: {
						[StatusCodes.CREATED]:
							Responses.ConstructSuccessResponseSchema(
								t.Object({
									id: t.String(),
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
			// POST /request/issue/:creditId/accept
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
			// POST /request/issue/:creditId/reject
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
	);
