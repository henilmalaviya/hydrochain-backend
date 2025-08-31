import db from '@/lib/db';
import { env } from '@/lib/env';
import { UserRole, type User } from '@/generated/prisma';
import { Wallet, ethers } from 'ethers';
import { logger } from '@/lib/logger';

export interface CreateUserData {
	username: string;
	password: string;
	role: UserRole;
	companyName?: string;
	governmentLicenseId?: string;
	renewableEnergyProofId?: string;
	auditorUsername?: string;
	did: string;
}

export interface CreateUserResult {
	user: {
		id: string;
		role: UserRole;
		username: string;
		password: string;
		did: string | null;
		companyName: string | null;
		governmentLicenseId: string | null;
		walletAddress: string | null;
		walletPrivateKey: string | null;
		assignedAuditorId: string | null;
		createdAt: Date;
		updatedAt: Date;
		assignedAuditor?: {
			id: string;
			username: string;
		} | null;
	};
	walletFunded?: boolean;
}

// Hash password using Bun's built-in password hashing
export async function hashPassword(password: string): Promise<string> {
	logger.debug('Hashing password for user registration');
	return await Bun.password.hash(password);
}

// Verify password
export async function verifyPassword(
	password: string,
	hash: string,
): Promise<boolean> {
	logger.debug('Verifying password for user authentication');
	return await Bun.password.verify(password, hash);
}

// Generate Ethereum wallet
export function generateWallet(): { address: string; privateKey: string } {
	logger.debug('Generating new Ethereum wallet');
	const wallet = Wallet.createRandom();
	logger.info(`Generated wallet address: ${wallet.address}`);
	return {
		address: wallet.address,
		privateKey: wallet.privateKey,
	};
}

// Fund wallet with ETH
export async function fundWallet(walletAddress: string): Promise<boolean> {
	logger.info(`Attempting to fund wallet: ${walletAddress}`);
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
			value: ethers.parseEther('0.001'),
		});

		// Wait for transaction confirmation
		await tx.wait();
		logger.success(`Successfully funded wallet: ${walletAddress}`);
		return true;
	} catch (error) {
		logger.error('Failed to fund wallet:', error);
		return false;
	}
}

// Create user with wallet generation for Plant and Industry roles
export async function createUser(
	userData: CreateUserData,
): Promise<CreateUserResult> {
	logger.info(
		`Creating user: ${userData.username} with role: ${userData.role}`,
	);

	const hashedPassword = await hashPassword(userData.password);

	let walletData: { walletAddress?: string; walletPrivateKey?: string } = {};
	let walletFunded = false;
	let assignedAuditorId: string | undefined;

	// For Plant and Industry users, find assigned auditor and generate wallet
	if (
		userData.role === UserRole.Plant ||
		userData.role === UserRole.Industry
	) {
		// Find the assigned auditor by username
		if (userData.auditorUsername) {
			logger.debug(`Looking for auditor: ${userData.auditorUsername}`);
			const auditor = await db.user.findUnique({
				where: {
					username: userData.auditorUsername,
					role: UserRole.Auditor,
				},
			});

			if (!auditor) {
				logger.error(`Auditor not found: ${userData.auditorUsername}`);
				throw new Error(
					`Auditor with username '${userData.auditorUsername}' not found`,
				);
			}

			assignedAuditorId = auditor.id;
			logger.info(
				`Assigned auditor: ${userData.auditorUsername} (${auditor.id})`,
			);
		}

		// Generate wallet
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
			assignedAuditorId,
			...walletData,
		},
		include: {
			assignedAuditor: {
				select: {
					id: true,
					username: true,
				},
			},
		},
	});

	logger.success(`User created successfully: ${user.username} (${user.id})`);
	return { user, walletFunded };
}

// Find user by username
export async function findUserByUsername(
	username: string,
): Promise<User | null> {
	logger.debug(`Looking up user by username: ${username}`);
	const user = await db.user.findUnique({
		where: { username },
		include: {
			assignedAuditor: {
				select: {
					id: true,
					username: true,
				},
			},
		},
	});

	if (user) {
		logger.debug(`User found: ${username} (${user.id})`);
	} else {
		logger.debug(`User not found: ${username}`);
	}

	return user;
}

// Authenticate user
export async function authenticateUser(
	username: string,
	password: string,
	did?: string,
): Promise<User | null> {
	logger.info(`Authentication attempt for user: ${username}`);

	// Get the user directly with all needed fields including did
	const user = await db.user.findUnique({
		where: { username },
		include: {
			assignedAuditor: {
				select: {
					id: true,
					username: true,
				},
			},
		},
	});

	if (!user) {
		logger.warn(`Authentication failed - user not found: ${username}`);
		return null;
	}

	// Verify password
	const isValidPassword = await verifyPassword(password, user.password);
	if (!isValidPassword) {
		logger.warn(
			`Authentication failed - invalid password for user: ${username}`,
		);
		return null;
	}

	// Type assertion to access the did property
	const userWithDid = user as any;

	if (!userWithDid.did || userWithDid.did !== did) {
		logger.warn(
			`Authentication failed - DID mismatch for user: ${username}`,
		);
		return null;
	}

	logger.info(`DID verification successful for user: ${username}`);

	logger.success(`Authentication successful for user: ${username}`);
	return user;
}
