#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env, String, Vec};

#[cfg(test)]
mod test;

/// Represents a single milestone in the escrow agreement.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    /// The amount of tokens allocated for this milestone.
    pub amount: i128,
    /// Detailed description of the milestone deliverables.
    pub description: String,
    /// Unix timestamp in seconds representing the deadline of the milestone.
    pub deadline: u64,
    /// Status code of the milestone:
    /// - 0: Created
    /// - 1: Funded
    /// - 2: Submitted
    /// - 4: Disputed
    /// - 5: Released
    /// - 6: Refunded
    pub status: u32,
}

/// Represents the overall project escrow configuration.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Project {
    /// Unique identifier for the project.
    pub id: u64,
    /// The Address of the Client funding the project.
    pub client: Address,
    /// The Address of the Freelancer performing the work.
    pub freelancer: Address,
    /// The Address of the trusted third-party Arbiter.
    pub arbiter: Address,
    /// The token token Address (e.g. native XLM or custom token).
    pub token: Address,
    /// The list of milestones belonging to the project.
    pub milestones: Vec<Milestone>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Project(u64),
    ProjectCounter,
}

/// Error codes returned by the Escrow Contract.
#[soroban_sdk::contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    /// The requested project ID does not exist in storage.
    ProjectNotFound = 1,
    /// The requested milestone was not found in the project.
    MilestoneNotFound = 2,
    /// The action is invalid for the current status of the milestone.
    InvalidStatus = 3,
    /// The caller is not authorized to perform the action.
    Unauthorized = 4,
    /// The action cannot be performed because the deadline has not yet passed.
    DeadlineNotPassed = 5,
    /// The milestone deadline is invalid (e.g. 0).
    InvalidDeadline = 6,
    /// The milestone amount is invalid (must be greater than 0).
    InvalidAmount = 7,
    /// Client and Freelancer addresses cannot be the same.
    SameClientFreelancer = 8,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn create_project(
        env: Env,
        client: Address,
        freelancer: Address,
        arbiter: Address,
        token: Address,
        milestones: Vec<Milestone>,
    ) -> Result<u64, EscrowError> {
        if client == freelancer {
            return Err(EscrowError::SameClientFreelancer);
        }
        if milestones.is_empty() {
            return Err(EscrowError::MilestoneNotFound);
        }
        for milestone in milestones.iter() {
            if milestone.amount <= 0 {
                return Err(EscrowError::InvalidAmount);
            }
            if milestone.deadline == 0 {
                return Err(EscrowError::InvalidDeadline);
            }
        }

        let mut project_counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ProjectCounter)
            .unwrap_or(0);
        project_counter += 1;
        env.storage().instance().set(&DataKey::ProjectCounter, &project_counter);

        // Ensure status of all milestones starts as Created (0)
        let mut initialized_milestones = Vec::new(&env);
        for milestone in milestones.iter() {
            let mut m = milestone.clone();
            m.status = 0; // Force to Created
            initialized_milestones.push_back(m);
        }

        let project = Project {
            id: project_counter,
            client: client.clone(),
            freelancer: freelancer.clone(),
            arbiter: arbiter.clone(),
            token: token.clone(),
            milestones: initialized_milestones,
        };

        let key = DataKey::Project(project_counter);
        env.storage().persistent().set(&key, &project);

        env.events().publish(
            (symbol_short!("created"), project_counter),
            (client, freelancer),
        );

        Ok(project_counter)
    }

    pub fn get_project(env: Env, project_id: u64) -> Result<Project, EscrowError> {
        let key = DataKey::Project(project_id);
        if !env.storage().persistent().has(&key) {
            return Err(EscrowError::ProjectNotFound);
        }
        Ok(env.storage().persistent().get(&key).unwrap())
    }

    pub fn get_project_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ProjectCounter)
            .unwrap_or(0)
    }

    pub fn get_milestones(env: Env, project_id: u64) -> Result<Vec<Milestone>, EscrowError> {
        let project = Self::get_project(env, project_id)?;
        Ok(project.milestones)
    }

    pub fn fund_milestone(
        env: Env,
        client: Address,
        project_id: u64,
        milestone_index: u32,
    ) -> Result<(), EscrowError> {
        client.require_auth();

        let key = DataKey::Project(project_id);
        let mut project = Self::get_project(env.clone(), project_id)?;

        if client != project.client {
            return Err(EscrowError::Unauthorized);
        }

        let mut milestones = project.milestones.clone();
        if milestone_index >= milestones.len() {
            return Err(EscrowError::MilestoneNotFound);
        }

        let mut milestone = milestones.get(milestone_index).unwrap();
        if milestone.status != 0 {
            return Err(EscrowError::InvalidStatus);
        }

        // Transfer funds from client to contract
        let token_client = token::Client::new(&env, &project.token);
        token_client.transfer(&client, &env.current_contract_address(), &milestone.amount);

        milestone.status = 1; // Funded
        milestones.set(milestone_index, milestone.clone());
        project.milestones = milestones;
        env.storage().persistent().set(&key, &project);

        env.events().publish(
            (symbol_short!("funded"), project_id, milestone_index),
            milestone.amount,
        );

        Ok(())
    }

    pub fn submit_milestone(
        env: Env,
        freelancer: Address,
        project_id: u64,
        milestone_index: u32,
    ) -> Result<(), EscrowError> {
        freelancer.require_auth();

        let key = DataKey::Project(project_id);
        let mut project = Self::get_project(env.clone(), project_id)?;

        if freelancer != project.freelancer {
            return Err(EscrowError::Unauthorized);
        }

        let mut milestones = project.milestones.clone();
        if milestone_index >= milestones.len() {
            return Err(EscrowError::MilestoneNotFound);
        }

        let mut milestone = milestones.get(milestone_index).unwrap();
        if milestone.status != 1 && milestone.status != 4 {
            return Err(EscrowError::InvalidStatus);
        }

        milestone.status = 2; // Submitted
        milestones.set(milestone_index, milestone.clone());
        project.milestones = milestones;
        env.storage().persistent().set(&key, &project);

        env.events().publish(
            (symbol_short!("submited"), project_id, milestone_index),
            (),
        );

        Ok(())
    }

    pub fn approve_milestone(
        env: Env,
        client: Address,
        project_id: u64,
        milestone_index: u32,
    ) -> Result<(), EscrowError> {
        client.require_auth();

        let key = DataKey::Project(project_id);
        let mut project = Self::get_project(env.clone(), project_id)?;

        if client != project.client {
            return Err(EscrowError::Unauthorized);
        }

        let mut milestones = project.milestones.clone();
        if milestone_index >= milestones.len() {
            return Err(EscrowError::MilestoneNotFound);
        }

        let mut milestone = milestones.get(milestone_index).unwrap();
        if milestone.status != 1 && milestone.status != 2 && milestone.status != 4 {
            return Err(EscrowError::InvalidStatus);
        }

        // Release funds to freelancer
        let token_client = token::Client::new(&env, &project.token);
        token_client.transfer(&env.current_contract_address(), &project.freelancer, &milestone.amount);

        milestone.status = 5; // Released
        milestones.set(milestone_index, milestone.clone());
        project.milestones = milestones;
        env.storage().persistent().set(&key, &project);

        env.events().publish(
            (symbol_short!("approved"), project_id, milestone_index),
            (),
        );
        env.events().publish(
            (symbol_short!("released"), project_id, milestone_index),
            milestone.amount,
        );

        Ok(())
    }

    pub fn dispute_milestone(
        env: Env,
        client: Address,
        project_id: u64,
        milestone_index: u32,
        reason: String,
    ) -> Result<(), EscrowError> {
        client.require_auth();

        let key = DataKey::Project(project_id);
        let mut project = Self::get_project(env.clone(), project_id)?;

        if client != project.client {
            return Err(EscrowError::Unauthorized);
        }

        let mut milestones = project.milestones.clone();
        if milestone_index >= milestones.len() {
            return Err(EscrowError::MilestoneNotFound);
        }

        let mut milestone = milestones.get(milestone_index).unwrap();
        if milestone.status != 2 {
            return Err(EscrowError::InvalidStatus);
        }

        milestone.status = 4; // Disputed
        milestones.set(milestone_index, milestone.clone());
        project.milestones = milestones;
        env.storage().persistent().set(&key, &project);

        env.events().publish(
            (symbol_short!("disputed"), project_id, milestone_index),
            reason,
        );

        Ok(())
    }

    pub fn resolve_dispute(
        env: Env,
        arbiter: Address,
        project_id: u64,
        milestone_index: u32,
        resolve_to_client: bool,
    ) -> Result<(), EscrowError> {
        arbiter.require_auth();

        let key = DataKey::Project(project_id);
        let mut project = Self::get_project(env.clone(), project_id)?;

        if arbiter != project.arbiter {
            return Err(EscrowError::Unauthorized);
        }

        let mut milestones = project.milestones.clone();
        if milestone_index >= milestones.len() {
            return Err(EscrowError::MilestoneNotFound);
        }

        let mut milestone = milestones.get(milestone_index).unwrap();
        if milestone.status != 4 {
            return Err(EscrowError::InvalidStatus);
        }

        let token_client = token::Client::new(&env, &project.token);
        if resolve_to_client {
            token_client.transfer(&env.current_contract_address(), &project.client, &milestone.amount);
            milestone.status = 6; // Refunded
        } else {
            token_client.transfer(&env.current_contract_address(), &project.freelancer, &milestone.amount);
            milestone.status = 5; // Released
        }

        milestones.set(milestone_index, milestone.clone());
        project.milestones = milestones;
        env.storage().persistent().set(&key, &project);

        if resolve_to_client {
            env.events().publish(
                (symbol_short!("refunded"), project_id, milestone_index),
                milestone.amount,
            );
        } else {
            env.events().publish(
                (symbol_short!("released"), project_id, milestone_index),
                milestone.amount,
            );
        }

        Ok(())
    }

    pub fn refund_milestone(
        env: Env,
        caller: Address,
        project_id: u64,
        milestone_index: u32,
    ) -> Result<(), EscrowError> {
        caller.require_auth();

        let key = DataKey::Project(project_id);
        let mut project = Self::get_project(env.clone(), project_id)?;

        let mut milestones = project.milestones.clone();
        if milestone_index >= milestones.len() {
            return Err(EscrowError::MilestoneNotFound);
        }

        let mut milestone = milestones.get(milestone_index).unwrap();
        if milestone.status != 1 && milestone.status != 2 && milestone.status != 4 {
            return Err(EscrowError::InvalidStatus);
        }

        if caller == project.client {
            let current_time = env.ledger().timestamp();
            if current_time <= milestone.deadline {
                return Err(EscrowError::DeadlineNotPassed);
            }
        } else if caller == project.freelancer {
            // Freelancer can voluntarily refund back to client at any time
        } else {
            return Err(EscrowError::Unauthorized);
        }

        let token_client = token::Client::new(&env, &project.token);
        token_client.transfer(&env.current_contract_address(), &project.client, &milestone.amount);

        milestone.status = 6; // Refunded
        milestones.set(milestone_index, milestone.clone());
        project.milestones = milestones;
        env.storage().persistent().set(&key, &project);

        env.events().publish(
            (symbol_short!("refunded"), project_id, milestone_index),
            milestone.amount,
        );

        Ok(())
    }
}
