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

	if (user.role === UserRole.Plant) {
		// For Plant users - Track which credits have been transferred
		const transferredCreditIds = outgoingCreditTransfers.map(
			(t) => t.creditId,
		);

		// Calculate active and pending credits
		for (const request of creditIssueRequests) {
			const isTransferred = transferredCreditIds.includes(request.id);

			if (request.status === 'ISSUED') {
				// Only include non-transferred credits in the active count
				if (!isTransferred) {
					activeAmount += request.amount;
					totalAmount += request.amount; // Only add to total if still owned
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
				activeAmount += credit.amount;
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
			lifeTimeGeneratedCredits:
				user.role === UserRole.Plant
					? user.lifeTimeGeneratedCredits
					: undefined,
			lifeTimeTransferredCredits:
				user.role === UserRole.Plant
					? user.lifeTimeTransferredCredits
					: undefined,
		},
		transactions,
	};
}
