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

	// Calculate credit summary
	let totalAmount = 0;
	let activeAmount = 0;
	let pendingAmount = 0;

	creditIssueRequests.forEach((request) => {
		totalAmount += request.amount;
		if (request.status === 'ISSUED') {
			// Issued credits are active
			activeAmount += request.amount;
		} else if (request.status === 'PENDING') {
			// Pending credits count towards total but aren't active yet
			pendingAmount += request.amount;
		}
	});

	// Format the transactions
	const transactions = creditIssueRequests.map((request) => {
		return {
			id: request.id,
			amount: request.amount,
			issuedAt: request.createdAt.toISOString(),
			status: request.status, // Already in the format we want (PENDING, ISSUED, REJECTED)
			issuer: request.actionBy ? request.actionBy.username : undefined, // Use actionBy if available, else default
			txnHash: request.txnHash || undefined,
		};
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
		},
		transactions,
	};
}
