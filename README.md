# Milestora
### Trustless Milestone-Based Freelance Payment Escrow on Stellar

---

## 📖 Overview

Milestora addresses the critical challenge of trust in the digital freelance economy. In traditional freelance arrangements, clients risk paying for incomplete or low-quality work, while freelancers risk non-payment after dedicating time and resources to a project. Milestora solves this friction by utilizing decentralized, milestone-based smart contracts built on Stellar's Soroban platform. 

By locking project funds in a secure, decentralized escrow contract, clients demonstrate financial commitment upfront. Freelancers can verify that the funds are secured on-chain before commencing work. The locked capital is released progressively as milestones are completed, reviewed, and approved. A dedicated arbiter role ensures fair dispute resolution, protecting both parties.

Designed for freelancers, independent contractors, small agencies, and clients, Milestora combines the security and transparency of decentralized finance with a user-friendly, responsive interface. It offers a smooth onboarding experience that hides the complexities of Web3 transactions behind standard user flows, ensuring accessibility for non-technical users.

---

## 🌐 Live Demo

*   **Live Web Application**: [stellar-escrowlevel4.vercel.app](https://stellar-escrowlevel4.vercel.app/)
*   **Video Demonstration**: [Watch Live Demo](https://photos.app.goo.gl/MueLR7CbmcvuxBYw9) *(Walkthrough of key user flows)*
*   **Feedback Form**: [Google Form](https://docs.google.com/forms/d/1xb0aJr41nswQKE2uGVBkFKH-Kk-LDmxpWu7fJFKcPsk/edit)
*   **Feedback Responses**: [Google Sheet](https://docs.google.com/spreadsheets/d/1a1hteCruPwECHnf65SVssua9sjn3yVcZJF29mvdL3Uo/edit?usp=sharing)

---

## ✨ Key Features

*   **Multi-Wallet Connection**: Seamless connection to the Stellar network using Freighter, Rabe, or other supported wallets via `StellarWalletsKit`.
*   **Decentralized Project Creation**: Clients can initialize a project with multiple, distinct milestones (specifying amount, description, and deadline) directly on-chain.
*   **On-Chain Escrow Funding**: Security of funds achieved by locking the required XLM into the escrow contract per milestone.
*   **State-Driven Milestone Flow**: Comprehensive step-by-step workflow covering milestone creation, funding, submission, approval, and dispute resolution.
*   **Arbiter Dispute Flagging**: Ability to flag milestones in dispute, locking funds until resolved by a designated arbiter address.
*   **Real-Time Status Dashboard**: Status updates showing current milestone progress, balances, and next actions.
*   **Mobile-Responsive Design**: Clean and responsive UI layout designed for a great user experience on both mobile and desktop screens.
*   **Error Monitoring & Analytics**: Integration of Sentry for tracking runtime errors and custom event tracking to measure engagement and success rates.
*   **Integrated Feedback System**: Built-in feedback form capturing ratings and reviews to assess user satisfaction.

---

## 🏗️ Architecture

The system comprises a frontend React client, a rust-based Soroban contract, a backend telemetry and feedback server, and integration with third-party monitoring/analytics platforms.

### System Diagram

```mermaid
graph TD
    subgraph Frontend Client
        React["React / TypeScript Frontend"]
        SWK["StellarWalletsKit"]
        React --> SWK
    end

    subgraph Stellar Blockchain
        RPC["Soroban RPC"]
        Contract["Escrow Contract (Rust)"]
        Testnet["Stellar Testnet Ledger"]
        SWK -->|Submit Tx| RPC
        RPC -->|Invoke Functions| Contract
        Contract -->|State Changes| Testnet
    end

    subgraph External Infrastructure
        Sentry["Sentry (Error Monitoring)"]
        Analytics["PostHog"]
        Backend["Express + SQLite Backend"]
        DB["SQLite Database"]
        
        React -->|Capture Errors| Sentry
        React -->|Log Usage Events| Analytics
        React -->|Submit Feedback| Backend
        Backend -->|Write Stats| DB
    end
```

### Milestone State Machine

Milestone progress is governed by a finite state machine enforced by the smart contract:

```mermaid
stateDiagram-v2
    [*] --> Created : client.create_project()
    Created --> Funded : client.fund_milestone()
    Funded --> Submitted : freelancer.submit_milestone()
    Submitted --> Approved : client.approve_milestone()
    Submitted --> Disputed : client/freelancer.dispute_milestone()
    
    Disputed --> Released : arbiter.resolve_dispute(Release)
    Disputed --> Refunded : arbiter.resolve_dispute(Refund)
    
    Created --> Refunded : client.refund_milestone() (unfunded & expired)
    Funded --> Refunded : freelancer.refund_milestone() (voluntary cancel)
    
    Approved --> [*]
    Released --> [*]
    Refunded --> [*]
```

*   **Created**: Milestone metadata is saved on-chain but no funds are committed.
*   **Funded**: The client deposits and locks XLM into the contract. It is now safe for the freelancer to work.
*   **Submitted**: Freelancer uploads deliverables and marks the milestone as complete.
*   **Approved**: Client accepts deliverables and releases funds to the freelancer's wallet address.
*   **Disputed**: Funds are locked because of a performance conflict, awaiting arbitration.
*   **Refunded**: Funds are returned to the client (due to voluntary cancellation by the freelancer, expiry of an unfunded milestone, or arbiter resolution).

---

## 🛠️ Tech Stack

| Layer | Technology / Tool Used | Purpose |
|---|---|---|
| **Frontend** | React, Vite, TypeScript, Tailwind CSS | UI Structure, Styling, and State Logic |
| **Smart Contract** | Soroban SDK, Rust | Trustless Escrow and State Management |
| **Wallet Integration** | `@creit.tech/stellar-wallets-kit`, `@stellar/stellar-sdk` | Wallet Connectivity & Transaction Construction |
| **Analytics** | PostHog | Tracking User Engagement Events |
| **Monitoring** | Sentry | Real-time Error Detection & Performance Tracking |
| **Backend (Feedback)** | Express.js, Node.js | Aggregating Feedback Telemetry & Sentiment Reviews |
| **Database** | SQLite | Storage of User Ratings & Comments |
| **Deployment** | Vercel / Netlify | Hosting the Frontend Web Client |

---

## 📜 Smart Contract Details

*   **Network**: Stellar Testnet
*   **Deployed Contract Address**: `CDWWX7MKME6763VSAE35BJNF3OR7357BYUYHCRXGX2CRRJZKO2WXPBQM`
*   **Stellar Expert Link**: [View Contract on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDWWX7MKME6763VSAE35BJNF3OR7357BYUYHCRXGX2CRRJZKO2WXPBQM)

### Contract Interface Functions

*   `create_project(client: Address, freelancer: Address, arbiter: Address, milestones: Vec<MilestoneInput>) -> u64`
    *   Initializes a project with a list of milestone inputs and returns a unique Project ID.
*   `fund_milestone(project_id: u64, milestone_idx: u32, client: Address)`
    *   Locks the milestone amount in XLM from the client's wallet into the escrow contract.
*   `submit_milestone(project_id: u64, milestone_idx: u32, freelancer: Address)`
    *   Updates the milestone status to `Submitted`, indicating the work is ready for client approval.
*   `approve_milestone(project_id: u64, milestone_idx: u32, client: Address)`
    *   Releases the locked XLM for the milestone, transferring it directly to the freelancer's address.
*   `dispute_milestone(project_id: u64, milestone_idx: u32, caller: Address)`
    *   Flags the milestone as disputed, locking the funds until resolved.
*   `resolve_dispute(project_id: u64, milestone_idx: u32, arbiter: Address, resolve_to_client: bool)`
    *   Called by the arbiter to release locked funds to either the client (refund) or freelancer (release).
*   `refund_milestone(project_id: u64, milestone_idx: u32, caller: Address)`
    *   Performs refunds for expired unfunded milestones or voluntary freelancer cancellations.
*   `get_project(project_id: u64) -> Project`
    *   Retrieves project details, addresses, and overall configuration.
*   `get_milestones(project_id: u64) -> Vec<Milestone>`
    *   Returns the list of all milestones and their current states for a given project.

### Storage Optimization Choices
Milestora utilizes a hybrid storage architecture in Soroban to optimize storage fees and prevent state expiration:
* **Instance Storage** is used to store core configuration metadata (such as the native asset contract ID) that is queried frequently by the contract and occupies minimal state space.
* **Persistent Storage** is used for project details and milestone states (`Project`, `Milestone`), ensuring that this long-term state remains permanently on the ledger and does not expire while funds are locked in active escrows.

---

## 🏃 Getting Started & Local Setup

### Prerequisites

*   **Node.js**: v18.0.0 or higher
*   **Rust Toolchain**: `cargo` with `wasm32-unknown-unknown` target configured
*   **Stellar CLI**: Installed and accessible in your shell environment path
*   **Browser Wallet**: Freighter Browser Extension (configured for Stellar Testnet)
*   **Test Account**: A funded Stellar Testnet wallet account (can be funded via Friendbot)

### Local Setup Instructions

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/shwetasharma44044-eng/SMilestora.git
    cd SMilestora
    ```

2.  **Configure Environment Variables**:
    Create a `.env` file in the `frontend` folder:
    ```env
    VITE_CONTRACT_ID=CDWWX7MKME6763VSAE35BJNF3OR7357BYUYHCRXGX2CRRJZKO2WXPBQM
    VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
    VITE_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
    VITE_POSTHOG_TOKEN=[YOUR_POSTHOG_TOKEN]
    VITE_SENTRY_DSN=[YOUR_SENTRY_DSN]
    VITE_FEEDBACK_BACKEND_URL=http://localhost:5000/api
    ```

3.  **Install & Start Backend Server**:
    ```bash
    cd backend
    npm install
    npm start
    ```
    *The feedback backend service runs on `http://localhost:5000`.*

4.  **Install & Run Frontend Client**:
    ```bash
    cd ../frontend
    npm install
    npm run dev
    ```
    *Open `http://localhost:5173` in your browser.*

### Build & Deploy Smart Contract (Optional)

If you want to build and deploy the contract yourself:

1.  **Build the Contract WASM**:
    ```bash
    cd contracts/escrow_contract
    stellar contract build
    ```
2.  **Deploy to Stellar Testnet**:
    ```bash
    stellar contract deploy \
      --wasm target/wasm32-unknown-unknown/release/escrow_contract.wasm \
      --source-account my-stellar-identity \
      --network testnet
    ```
3.  **Initialize the Contract**:
    ```bash
    stellar contract invoke \
      --id CDWWX7MKME6763VSAE35BJNF3OR7357BYUYHCRXGX2CRRJZKO2WXPBQM \
      --source-account my-stellar-identity \
      --network testnet \
      -- \
      initialize \
      --native_sac CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
    ```

---

## 💡 How to Use

### Client Workflow
1.  **Connect Wallet**: Click "Connect Wallet" on the top right and approve connection in Freighter.
2.  **Create Project**: Click "Create Project". Enter the Freelancer's address, the Arbiter's address, and define the milestones. Submit the transaction and sign with Freighter.
3.  **Fund Milestone**: Locate the newly created project. Under the milestone list, click **"Fund Milestone"** and sign the deposit transaction.
4.  **Review & Approve**: Once the freelancer submits their work, click **"Approve & Release"** to dispatch the escrowed funds to the freelancer's wallet.
5.  **Initiate Dispute**: If the work is incomplete or incorrect, click **"Dispute Milestone"** to lock the funds and escalate to the Arbiter.

### Freelancer Workflow
1.  **Connect Wallet**: Log in using your Stellar public key.
2.  **View Assignments**: Check the Freelancer tab to view all projects assigned to your wallet address.
3.  **Track Funding**: Ensure the milestone status displays **"Funded"** before starting tasks.
4.  **Submit Milestone**: Once completed, click **"Submit Work"** and sign the signature payload. Your client will be notified to review.

---

## 📸 Screenshots

### Desktop UI - Dashboard Overview
![alt text](image.png)

### Desktop UI - Create Project Flow
![alt text](image-1.png)

### Mobile Responsive Interface
![alt text](image-2.png)

### CI/CD Workflow
![alt text](image-3.png)

---

## ⛓️ Proof of Real User Interactions

Below is the verification of actual interactions executed on the Stellar Testnet:

| # | Wallet Address (Shortened) | Action Performed | Transaction Hash | Stellar Explorer Link |
|---|---|---|---|---|
| 1 | `[Placeholder]` | `[Action]` | `[Hash]` | `[Link]` |

---

## 📈 User Feedback Summary

*   **Google Feedback Form**: [Link Placeholder]
*   **Google Feedback Sheet**: [Link Placeholder]

User feedback is currently being collected from onboarded testers for the August cohort.

**Key Positive Themes:**
*   [Placeholder: Add theme]

**Areas for Improvement:**
*   [Placeholder: Add theme]

---

## 📊 Monitoring & Analytics

### Event Telemetry
We use **PostHog** to monitor operations, track metrics, and evaluate DApp usability. The following custom actions are tracked:
*   `wallet_connected`: Triggered when users connect Freighter.
*   `project_created`: Logs successful on-chain project creation.
*   `milestone_funded`: Emitted when clients lock funds.
*   `milestone_submitted`: Captured when freelancers present deliverables.
*   `milestone_approved`: Dispatched when funds are released.
*   `milestone_disputed`: Sent when a dispute is opened.

These statistics can be analyzed in real-time in the **PostHog** dashboard to understand contract execution rates, user demographics, and dashboard load times.

### Error Tracking & Stability
We have integrated **Sentry** to capture client-side runtime errors. Sentry logs:
*   Rejected browser signature requests.
*   Network disconnection warnings or RPC failure timeouts.
*   Validation errors in project configurations.

This logging allows us to maintain a highly stable client interface and resolve client-side exceptions proactively.

---

## 🧪 Testing

### Smart Contract Tests
Smart contract logic is tested using Rust's built-in cargo testing framework.
To run tests:
```bash
cargo test --manifest-path contracts/escrow_contract/Cargo.toml --target-dir target_test -j 1
```
These tests cover:
*   Milestone state transitions (Created $\rightarrow$ Funded $\rightarrow$ Submitted $\rightarrow$ Approved).
*   Enforcement of client-only permissions for funding and approvals.
*   Dispute arbitration flows and correct token disbursement.
*   Prevention of double-funding or double-release.

### Frontend Application Tests
Unit and integration tests for frontend React utilities and services are configured.
To run frontend tests:
```bash
cd frontend
npm test
```
These tests verify:
*   Correct formatting of XLM amounts to Stroops.
*   Validation check logic for milestones (deadlines in the future, positive amounts).
*   Proper rendering of the dashboard lists based on mock state variables.

---

## 📂 Project Structure

```text
SMilestora/
├── .github/
│   └── workflows/              # GitHub Actions CI/CD workflows
├── backend/
│   ├── db/                     # SQLite database schema and instance
│   ├── server.js               # Express API backend for feedback
│   └── package.json
├── contracts/
│   └── escrow_contract/
│       ├── Cargo.toml          # Smart contract dependencies configuration
│       └── src/
│           ├── lib.rs          # Main contract entrypoint
│           └── test.rs         # Soroban contract testing suite
├── docs/                       # Technical documentations and spec sheets
├── frontend/
│   ├── public/                 # Static assets
│   ├── src/
│   │   ├── assets/             # Images, icons, and branding
│   │   ├── components/         # Reusable UI component blocks (optional/placeholders)
│   │   ├── hooks/              # Custom React hooks (optional/placeholders)
│   │   ├── services/
│   │   │   ├── analyticsService.ts # Event logging implementation
│   │   │   ├── contractService.ts  # SDK contract interaction wrappers
│   │   │   └── feedbackService.ts  # Feedback submission interface
│   │   ├── types/              # TypeScript types and definitions
│   │   ├── App.css             # Main styling
│   │   ├── App.tsx             # Primary dashboard application
│   │   ├── index.css           # Global layout & utility styling
│   │   └── main.tsx            # React entrypoint
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── README.md                   # Project overview and setup guides
└── TRANSACTIONS_PROOF.md       # On-chain testnet simulation documentation
```

---

## 🗺️ Roadmap

*   **Phase 1 (MVP - Level 4 Green Belt)**: Soroban core contract deployment, React client dashboard integration, telemetry logging, and local feedback loop.
*   **Phase 2 (Anchor Integration)**: Integration of Stellar Anchors (SEP-24) to support credit card and fiat currency deposits and withdrawals, converting directly to XLM or stablecoins inside the escrow contract.
*   **Phase 3 (Decentralized Disputes)**: Multi-signature and multi-arbitrator consensus engine to resolve disputes without a single point of failure.
*   **Phase 4 (Mainnet Launch)**: Security audits, optimization of gas/fees, and deployment of Milestora on the Stellar Mainnet.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.

---

## 📬 Contact Details

*   **GitHub Profile**: [shwetasharma44044-eng](https://github.com/shwetasharma44044-eng)
*   **Repository Link**: [Milestora-level4](https://github.com/shwetasharma44044-eng/Milestora-level4)
*   **Email**: shwetasharma44044@gmail.com
