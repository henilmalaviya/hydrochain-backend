import db from '@/lib/db';

export function createSession(userId: string, expiresAt?: Date) {
	// Default expiry: 30 days from now
	const defaultExpiry = new Date();
	defaultExpiry.setDate(defaultExpiry.getDate() + 30);

	return db.session.create({
		data: {
			user: {
				connect: {
					id: userId,
				},
			},
			expiresAt: expiresAt ?? defaultExpiry,
		},
	});
}

export function getSession(sessionId: string) {
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
	return db.session.delete({
		where: {
			id: sessionId,
		},
	});
}

export function isSessionValid(session: { expiresAt: Date }): boolean {
	return new Date() < session.expiresAt;
}
