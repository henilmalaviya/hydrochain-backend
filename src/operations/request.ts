import db from '@/lib/db';
import {
	CreditBuyRequestStatus,
	CreditIssueRequestStatus,
	User,
} from '@/generated/prisma';

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

export async function getCreditBuyRequestById(buyRequestId: string) {
	return db.creditBuyRequest.findUnique({
		where: {
			id: buyRequestId,
		},
		include: {
			from: true,
			to: true,
		},
	});
}

/**
 * Creates a credit issue request for a user with the specified amount.
 * @param userId - The ID of the user requesting the credit issue.
 * @param amount - The amount of credits to issue.
 * @returns The created request object.
 */
export async function createCreditIssueRequest(
	userId: string,
	amount: number,
	metadata?: string,
) {
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
			metadata,
		},
	});
}

export async function acceptCreditIssueRequest(
	userId: string,
	creditId: string,
	txnHash: string,
) {
	// Get the credit issue request to access the amount and the requesting user's ID
	const creditRequest = await db.creditIssueRequest.findUnique({
		where: {
			id: creditId,
		},
	});

	if (!creditRequest) {
		throw new Error('Credit issue request not found');
	}

	// You may want to validate the userId and creditId here
	// Example: update the CreditIssueRequest in the database and increase lifeTimeGeneratedCredits
	return db.$transaction([
		db.creditIssueRequest.update({
			where: {
				id: creditId,
			},
			data: {
				status: CreditIssueRequestStatus.ISSUED,
				txnHash: txnHash, // Store transaction hash
				actionBy: {
					connect: {
						id: userId,
					},
				},
			},
		}),
		db.user.update({
			where: {
				id: creditRequest.userId,
			},
			data: {
				lifeTimeGeneratedCredits: {
					increment: creditRequest.amount,
				},
			},
		}),
	]);
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

/**
 * Creates a credit buy request from an industry to a plant
 * @param toId - The ID of the industry user buying the credit
 * @param creditId - The ID of the credit to be transferred
 * @returns The created buy request object
 */
export async function createCreditBuyRequest(toId: string, creditId: string) {
	// Verify that the credit exists, is ISSUED, and hasn't already been transferred
	const creditRequest = await db.creditIssueRequest.findFirst({
		where: {
			id: creditId,
			status: CreditIssueRequestStatus.ISSUED,
		},
		include: {
			user: true,
		},
	});

	if (!creditRequest) {
		throw new Error('Credit issue request not found or not issued');
	}

	// Check if this credit is already involved in a completed transfer
	const existingTransfer = await db.creditBuyRequest.findFirst({
		where: {
			creditId,
			status: CreditBuyRequestStatus.TRANSFERRED,
		},
	});

	if (existingTransfer) {
		throw new Error('This credit has already been transferred');
	}

	return db.creditBuyRequest.create({
		data: {
			from: {
				connect: {
					id: creditRequest.user.id, // Connect to the plant user who issued the credit
				},
			},
			to: {
				connect: {
					id: toId, // Connect to the industry user who is buying
				},
			},
			creditId,
		},
	});
}

export async function acceptCreditBuyRequest(
	buyRequestId: string,
	txnHash: string,
) {
	// Get the buy request to update including the credit ID
	const buyRequest = await db.creditBuyRequest.findUnique({
		where: {
			id: buyRequestId,
		},
	});

	if (!buyRequest) {
		throw new Error('Credit buy request not found');
	}

	const credit = await db.creditIssueRequest.findUnique({
		where: {
			id: buyRequest.creditId,
		},
	});

	if (!credit) {
		throw new Error('Credit not found');
	}

	// Update the CreditBuyRequest in the database with TRANSFERRED status
	return db.$transaction([
		db.creditBuyRequest.update({
			where: {
				id: buyRequestId,
			},
			data: {
				status: CreditBuyRequestStatus.TRANSFERRED,
				txnHash: txnHash, // Store transaction hash
			},
		}),
		db.user.update({
			where: {
				id: buyRequest.fromId,
			},
			data: {
				lifeTimeTransferredCredits: {
					increment: credit.amount,
				},
			},
		}),
	]);
}

export async function rejectCreditBuyRequest(buyRequestId: string) {
	// Update the CreditBuyRequest in the database with REJECTED status
	return db.creditBuyRequest.update({
		where: {
			id: buyRequestId,
		},
		data: {
			status: CreditBuyRequestStatus.REJECTED,
		},
	});
}

export async function createRetireRequest(creditId: string, userId: string) {
	return db.creditRetireRequest.create({
		data: {
			creditId: creditId,
			user: {
				connect: {
					id: userId,
				},
			},
		},
	});
}

export async function getRetireRequestById(creditId: string) {
	return db.creditRetireRequest.findUnique({
		where: {
			creditId: creditId,
		},
		include: {
			user: true,
		},
	});
}

export async function getPendingCreditIssueRequests(userId: string) {
	return db.creditIssueRequest.findMany({
		where: {
			user: {
				assignedAuditor: {
					id: userId,
				},
			},
			status: CreditIssueRequestStatus.PENDING,
		},
		include: {
			user: true,
		},
	});
}
