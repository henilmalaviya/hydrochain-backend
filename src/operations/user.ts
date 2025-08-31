import db from '@/lib/db';
import { UserRole } from '@/generated/prisma';

/**
 * Gets a user by ID with their details
 * @param userId - The ID of the user
 * @returns The user details
 */
export async function getUserById(userId: string) {
	return db.user.findUnique({
		where: {
			id: userId,
		},
		select: {
			id: true,
			username: true,
			role: true,
			companyName: true,
			walletAddress: true,
			assignedAuditor: {
				select: {
					id: true,
					username: true,
				},
			},
		},
	});
}

/**
 * Gets a user's blockchain transactions and credit information
 * @param userId - The ID of the user
 * @returns The user's transaction history and credit information
 */
export async function getUserTransactions(username: string) {
	// Get user details
	const user = await db.user.findUnique({
		where: {
			username: username,
		},
		select: {
			id: true,
			username: true,
			role: true,
			companyName: true,
			walletAddress: true,
			lifeTimeGeneratedCredits: true,
			lifeTimeTransferredCredits: true,
			lifeTimeRetiredCredits: true,
			lifeTimeBoughtCredits: true,
		},
	});

	if (!user) {
		throw new Error('User not found');
	}

	// Check if user is Plant or Industry
	if (user.role !== UserRole.Plant && user.role !== UserRole.Industry) {
		throw new Error(
			'Only Plant or Industry users can view their transactions',
		);
	}

	// Get credit issue requests from the database with actionBy details
	const creditIssueRequests = await db.creditIssueRequest.findMany({
		where: {
			userId: user.id,
		},
		include: {
			actionBy: {
				select: {
					id: true,
					username: true,
					role: true,
				},
			},
		},
		orderBy: {
			createdAt: 'desc',
		},
	});

	// Get retired credit requests to exclude from active credits
	const retiredCreditRequests = await db.creditRetireRequest.findMany({
		where: {
			status: 'RETIRED',
		},
	});

	// Create a set of retired credit IDs for quick lookup
	const retiredCreditIds = new Set(
		retiredCreditRequests.map((req) => req.creditId),
	);

	// Get credit buy requests where user is sender (fromId - Plant)
	const outgoingCreditTransfers = await db.creditBuyRequest.findMany({
		where: {
			fromId: user.id,
			status: 'TRANSFERRED', // Only consider completed transfers
		},
		include: {
			to: {
				select: {
					id: true,
					username: true,
					role: true,
					companyName: true,
				},
			},
		},
		orderBy: {
			createdAt: 'desc',
		},
	});

	// Get credit buy requests where user is receiver (toId - Industry)
	const incomingCreditTransfers = await db.creditBuyRequest.findMany({
		where: {
			toId: user.id,
			status: 'TRANSFERRED', // Only consider completed transfers
		},
		include: {
			from: {
				select: {
					id: true,
					username: true,
					role: true,
					companyName: true,
				},
			},
		},
		orderBy: {
			createdAt: 'desc',
		},
	});

	// Get all credit IDs from transfers for lookup
	const transferCreditIds = [
		...incomingCreditTransfers.map((transfer) => transfer.creditId),
		...outgoingCreditTransfers.map((transfer) => transfer.creditId),
	];

	// Fetch all credit information for transfers
	const transferCredits =
		transferCreditIds.length > 0
			? await db.creditIssueRequest.findMany({
					where: {
						id: {
							in: transferCreditIds,
						},
					},
			  })
			: [];

	// Map of credit IDs to their amounts
	const creditAmounts = new Map();

	// Fill the map with issued credits
	for (const request of creditIssueRequests) {
		creditAmounts.set(request.id, request.amount);
	}

	// Add transfer credits to the map
	for (const credit of transferCredits) {
		creditAmounts.set(credit.id, credit.amount);
	}

	// Calculate credit summary
	let totalAmount = 0;
	let activeAmount = 0;
	let pendingAmount = 0;
	let retiredAmount = 0;

	if (user.role === UserRole.Plant) {
		// For Plant users - Track which credits have been transferred
		const transferredCreditIds = outgoingCreditTransfers.map(
			(t) => t.creditId,
		);

		// Calculate active and pending credits
		for (const request of creditIssueRequests) {
			const isTransferred = transferredCreditIds.includes(request.id);
			const isRetired = retiredCreditIds.has(request.id);

			if (request.status === 'ISSUED') {
				if (isRetired) {
					retiredAmount += request.amount;
					// Retired credits are still part of total but not active
					totalAmount += request.amount;
				} else if (!isTransferred) {
					// Only include non-transferred and non-retired credits in the active count
					activeAmount += request.amount;
					totalAmount += request.amount;
				}
			} else if (request.status === 'PENDING') {
				pendingAmount += request.amount;
				totalAmount += request.amount;
			}
			// Rejected credits are not counted
		}
	} else if (user.role === UserRole.Industry) {
		// For Industry users - only count credits received via transfers
		for (const transfer of incomingCreditTransfers) {
			// Get the credit details using the creditId
			const credit = transferCredits.find(
				(c) => c.id === transfer.creditId,
			);

			if (credit && credit.amount > 0) {
				const isRetired = retiredCreditIds.has(credit.id);

				if (isRetired) {
					retiredAmount += credit.amount;
				} else {
					activeAmount += credit.amount;
				}

				totalAmount += credit.amount;
			}
		}
	}

	// Combine all transactions for display
	let transactions = [];

	// Add issue requests
	transactions = creditIssueRequests.map((request) => {
		return {
			id: request.id,
			amount: request.amount,
			issuedAt: request.createdAt.toISOString(),
			status: request.status, // PENDING, ISSUED, REJECTED
			issuer: request.actionBy ? request.actionBy.username : undefined,
			txnHash: request.txnHash || undefined,
			type: 'ISSUE',
			anomaly: request.anomaly || false,
		};
	});

	// Add outgoing transfers (for Plant users)
	const outgoingTransactions = outgoingCreditTransfers.map((transfer) => {
		// Get the amount from the creditAmounts map
		const amount = creditAmounts.get(transfer.creditId) || 0;
		return {
			id: transfer.id,
			amount: amount,
			issuedAt: transfer.createdAt.toISOString(),
			status: 'TRANSFERRED',
			recipient: transfer.to.username,
			txnHash: transfer.txnHash || undefined,
			type: 'TRANSFER_OUT',
			anomaly: transfer.anomaly || false,
		};
	});

	// Add incoming transfers (for Industry users)
	const incomingTransactions = incomingCreditTransfers.map((transfer) => {
		// Get the amount from the creditAmounts map
		const amount = creditAmounts.get(transfer.creditId) || 0;
		return {
			id: transfer.id,
			amount: amount,
			issuedAt: transfer.createdAt.toISOString(),
			status: 'TRANSFERRED',
			sender: transfer.from.username,
			txnHash: transfer.txnHash || undefined,
			type: 'TRANSFER_IN',
			anomaly: transfer.anomaly || false,
		};
	});

	// Combine and sort all transactions by date (newest first)
	transactions = [
		...transactions,
		...outgoingTransactions,
		...incomingTransactions,
	]
		.filter((transaction) => {
			// Filter out any transaction with zero amount - this fixes display issues
			// Also ensure we don't show issued credits that have been transferred
			// (unless they're in the transaction history)
			if (transaction.amount <= 0) {
				return false;
			}

			// For plant users, if an ISSUE transaction has been transferred,
			// we need to identify which credits have been transferred
			if (
				user.role === UserRole.Plant &&
				transaction.type === 'ISSUE' &&
				transaction.status === 'ISSUED'
			) {
				const isTransferred = outgoingCreditTransfers.some(
					(transfer) => transfer.creditId === transaction.id,
				);

				// If transferred, update the status to reflect this
				if (isTransferred) {
					transaction.status = 'TRANSFERRED_ISSUED';
				}
			}

			return true;
		})
		.sort((a, b) => {
			return (
				new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
			);
		});

	// Function to get active credits the user currently holds
	function getActiveCredits() {
		let activeCredits: { id: string; amount: number }[] = [];

		if (user && user.role === UserRole.Plant) {
			// For Plant users - include all issued credits that haven't been transferred
			const transferredCreditIds = outgoingCreditTransfers.map(
				(t) => t.creditId,
			);

			activeCredits = creditIssueRequests
				.filter(
					(req) =>
						req.status === 'ISSUED' &&
						!transferredCreditIds.includes(req.id) &&
						!retiredCreditIds.has(req.id), // Exclude retired credits
				)
				.map((req) => ({
					id: req.id,
					amount: req.amount,
				}));
		} else if (user && user.role === UserRole.Industry) {
			// For Industry users - include credits received via transfers that haven't been retired
			activeCredits = incomingCreditTransfers
				.map((transfer) => {
					const credit = transferCredits.find(
						(c) => c.id === transfer.creditId,
					);
					if (credit && !retiredCreditIds.has(credit.id)) {
						// Exclude retired credits
						return {
							id: credit.id,
							amount: credit.amount,
						};
					}
					return null;
				})
				.filter(
					(credit): credit is { id: string; amount: number } =>
						credit !== null,
				);
		}

		return activeCredits;
	}

	return {
		user: {
			id: user.id,
			username: user.username,
			role: user.role,
			companyName: user.companyName || undefined,
			walletAddress: user.walletAddress!,
		},
		creditSummary: {
			totalAmount,
			activeAmount,
			pendingAmount,
			retiredAmount,
			lifeTimeGeneratedCredits:
				user.role === UserRole.Plant
					? user.lifeTimeGeneratedCredits
					: undefined,
			lifeTimeTransferredCredits:
				user.role === UserRole.Plant
					? user.lifeTimeTransferredCredits
					: undefined,
			lifeTimeRetiredCredits:
				user.role === UserRole.Industry
					? user.lifeTimeRetiredCredits
					: undefined,
			lifeTimeBoughtCredits:
				user.role === UserRole.Industry
					? user.lifeTimeBoughtCredits
					: undefined,
		},
		credits: getActiveCredits(),
		transactions,
	};
}

export async function getUserByWalletAddress(walletAddress: string) {
	return db.user.findUnique({
		where: {
			walletAddress: walletAddress,
		},
	});
}
