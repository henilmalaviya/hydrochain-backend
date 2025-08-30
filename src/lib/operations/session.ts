import db from '@/lib/db';
import { logger } from '@/lib/logger';

export function createSession(userId: string, expiresAt?: Date) {
	logger.debug(`Creating session for user: ${userId}`);
	// Default expiry: 30 days from now
	const defaultExpiry = new Date();
	defaultExpiry.setDate(defaultExpiry.getDate() + 30);

	const sessionData = db.session.create({
		data: {
			user: {
				connect: {
					id: userId,
				},
			},
			expiresAt: expiresAt ?? defaultExpiry,
		},
	});

	logger.info(`Session created for user: ${userId}`);
	return sessionData;
}

export function getSession(sessionId: string) {
	logger.debug(`Retrieving session: ${sessionId}`);
	return db.session.findUnique({
		where: {
			id: sessionId,
		},
		include: {
			user: true,
		},
	});
}

export function deleteSession(sessionId: string) {
	logger.info(`Deleting session: ${sessionId}`);
	return db.session.delete({
		where: {
			id: sessionId,
		},
	});
}

export function isSessionValid(session: { expiresAt: Date }): boolean {
	const isValid = new Date() < session.expiresAt;
	logger.debug(`Session validity check: ${isValid}`);
	return isValid;
}
