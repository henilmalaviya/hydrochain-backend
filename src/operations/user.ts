import db from '@/lib/db';
import { UserRole } from '@/generated/prisma';
import { getUserBlockchainTransactions } from '@/lib/blockchain/hydrogenCreditContract';

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

	if (!user || !user.walletAddress) {
		throw new Error('User not found or user has no wallet address');
	}

	// Check if user is Plant or Industry
	if (user.role !== UserRole.Plant && user.role !== UserRole.Industry) {
		throw new Error(
			'Only Plant or Industry users can view their transactions',
		);
	}

	// Get transaction data from blockchain
	const transactionData = await getUserBlockchainTransactions(
		user.walletAddress,
	);

	return {
		user: {
			id: user.id,
			username: user.username,
			role: user.role,
			companyName: user.companyName || undefined,
			walletAddress: user.walletAddress,
		},
		creditSummary: {
			totalAmount: transactionData.totalAmount,
			activeAmount: transactionData.activeAmount,
			retiredAmount: transactionData.retiredAmount,
		},
		transactions: transactionData.credits.map((credit) => ({
			id: credit.id,
			amount: Number(credit.amount),
			issuedAt: new Date(Number(credit.timestamp) * 1000).toISOString(),
			status: credit.retired
				? 'RETIRED'
				: ('ACTIVE' as 'RETIRED' | 'ACTIVE'),
			issuer: credit.issuer,
		})),
	};
}
