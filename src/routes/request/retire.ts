import { UserRole } from '@/generated/prisma';
import { authMiddleware } from '@/middlewares/auth';
import {
	createRetireRequest,
	getRetireRequestById,
} from '@/operations/request';
import { Responses } from '@nexusog/golakost';
import { until } from '@open-draft/until';
import Elysia, { t } from 'elysia';
import { StatusCodes } from 'http-status-codes';

export const retireRoute = new Elysia({
	prefix: '/retire',
}).guard((app) =>
	app
		.use(authMiddleware([UserRole.Industry]))
		// POST /retire
		.post(
			'',
			async (ctx) => {
				const { user, status } = ctx;
				const { creditId } = ctx.body;

				// check if the credit is already expired
				const { data: retireRequest, error: getRetireRequestError } =
					await until(() => getRetireRequestById(creditId));

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

				const { data, error: createRetireRequestError } = await until(
					() => createRetireRequest(creditId, user.id),
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
					[StatusCodes.NOT_FOUND]: Responses.ErrorResponseSchema,
				},
			},
		),
);
