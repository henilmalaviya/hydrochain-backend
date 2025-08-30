import { UserRole } from '@/generated/prisma';
import { issueCreditOnBlockchain } from '@/lib/blockchain/hydrogenCreditContract';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
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
import { issuesRoutes } from './issue';
import { buyRoutes } from './buy';

export const requestRoutes = new Elysia({
	prefix: '/request',
	tags: ['request'],
})
	.use(issuesRoutes)
	.use(buyRoutes);
