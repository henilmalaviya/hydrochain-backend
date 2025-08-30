import { UserRole } from '@/generated/prisma';
import { executeTransaction } from '@/lib/blockchain/hydrogenCreditContract';
import { authMiddleware } from '@/middlewares/auth';
import {
	acceptCreditBuyRequest,
	createCreditBuyRequest,
	getCreditBuyRequestById,
	rejectCreditBuyRequest,
} from '@/operations/request';
import { Responses } from '@nexusog/golakost';
import { until } from '@open-draft/until';
import Elysia, { t } from 'elysia';
import { StatusCodes } from 'http-status-codes';

export const buyRoutes = new Elysia({
	prefix: '/buy',
})
	.guard((app) =>
		app
			.use(authMiddleware([UserRole.Industry]))
			// POST /buy
			.post(
				'',
				async (ctx) => {
					const { user, status, body } = ctx;

					const { data, error } = await until(() =>
						createCreditBuyRequest(user.id, body.creditId),
					);

					if (error) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to create credit issue request: ${error.message}`,
						});
					}

					return status(StatusCodes.CREATED, {
						error: false,
						message: 'Credit issue request created successfully',
						data: {
							reqId: data.id,
						},
					});
				},
				{
					body: t.Object({
						creditId: t.String(),
					}),
					response: {
						[StatusCodes.CREATED]:
							Responses.ConstructSuccessResponseSchema(
								t.Object({
									reqId: t.String(),
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
			.use(authMiddleware([UserRole.Plant]))
			.post(
				'/:reqId/accept',
				async (ctx) => {
					const { user, status, params } = ctx;

					// check if the request is valid
					const { data: request, error: requestError } = await until(
						() => getCreditBuyRequestById(params.reqId),
					);

					if (requestError || !request) {
						return status(StatusCodes.NOT_FOUND, {
							error: true,
							message: 'Credit buy request not found',
						});
					}

					if (request.status !== 'PENDING') {
						return status(StatusCodes.FORBIDDEN, {
							error: true,
							message: 'Credit buy request is not pending',
						});
					}

					if (request.fromId !== user.id) {
						return status(StatusCodes.FORBIDDEN, {
							error: true,
							message:
								'You are not authorized to accept this request',
						});
					}

					// do blockchain transaction
					const { data: txData, error: txError } = await until(() =>
						executeTransaction(
							request.creditId,
							user.walletAddress!,
							user.walletPrivateKey!,
						),
					);

					if (txError) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to execute blockchain transaction: ${txError.message}`,
						});
					}

					const { data, error } = await until(() =>
						acceptCreditBuyRequest(params.reqId, txData.hash),
					);

					if (error) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to accept credit buy request: ${error.message}`,
						});
					}

					return status(StatusCodes.OK, {
						error: false,
						message: 'Credit buy request accepted successfully',
						data: {
							reqId: data[0].id,
							creditId: data[0].creditId,
							txnHash: txData.hash,
						},
					});
				},
				{
					params: t.Object({
						reqId: t.String(),
					}),
					response: {
						[StatusCodes.OK]:
							Responses.ConstructSuccessResponseSchema(
								t.Object({
									reqId: t.String(),
									creditId: t.String(),
									txnHash: t.String(),
								}),
							),
						[StatusCodes.INTERNAL_SERVER_ERROR]:
							Responses.ErrorResponseSchema,
						[StatusCodes.FORBIDDEN]: Responses.ErrorResponseSchema,
						[StatusCodes.NOT_FOUND]: Responses.ErrorResponseSchema,
					},
				},
			)
			.post(
				'/:reqId/reject',
				async (ctx) => {
					const { user, status, params } = ctx;

					// check if the request is valid
					const { data: request, error: requestError } = await until(
						() => getCreditBuyRequestById(params.reqId),
					);

					if (requestError || !request) {
						return status(StatusCodes.NOT_FOUND, {
							error: true,
							message: 'Credit buy request not found',
						});
					}

					if (request.status !== 'PENDING') {
						return status(StatusCodes.FORBIDDEN, {
							error: true,
							message: 'Credit buy request is not pending',
						});
					}

					if (request.fromId !== user.id) {
						return status(StatusCodes.FORBIDDEN, {
							error: true,
							message:
								'You are not authorized to reject this request',
						});
					}

					const { data, error } = await until(() =>
						rejectCreditBuyRequest(params.reqId),
					);

					if (error) {
						return status(StatusCodes.INTERNAL_SERVER_ERROR, {
							error: true,
							message: `Failed to reject credit buy request: ${error.message}`,
						});
					}

					return status(StatusCodes.OK, {
						error: false,
						message: 'Credit buy request rejected successfully',
						data: {
							reqId: data.id,
							creditId: data.creditId,
						},
					});
				},
				{
					params: t.Object({
						reqId: t.String(),
					}),
					response: {
						[StatusCodes.OK]:
							Responses.ConstructSuccessResponseSchema(
								t.Object({
									reqId: t.String(),
									creditId: t.String(),
								}),
							),
						[StatusCodes.INTERNAL_SERVER_ERROR]:
							Responses.ErrorResponseSchema,
						[StatusCodes.FORBIDDEN]: Responses.ErrorResponseSchema,
						[StatusCodes.NOT_FOUND]: Responses.ErrorResponseSchema,
					},
				},
			),
	);
