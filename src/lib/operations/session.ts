import db from '@/lib/db';
import moment from 'moment';

export function createSession(userId: string, expiresAt?: Date) {
	return db.session.create({
		data: {
			user: {
				connect: {
					id: userId,
				},
			},
			expiresAt: expiresAt ?? moment().add(30, 'days').toDate(),
		},
	});
}

export function getSession(sessionId: string) {
	return db.session.findUnique({
		where: {
			id: sessionId,
		},
	});
}
