# HydroChain Backend

A blockchain-based backend service for managing hydrogen credits using Ethereum smart contracts and a RESTful API.

## Overview

HydroChain Backend is a platform that enables:

-   Issuing of hydrogen credits by renewable energy plants
-   Trading of credits between entities
-   Retirement of credits by industries
-   Auditing of transactions by authorized auditors

The system uses a Solidity smart contract for the blockchain component and a Bun/Elysia.js backend with PostgreSQL database.

## Technical Architecture

### System Components

1. **REST API Layer** - Built with Elysia.js, providing endpoints for user management and credit operations
2. **Database Layer** - PostgreSQL with Prisma ORM for data persistence
3. **Blockchain Layer** - Ethereum smart contract for immutable record-keeping and credit transactions
4. **Authentication System** - Session-based authentication with cookie management
5. **Role-Based Access Control** - Different permissions for Plant, Industry, and Auditor users

### Core Technologies

-   **Bun** - JavaScript runtime and package manager
-   **Elysia.js** - TypeScript web framework optimized for Bun
-   **Prisma** - ORM for database access and migrations
-   **Ethers.js** - Ethereum blockchain interaction library
-   **PostgreSQL** - Primary database for storing user data and transaction records

### Data Flow Architecture

```
┌──────────────┐      ┌──────────────┐      ┌───────────────┐
│              │      │              │      │               │
│   Client     │──────►   REST API   │──────►   Database    │
│  Application │◄──────│  (Elysia.js) │◄──────│   (PostgreSQL) │
│              │      │              │      │               │
└──────────────┘      └───────┬──────┘      └───────────────┘
                             │
                             │
                      ┌──────▼──────┐
                      │              │
                      │  Ethereum    │
                      │ Smart Contract│
                      │              │
                      └──────────────┘
```

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

## Database Schema Details

The application uses Prisma with PostgreSQL and includes the following models:

### User Model

```prisma
model User {
  id String @id @default(uuid())
  role UserRole
  username String @unique
  password String
  companyName String?
  governmentLicenseId String?
  did String?
  walletAddress String? @unique
  walletPrivateKey String?
  assignedAuditor User? @relation("AuditorAssignment", fields: [assignedAuditorId], references: [id])
  assignedAuditorId String?
  assignedUsers User[] @relation("AuditorAssignment")
  lifeTimeGeneratedCredits Float @default(0)
  lifeTimeTransferredCredits Float @default(0)
  lifeTimeRetiredCredits Float @default(0)
  lifeTimeBoughtCredits Float @default(0)
  // Relations
  sessions Session[]
  creditIssueRequests CreditIssueRequest[] @relation(name: "issuedPlant")
  creditIssueRequestsActions CreditIssueRequest[] @relation(name: "issueRequestAuditor")
  creditBuyRequests CreditBuyRequest[] @relation(name: "creditBuyerPlant")
  CreditBuyRequest CreditBuyRequest[] @relation(name: "creditSellingPlant")
  creditRetireRequests CreditRetireRequest[] @relation(name: "retiringIndustry")
  creditRetireRequestsActions CreditRetireRequest[] @relation(name: "retireRequestAuditor")
}
```

### Credit Request Models

The system uses three types of request models to handle the lifecycle of credits:

1. **CreditIssueRequest** - For plants to request new credit issuance
2. **CreditBuyRequest** - For industries to purchase credits from plants
3. **CreditRetireRequest** - For industries to retire credits after use

Each request goes through an approval workflow with an assigned auditor.

## Smart Contract Details

The `HydrogenCredit.sol` contract is the blockchain component that manages the immutable credit records:

```solidity
contract HydrogenCredit {
    struct Credit {
        string id;
        address issuer;
        address holder;
        uint256 amount;
        uint256 timestamp;
        bool retired;
    }

    // Core functions
    function issueCredit(string memory id, address to, uint256 amount) public {...}
    function transferCredit(string memory creditId, address to) public {...}
    function retireCredit(string memory creditId) public {...}
    function getCredit(string memory creditId) public view returns (Credit memory) {...}
    function getAllCredits() public view returns (Credit[] memory) {...}
}
```

## Core System Flows

### 1. User Registration Flow

1. Client sends registration request with username, password, role, and other details
2. System validates if username exists
3. For Plant/Industry users:
    - Generates Ethereum wallet (address and private key)
    - Links to an assigned auditor
4. Creates database record
5. Returns confirmation with session token

### 2. Credit Issuance Flow

1. Plant initiates credit issuance request with amount and metadata
2. Request is stored with PENDING status
3. Assigned auditor reviews request
4. If approved:
    - Smart contract issues credit tokens
    - Transaction hash is recorded
    - Request status changes to ISSUED
    - Plant's lifetime generated credits are updated
5. If rejected, status changes to REJECTED

### 3. Credit Transfer Flow

1. Industry submits buy request for specific credit ID
2. Request is stored with PENDING status
3. Assigned auditor reviews request
4. If approved:
    - Smart contract transfers credit ownership
    - Transaction hash is recorded
    - Request status changes to TRANSFERRED
    - Plant and industry lifetime statistics are updated
5. If rejected, status changes to REJECTED

### 4. Credit Retirement Flow

1. Industry submits retirement request for specific credit ID
2. Request is stored with PENDING status
3. Assigned auditor reviews request
4. If approved:
    - Smart contract marks credit as retired
    - Transaction hash is recorded
    - Request status changes to RETIRED
    - Industry's lifetime retired credits are updated
5. If rejected, status changes to REJECTED

## API Routes Reference

### Authentication & User Management

-   `POST /users` - Register a new user
-   `POST /users/:username/login` - User login
-   `GET /users/:username` - Get user transaction history
-   `GET /me` - Get current user info

### Credit Issuance (Plant & Auditor)

-   `POST /request/issues` - Create credit issue request
-   `GET /request/issues` - Get issue requests (for auditor)
-   `POST /request/issues/:creditId/accept` - Approve issue request
-   `POST /request/issues/:creditId/reject` - Reject issue request

### Credit Trading (Industry & Auditor)

-   `POST /request/buy` - Create credit buy request
-   `GET /request/buy` - Get buy requests (for auditor)
-   `POST /request/buy/:reqId/accept` - Approve buy request
-   `POST /request/buy/:reqId/reject` - Reject buy request

### Credit Retirement (Industry & Auditor)

-   `POST /request/retire` - Create credit retirement request
-   `GET /request/retire` - Get retirement requests (for auditor)
-   `POST /request/retire/:reqId/accept` - Approve retirement request
-   `POST /request/retire/:reqId/reject` - Reject retirement request

## Security Features

1. **Session-based authentication** - Secure session management with cookies
2. **Role-based access control** - Endpoints protected by user roles
3. **Private key management** - Secure handling of Ethereum private keys
4. **Request validation** - Comprehensive validation of all requests
5. **Anomaly detection** - Flagging of suspicious transactions

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a pull request

## License

[MIT License](LICENSE)
