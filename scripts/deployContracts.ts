import { ethers } from 'ethers';
import fs from 'fs';

if (!Bun.env.PRIMARY_ETH_ACCOUNT_PRIVATE_KEY || !Bun.env.ETHER_PROVIDER_URL) {
	throw new Error('missing env');
}

// Read ABI and bytecode (adjust paths if needed)
const abi = JSON.parse(
	fs.readFileSync(
		'./contracts/HydrogenCredit_sol_HydrogenCredit.abi',
		'utf8',
	),
);
const bytecode = fs.readFileSync(
	'./contracts/HydrogenCredit_sol_HydrogenCredit.bin',
	'utf8',
);

const provider = new ethers.JsonRpcProvider(Bun.env.ETHER_PROVIDER_URL);

const wallet = new ethers.Wallet(
	Bun.env.PRIMARY_ETH_ACCOUNT_PRIVATE_KEY!,
	provider,
);

async function main() {
	const factory = new ethers.ContractFactory(abi, bytecode, wallet);

	const contract = await factory.deploy();
	await contract.waitForDeployment();

	console.log('Deployed contract address:', await contract.getAddress());
}

main().catch(console.error);
