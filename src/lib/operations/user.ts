import db from '@/lib/db';
import { env } from '@/lib/env';
import { UserRole, type User } from '@/generated/prisma';
import { Wallet, ethers } from 'ethers';

export interface CreateUserData {
	username: string;
	password: string;
	role: UserRole;
	companyName?: string;
	governmentLicenseId?: string;
	renewableEnergyProofId?: string;
}

export interface CreateUserResult {
	user: User;
	walletFunded?: boolean;
}

// Hash password using Bun's built-in password hashing
export async function hashPassword(password: string): Promise<string> {
	return await Bun.password.hash(password);
}

// Verify password
export async function verifyPassword(
	password: string,
	hash: string,
): Promise<boolean> {
	return await Bun.password.verify(password, hash);
}

// Generate Ethereum wallet
export function generateWallet(): { address: string; privateKey: string } {
	const wallet = Wallet.createRandom();
	return {
		address: wallet.address,
		privateKey: wallet.privateKey,
	};
}

// Fund wallet with ETH
export async function fundWallet(walletAddress: string): Promise<boolean> {
	try {
		// Create provider (you'll need to configure this based on your network)
		const provider = new ethers.JsonRpcProvider(env.ETHER_PROVIDER_URL); // Adjust for your network

		// Create wallet from primary account
		const primaryWallet = new ethers.Wallet(
			env.PRIMARY_ETH_ACCOUNT_PRIVATE_KEY,
			provider,
		);

		// Send 0.01 ETH to the new wallet
		const tx = await primaryWallet.sendTransaction({
			to: walletAddress,
			value: ethers.parseEther('0.01'),
		});

		// Wait for transaction confirmation
		await tx.wait();
		return true;
	} catch (error) {
		console.error('Failed to fund wallet:', error);
		return false;
	}
}

// Create user with wallet generation for Plant and Industry roles
export async function createUser(
	userData: CreateUserData,
): Promise<CreateUserResult> {
	const hashedPassword = await hashPassword(userData.password);

	let walletData: { walletAddress?: string; walletPrivateKey?: string } = {};
	let walletFunded = false;

	// Generate wallet for Plant and Industry users
	if (
		userData.role === UserRole.Plant ||
		userData.role === UserRole.Industry
	) {
		const wallet = generateWallet();
		walletData = {
			walletAddress: wallet.address,
			walletPrivateKey: wallet.privateKey,
		};

		// Fund the wallet
		walletFunded = await fundWallet(wallet.address);
	}

	const user = await db.user.create({
		data: {
			username: userData.username,
			password: hashedPassword,
			role: userData.role,
			companyName: userData.companyName,
			governmentLicenseId: userData.governmentLicenseId,
			renewableEnergyProofId: userData.renewableEnergyProofId,
			...walletData,
		},
	});

	return { user, walletFunded };
}

// Find user by username
export async function findUserByUsername(
	username: string,
): Promise<User | null> {
	return await db.user.findUnique({
		where: { username },
	});
}

// Authenticate user
export async function authenticateUser(
	username: string,
	password: string,
): Promise<User | null> {
	const user = await findUserByUsername(username);
	if (!user) return null;

	const isValid = await verifyPassword(password, user.password);
	return isValid ? user : null;
}
