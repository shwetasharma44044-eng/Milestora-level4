import { 
  Contract, 
  rpc, 
  Address, 
  TransactionBuilder, 
  nativeToScVal, 
  scValToNative, 
  xdr, 
  BASE_FEE
} from '@stellar/stellar-sdk';
import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { trackEvent } from './analyticsService';
import * as Sentry from '@sentry/react';

// Configuration
export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || 'CDWWX7MKME6763VSAE35BJNF3OR7357BYUYHCRXGX2CRRJZKO2WXPBQM';
export const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
export const TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS || 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'; // Native XLM SAC on Testnet

export const server = new rpc.Server(RPC_URL);

console.log('--- Milestora Diagnostic Info ---');
console.log('Contract ID:', CONTRACT_ID);
console.log('Token Address:', TOKEN_ADDRESS);
console.log('RPC URL:', RPC_URL);
console.log('-------------------------------------');

// Initialize Wallets Kit as static
StellarWalletsKit.init({
  network: Networks.TESTNET,
  modules: [new FreighterModule()]
});

export interface Milestone {
  amount: number;      // raw units (e.g. stroops for XLM, where 1 XLM = 10,000,000 stroops)
  description: string;
  deadline: number;    // unix timestamp in seconds
  status: number;      // 0: Created, 1: Funded, 2: Submitted, 4: Disputed, 5: Released, 6: Refunded
}

export interface Project {
  id: number;
  client: string;
  freelancer: string;
  arbiter: string;
  token: string;
  milestones: Milestone[];
  len: number; // mapping length helper
}

// Convert milestone to ScVal ScMap
function milestoneToScVal(milestone: Omit<Milestone, 'status'>) {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('amount'),
      val: nativeToScVal(BigInt(milestone.amount), { type: 'i128' })
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('deadline'),
      val: nativeToScVal(BigInt(milestone.deadline), { type: 'u64' })
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('description'),
      val: nativeToScVal(milestone.description, { type: 'string' })
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('status'),
      val: nativeToScVal(0, { type: 'u32' })
    })
  ]);
}

// Helper to poll transaction status
async function pollTxStatus(txHash: string): Promise<rpc.Api.GetTransactionResponse> {
  let attempts = 0;
  while (attempts < 20) {
    const txResponse = await server.getTransaction(txHash);
    if (txResponse.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return txResponse;
    } else if (txResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed: ${JSON.stringify(txResponse.resultXdr)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    attempts++;
  }
  throw new Error("Transaction polling timeout.");
}

// Helper to prepare, simulate, sign, and submit a contract invocation
async function writeContract(
  userAddress: string,
  methodName: string,
  args: xdr.ScVal[]
): Promise<string> {
  try {
    const contract = new Contract(CONTRACT_ID);
    
    // Fetch user account (implements Account interface)
    const account = await server.getAccount(userAddress);
    
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE
    })
    .addOperation(contract.call(methodName, ...args))
    .setTimeout(60)
    .build();

    const simulation = await server.simulateTransaction(tx);
    
    if (rpc.Api.isSimulationSuccess(simulation)) {
      const assembledTx = rpc.assembleTransaction(tx, simulation).build();
      
      console.log('assembledTx constructor name:', assembledTx ? assembledTx.constructor.name : 'undefined');
      console.log('assembledTx methods:', assembledTx ? Object.getOwnPropertyNames(Object.getPrototypeOf(assembledTx)) : []);
      
      // Request Freighter / Wallet Kit signature using static class
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(assembledTx.toEnvelope().toXDR('base64'), {
        address: userAddress,
        networkPassphrase: NETWORK_PASSPHRASE
      });
      
      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
      const submitResponse = await server.sendTransaction(signedTx);
      
      // Check status as string directly
      if (submitResponse.status === 'PENDING') {
        await pollTxStatus(submitResponse.hash);
        trackEvent(`contract_${methodName}_success`, { user: userAddress, txHash: submitResponse.hash });
        return submitResponse.hash;
      } else {
        throw new Error(`Send transaction failed: ${JSON.stringify((submitResponse as any).errorResult || submitResponse)}`);
      }
    } else {
      throw new Error(`Simulation failed: ${simulation.error || 'Unknown error'}`);
    }
  } catch (err: any) {
    console.error(`Error in writeContract [${methodName}]:`, err);
    Sentry.captureException(err, { extra: { userAddress, methodName, args } });
    trackEvent(`contract_${methodName}_failed`, { user: userAddress, error: err.message });
    throw err;
  }
}

// Helper to simulate a read-only transaction and extract response
async function readContract(methodName: string, args: xdr.ScVal[] = []): Promise<unknown> {
  const dummyAddress = 'GC5QY4FKOMCHAT53CPKKHEXZRRPSWS6YN5CGEWI2NBITDH6NTRSCCZ72'; // Valid testnet G-address
  const contract = new Contract(CONTRACT_ID);
  
  const dummyAccount = await server.getAccount(dummyAddress);
  const tx = new TransactionBuilder(dummyAccount, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE
  })
  .addOperation(contract.call(methodName, ...args))
  .setTimeout(30)
  .build();

  const simulation = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationSuccess(simulation) && simulation.result) {
    return scValToNative(simulation.result.retval);
  }
  throw new Error(`Failed to simulate read call ${methodName}: ${JSON.stringify(simulation)}`);
}

// Read functions
export async function getProjectCount(): Promise<number> {
  try {
    const res = await readContract('get_project_count');
    return Number(res);
  } catch (err) {
    console.error('Failed to get project count:', err);
    return 0;
  }
}

export async function getProject(projectId: number): Promise<Project> {
  const scId = nativeToScVal(BigInt(projectId), { type: 'u64' });
  const rawProject = await readContract('get_project', [scId]) as any;

  // Map raw return values into clean JS object
  const milestonesList = rawProject.milestones.map((m: any) => ({
    amount: Number(m.amount),
    description: m.description,
    deadline: Number(m.deadline),
    status: Number(m.status)
  }));

  return {
    id: Number(rawProject.id),
    client: rawProject.client,
    freelancer: rawProject.freelancer,
    arbiter: rawProject.arbiter,
    token: rawProject.token,
    milestones: milestonesList,
    len: milestonesList.length
  };
}

export async function getAllProjects(): Promise<Project[]> {
  const count = await getProjectCount();
  const projects: Project[] = [];
  for (let i = 1; i <= count; i++) {
    try {
      const p = await getProject(i);
      projects.push(p);
    } catch (err) {
      console.warn(`Failed to read project ${i}:`, err);
    }
  }
  return projects;
}

// Write functions
export async function createProject(
  userAddress: string,
  freelancerAddress: string,
  arbiterAddress: string,
  milestones: Omit<Milestone, 'status'>[]
): Promise<string> {
  const clientVal = Address.fromString(userAddress).toScVal();
  const freelancerVal = Address.fromString(freelancerAddress).toScVal();
  const arbiterVal = Address.fromString(arbiterAddress || userAddress).toScVal(); // Default to client if no arbiter
  const tokenVal = Address.fromString(TOKEN_ADDRESS).toScVal();

  const milestoneVals = xdr.ScVal.scvVec(milestones.map(m => milestoneToScVal(m)));

  const txHash = await writeContract(userAddress, 'create_project', [
    clientVal,
    freelancerVal,
    arbiterVal,
    tokenVal,
    milestoneVals
  ]);
  
  trackEvent('project_created', { freelancer: freelancerAddress, milestoneCount: milestones.length });
  return txHash;
}

export async function fundMilestone(
  userAddress: string,
  projectId: number,
  milestoneIndex: number
): Promise<string> {
  const idVal = nativeToScVal(BigInt(projectId), { type: 'u64' });
  const idxVal = nativeToScVal(milestoneIndex, { type: 'u32' });

  const txHash = await writeContract(userAddress, 'fund_milestone', [
    Address.fromString(userAddress).toScVal(),
    idVal,
    idxVal
  ]);

  trackEvent('milestone_funded', { projectId, milestoneIndex });
  return txHash;
}

export async function submitMilestone(
  userAddress: string,
  projectId: number,
  milestoneIndex: number
): Promise<string> {
  const idVal = nativeToScVal(BigInt(projectId), { type: 'u64' });
  const idxVal = nativeToScVal(milestoneIndex, { type: 'u32' });

  const txHash = await writeContract(userAddress, 'submit_milestone', [
    Address.fromString(userAddress).toScVal(),
    idVal,
    idxVal
  ]);

  trackEvent('milestone_submitted', { projectId, milestoneIndex });
  return txHash;
}

export async function approveMilestone(
  userAddress: string,
  projectId: number,
  milestoneIndex: number
): Promise<string> {
  const idVal = nativeToScVal(BigInt(projectId), { type: 'u64' });
  const idxVal = nativeToScVal(milestoneIndex, { type: 'u32' });

  const txHash = await writeContract(userAddress, 'approve_milestone', [
    Address.fromString(userAddress).toScVal(),
    idVal,
    idxVal
  ]);

  trackEvent('milestone_approved', { projectId, milestoneIndex });
  return txHash;
}

export async function disputeMilestone(
  userAddress: string,
  projectId: number,
  milestoneIndex: number,
  reason: string
): Promise<string> {
  const idVal = nativeToScVal(BigInt(projectId), { type: 'u64' });
  const idxVal = nativeToScVal(milestoneIndex, { type: 'u32' });
  const reasonVal = nativeToScVal(reason, { type: 'string' });

  const txHash = await writeContract(userAddress, 'dispute_milestone', [
    Address.fromString(userAddress).toScVal(),
    idVal,
    idxVal,
    reasonVal
  ]);

  trackEvent('milestone_disputed', { projectId, milestoneIndex, reason });
  return txHash;
}

export async function resolveDispute(
  userAddress: string,
  projectId: number,
  milestoneIndex: number,
  resolveToClient: boolean
): Promise<string> {
  const idVal = nativeToScVal(BigInt(projectId), { type: 'u64' });
  const idxVal = nativeToScVal(milestoneIndex, { type: 'u32' });
  const resolveVal = nativeToScVal(resolveToClient);

  const txHash = await writeContract(userAddress, 'resolve_dispute', [
    Address.fromString(userAddress).toScVal(),
    idVal,
    idxVal,
    resolveVal
  ]);

  trackEvent('milestone_resolved', { projectId, milestoneIndex, resolveToClient });
  return txHash;
}

export async function refundMilestone(
  userAddress: string,
  projectId: number,
  milestoneIndex: number
): Promise<string> {
  const idVal = nativeToScVal(BigInt(projectId), { type: 'u64' });
  const idxVal = nativeToScVal(milestoneIndex, { type: 'u32' });

  const txHash = await writeContract(userAddress, 'refund_milestone', [
    Address.fromString(userAddress).toScVal(),
    idVal,
    idxVal
  ]);

  trackEvent('milestone_refunded', { projectId, milestoneIndex });
  return txHash;
}
