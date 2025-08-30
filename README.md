# HydroChain Backend

A blockchain-based backend service for managing hydrogen credits using Ethereum smart contracts and a RESTful API.

## Overview

HydroChain Backend is a platform that enables:

-   Issuing of hydrogen credits by renewable energy plants
-   Trading of credits between entities
-   Retirement of credits by industries
-   Auditing of transactions by authorized auditors

The system uses a Solidity smart contract for the blockchain component and a Bun/Elysia.js backend with PostgreSQL database.

## Prerequisites

-   [Bun](https://bun.sh/) >= 1.0.0
-   [PostgreSQL](https://www.postgresql.org/) >= 15.0
-   [Solc](https://docs.soliditylang.org/en/v0.8.0/installing-solidity.html) (Solidity Compiler)
-   Ethereum provider (like [Infura](https://www.infura.io/), [Alchemy](https://www.alchemy.com/), or a local node)

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3000
TRAFFIC_LOG=true
LOG_LEVEL=1
ORIGIN=http://localhost:3000
FRONTEND_ORIGINS=http://localhost:3000,http://localhost:5173

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/hydrochain

# Authentication
SESSION_COOKIE_NAME=sid

# Blockchain
PRIMARY_ETH_ACCOUNT_PRIVATE_KEY=your_ethereum_private_key
ETHER_PROVIDER_URL=https://eth-sepolia.g.alchemy.com/v2/your_api_key
CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000  # Will be updated after deployment
```

## Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/henilmalaviya/hydrochain-backend.git
    cd hydrochain-backend
    ```

2. Install dependencies:

    ```bash
    bun install
    ```

3. Setup the database:

    ```bash
    bunx prisma migrate deploy
    ```

4. Compile the smart contract:
    ```bash
    cd contracts
    bunx solc --bin --abi HydrogenCredit.sol
    cd ..
    ```

## Deploying the Smart Contract

1. Deploy the smart contract to your chosen Ethereum network:

    ```bash
    bun run scripts/deployContracts.ts
    ```

2. Update the `CONTRACT_ADDRESS` in your `.env` file with the deployed contract address printed in the console.

## Running the Application

### Development Mode

```bash
bun run dev
```

### Production Mode

```bash
bun run start
```

## API Routes

The API provides endpoints for:

-   `/users` - User management
-   `/me` - Current user information
-   `/request/issue` - Issue hydrogen credits
-   `/request/buy` - Buy/transfer hydrogen credits
-   `/request` - General request operations

## Database Schema

The application uses Prisma with PostgreSQL and includes the following models:

-   User (Plant, Industry, Auditor roles)
-   Session
-   CreditIssueRequest
-   CreditBuyRequest
-   CreditRetireRequest

## Smart Contract

The `HydrogenCredit.sol` contract provides functions for:

-   Issuing new credits
-   Transferring credits between addresses
-   Retiring credits
-   Querying credit information

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a pull request

## License

[MIT License](LICENSE)
