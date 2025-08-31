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

function detectCreditIssueAnomaly(metadata?: string): boolean {
	if (!metadata) return false;

	try {
		const parsed = JSON.parse(metadata);

		if (!parsed) return true;

		if (parsed?.hydrogenProduced <= 0) {
			return true;
		}

		if (
			['solar', 'wind', 'hydro'].includes(parsed.renewableSource) ===
			false
		) {
			return true;
		}

		if (parsed.purity < 95) {
			return true;
		}

		if (parsed.electricityConsumed <= 0) {
			return true;
		}
	} catch (error) {
		return true;
	}

	return false;
}

function detectCreditBuyAnomaly(metadata?: string): boolean {
	if (!metadata) return false;

	try {
		const parsed = JSON.parse(metadata);

		if (!parsed) return true;

		if (parsed.hydrogenTransferred <= 0) {
			return true;
		}

		// convert 09:00 time to minutes
		const convertTimeToMinutes = (time: string) => {
			const [hours, minutes] = time.split(':').map(Number);
			return hours * 60 + minutes;
		};

		if (
			convertTimeToMinutes(parsed.transferStart) >=
			convertTimeToMinutes(parsed.transferEnd)
		) {
			return true;
		}

		if (['Pipeline', 'Tanker'].includes(parsed.transferMethod) === false) {
			return true;
		}

		if (parsed.flowRate <= 0 || parsed.pressure <= 0) {
			return true;
		}
	} catch (error) {
		return true;
	}

	return false;
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
	const anomaly = detectCreditIssueAnomaly(metadata);

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
			anomaly,
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
export async function createCreditBuyRequest(
	toId: string,
	creditId: string,
	metadata?: string,
) {
	const anomaly = detectCreditBuyAnomaly(metadata);

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
			anomaly,
			metadata,
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
		db.user.update({
			where: {
				id: buyRequest.toId,
			},
			data: {
				lifeTimeBoughtCredits: {
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

function detectRetireAnomaly(metadata?: string): boolean {
	if (!metadata) return false;

	try {
		const parsed = JSON.parse(metadata);

		if (parsed.hydrogenConsumed <= 0) {
			return true;
		}

		if (
			['Solar', 'Wind', 'Hydro'].includes(parsed.energySource) === false
		) {
			return true;
		}
	} catch {
		return false;
	}

	return false;
}

export async function createRetireRequest(
	creditId: string,
	userId: string,
	metadata?: string,
) {
	const anomaly = detectRetireAnomaly(metadata);

	return db.creditRetireRequest.create({
		data: {
			creditId: creditId,
			user: {
				connect: {
					id: userId,
				},
			},
			metadata,
			anomaly,
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

export async function getRetireRequestByReqId(reqId: string) {
	return db.creditRetireRequest.findUnique({
		where: {
			id: reqId,
		},
		include: {
			user: true,
			actionBy: true,
		},
	});
}

export async function acceptRetireRequest(
	auditorId: string,
	reqId: string,
	txnHash: string,
) {
	// Get the retire request to access the associated credit and user
	const retireRequest = await db.creditRetireRequest.findUnique({
		where: {
			id: reqId,
		},
		include: {
			user: true,
		},
	});

	if (!retireRequest) {
		throw new Error('Retire request not found');
	}

	// Find the credit issue request to get the amount
	const creditRequest = await db.creditIssueRequest.findUnique({
		where: {
			id: retireRequest.creditId,
		},
	});

	if (!creditRequest) {
		throw new Error('Credit not found');
	}

	// Update the CreditRetireRequest in the database with RETIRED status
	return db.$transaction([
		db.creditRetireRequest.update({
			where: {
				id: reqId,
			},
			data: {
				status: 'RETIRED',
				txnHash: txnHash,
				actionBy: {
					connect: {
						id: auditorId,
					},
				},
			},
		}),
		db.user.update({
			where: {
				id: retireRequest.userId,
			},
			data: {
				lifeTimeRetiredCredits: {
					increment: creditRequest.amount,
				},
			},
		}),
	]);
}

export async function rejectRetireRequest(auditorId: string, reqId: string) {
	// Get the retire request to verify it exists
	const retireRequest = await db.creditRetireRequest.findUnique({
		where: {
			id: reqId,
		},
	});

	if (!retireRequest) {
		throw new Error('Retire request not found');
	}

	// Update the CreditRetireRequest in the database with REJECTED status
	return db.creditRetireRequest.update({
		where: {
			id: reqId,
		},
		data: {
			status: 'REJECTED',
			actionBy: {
				connect: {
					id: auditorId,
				},
			},
		},
	});
}

export async function getCreditIssueRequestsAsAuditor(userId: string) {
	return db.creditIssueRequest.findMany({
		where: {
			user: {
				assignedAuditor: {
					id: userId,
				},
			},
		},
		include: {
			user: true,
		},
		orderBy: {
			createdAt: 'desc',
		},
	});
}

export async function getCreditBuyRequestsAsAuditor(userId: string) {
	return db.creditBuyRequest.findMany({
		where: {
			from: {
				assignedAuditor: {
					id: userId,
				},
			},
		},
		include: {
			from: true,
			to: true,
		},
	});
}

export async function getRetireRequestsAsAuditor(userId: string) {
	return db.creditRetireRequest.findMany({
		where: {
			user: {
				assignedAuditor: {
					id: userId,
				},
			},
		},
		include: {
			user: true,
		},
		orderBy: {
			createdAt: 'desc',
		},
	});
}
