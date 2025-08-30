import Elysia from 'elysia';
import { issuesRoutes } from './issue';
import { buyRoutes } from './buy';
import { retireRoute } from './retire';

export const requestRoutes = new Elysia({
	prefix: '/request',
	tags: ['request'],
})
	.use(issuesRoutes)
	.use(buyRoutes)
	.use(retireRoute);
