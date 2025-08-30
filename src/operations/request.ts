import db from '@/lib/db';
import { CreditIssueRequestStatus, User } from '@/generated/prisma';

export async function getCreditIssueRequestById(creditId: string) {
	return db.creditIssueRequest.findUnique({
		where: {
			id: creditId,
		},
		include: {
			user: true,
			actionBy: true,
		},
	});
}

/**
 * Creates a credit issue request for a user with the specified amount.
 * @param userId - The ID of the user requesting the credit issue.
 * @param amount - The amount of credits to issue.
 * @returns The created request object.
 */
export async function createCreditIssueRequest(userId: string, amount: number) {
	// You may want to validate the amount and userId here
	// Example: create a new CreditIssueRequest in the database
	return db.creditIssueRequest.create({
		data: {
			user: {
				connect: {
					id: userId,
				},
			},
			amount,
		},
	});
}

export async function acceptCreditIssueRequest(
	userId: string,
	creditId: string,
) {
	// You may want to validate the userId and creditId here
	// Example: update the CreditIssueRequest in the database
	return db.creditIssueRequest.update({
		where: {
			id: creditId,
		},
		data: {
			status: CreditIssueRequestStatus.ISSUED,
			actionBy: {
				connect: {
					id: userId,
				},
			},
		},
	});
}

export async function rejectCreditIssueRequest(
	userId: string,
	creditId: string,
) {
	// Update the CreditIssueRequest in the database with REJECTED status
	return db.creditIssueRequest.update({
		where: {
			id: creditId,
		},
		data: {
			status: CreditIssueRequestStatus.REJECTED,
			actionBy: {
				connect: {
					id: userId,
				},
			},
		},
	});
}
