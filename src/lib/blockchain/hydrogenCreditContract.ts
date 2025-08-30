import { ethers } from 'ethers';
import fs from 'fs';
import { env } from '../env';

const abi = JSON.parse(
	fs.readFileSync(
		'./contracts/HydrogenCredit_sol_HydrogenCredit.abi',
		'utf8',
	),
);

const provider = new ethers.JsonRpcProvider(env.ETHER_PROVIDER_URL);

export class HydrogenCreditBlockchainService {
	private contract: ethers.Contract;
	private wallet: ethers.Wallet;

	constructor() {
		// Initialize wallet with issuer's private key
		this.wallet = new ethers.Wallet(
			env.PRIMARY_ETH_ACCOUNT_PRIVATE_KEY,
			provider,
		);
		// Initialize contract instance with wallet signer
		this.contract = new ethers.Contract(
			env.CONTRACT_ADDRESS,
			abi,
			this.wallet,
		);
	}

	async issueCredit(creditId: string, holder: string, amount: number) {
		const txn = await this.contract.issueCredit(creditId, holder, amount);
		await txn.wait();
		return txn;
	}

	async transferCredit(creditId: string, to: string) {
		const txn = await this.contract.transferCredit(creditId, to);
		await txn.wait();
		return txn;
	}

	async retireCredit(creditId: string) {
		const txn = await this.contract.retireCredit(creditId);
		await txn.wait();
		return txn;
	}

	async getCredit(creditId: string): Promise<any> {
		return await this.contract.getCredit(creditId);
	}

	async getAllCredits(): Promise<any[]> {
		return await this.contract.getAllCredits();
	}

	async getUserTransactions(walletAddress: string): Promise<{
		credits: {
			id: string;
			amount: number;
			timestamp: string;
			retired: boolean;
			issuer: string;
		}[];
		totalAmount: number;
		activeAmount: number;
		retiredAmount: number;
	}> {
		// Get all credits
		const allCredits = await this.getAllCredits();

		// Filter credits related to the user (either as holder or past holder)
		const userCredits = allCredits.filter((credit) => {
			return credit.holder.toLowerCase() === walletAddress.toLowerCase();
		});

		// Calculate total amount
		let activeAmount = 0;
		let retiredAmount = 0;

		const formattedCredits = userCredits.map((credit) => {
			const amount = Number(credit.amount);

			if (credit.retired) {
				retiredAmount += amount;
			} else {
				activeAmount += amount;
			}

			return {
				id: credit.id,
				amount: amount,
				timestamp: String(credit.timestamp),
				retired: credit.retired,
				issuer: credit.issuer,
			};
		});

		const totalAmount = activeAmount + retiredAmount;

		return {
			credits: formattedCredits,
			totalAmount,
			activeAmount,
			retiredAmount,
		};
	}
}

export async function issueCreditOnBlockchain(
	creditId: string,
	toAddress: string,
	amount: number,
) {
	// Holder is the user who created the request
	// Create service instance
	const service = new HydrogenCreditBlockchainService();
	// Issue credit from issuer to holder
	return await service.issueCredit(creditId, toAddress, amount);
}

export async function getUserBlockchainTransactions(walletAddress: string) {
	const service = new HydrogenCreditBlockchainService();
	return await service.getUserTransactions(walletAddress);
}
