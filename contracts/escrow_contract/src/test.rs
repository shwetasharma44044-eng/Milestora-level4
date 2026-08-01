#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, String, Vec};

fn setup_test_env<'a>() -> (
    Env,
    EscrowContractClient<'a>,
    Address,
    Address,
    Address,
    token::Client<'a>,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, EscrowContract);
    let client_contract = EscrowContractClient::new(&env, &contract_id);

    let client = Address::generate(&env);
    let freelancer = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let token_admin = Address::generate(&env);

    // Register Stellar Asset Contract (SAC) for tokens
    let token_contract = env.register_stellar_asset_contract_v2(token_admin);
    let token_address = token_contract.address();
    let token_client = token::Client::new(&env, &token_address);
    
    // Use StellarAssetClient for minting in SDK v21
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);
    token_admin_client.mint(&client, &10000);

    (
        env,
        client_contract,
        client,
        freelancer,
        arbiter,
        token_client,
        token_address,
    )
}

#[test]
fn test_happy_path() {
    let (env, contract, client, freelancer, arbiter, token_client, token_address) = setup_test_env();

    // Create a vector of milestones
    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 200,
        description: String::from_str(&env, "Milestone 1"),
        deadline: 1000,
        status: 0,
    });
    milestones.push_back(Milestone {
        amount: 300,
        description: String::from_str(&env, "Milestone 2"),
        deadline: 2000,
        status: 0,
    });

    let project_id = contract.create_project(
        &client,
        &freelancer,
        &arbiter,
        &token_address,
        &milestones,
    );

    assert_eq!(project_id, 1);
    assert_eq!(contract.get_project_count(), 1);

    let project = contract.get_project(&project_id);
    assert_eq!(project.client, client);
    assert_eq!(project.freelancer, freelancer);
    assert_eq!(project.milestones.len(), 2);

    // Fund milestone 0
    contract.fund_milestone(&client, &project_id, &0);
    assert_eq!(token_client.balance(&client), 10000 - 200);
    assert_eq!(token_client.balance(&contract.address), 200);

    let milestone_funded = contract.get_milestones(&project_id).get(0).unwrap();
    assert_eq!(milestone_funded.status, 1); // Funded

    // Submit milestone 0
    contract.submit_milestone(&freelancer, &project_id, &0);
    let milestone_submitted = contract.get_milestones(&project_id).get(0).unwrap();
    assert_eq!(milestone_submitted.status, 2); // Submitted

    // Approve milestone 0
    contract.approve_milestone(&client, &project_id, &0);
    assert_eq!(token_client.balance(&contract.address), 0);
    assert_eq!(token_client.balance(&freelancer), 200);

    let milestone_released = contract.get_milestones(&project_id).get(0).unwrap();
    assert_eq!(milestone_released.status, 5); // Released
}

#[test]
fn test_dispute_and_resolve_to_client() {
    let (env, contract, client, freelancer, arbiter, token_client, token_address) = setup_test_env();

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 500,
        description: String::from_str(&env, "Work"),
        deadline: 1000,
        status: 0,
    });

    let project_id = contract.create_project(&client, &freelancer, &arbiter, &token_address, &milestones);

    contract.fund_milestone(&client, &project_id, &0);
    contract.submit_milestone(&freelancer, &project_id, &0);

    // Client disputes milestone 0
    contract.dispute_milestone(&client, &project_id, &0, &String::from_str(&env, "Did not meet requirements"));
    let milestone = contract.get_milestones(&project_id).get(0).unwrap();
    assert_eq!(milestone.status, 4); // Disputed

    // Arbiter resolves dispute in favor of Client (refund)
    contract.resolve_dispute(&arbiter, &project_id, &0, &true);
    assert_eq!(token_client.balance(&contract.address), 0);
    assert_eq!(token_client.balance(&client), 10000); // Refunded
    assert_eq!(token_client.balance(&freelancer), 0);

    let milestone_resolved = contract.get_milestones(&project_id).get(0).unwrap();
    assert_eq!(milestone_resolved.status, 6); // Refunded
}

#[test]
fn test_dispute_and_resolve_to_freelancer() {
    let (env, contract, client, freelancer, arbiter, token_client, token_address) = setup_test_env();

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 500,
        description: String::from_str(&env, "Work"),
        deadline: 1000,
        status: 0,
    });

    let project_id = contract.create_project(&client, &freelancer, &arbiter, &token_address, &milestones);

    contract.fund_milestone(&client, &project_id, &0);
    contract.submit_milestone(&freelancer, &project_id, &0);

    // Client disputes milestone 0
    contract.dispute_milestone(&client, &project_id, &0, &String::from_str(&env, "Did not meet requirements"));

    // Arbiter resolves dispute in favor of Freelancer (release)
    contract.resolve_dispute(&arbiter, &project_id, &0, &false);
    assert_eq!(token_client.balance(&contract.address), 0);
    assert_eq!(token_client.balance(&client), 10000 - 500);
    assert_eq!(token_client.balance(&freelancer), 500); // Paid

    let milestone_resolved = contract.get_milestones(&project_id).get(0).unwrap();
    assert_eq!(milestone_resolved.status, 5); // Released
}

#[test]
fn test_client_refund_on_expiry() {
    let (env, contract, client, freelancer, arbiter, token_client, token_address) = setup_test_env();

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 400,
        description: String::from_str(&env, "Expired work"),
        deadline: 1000,
        status: 0,
    });

    let project_id = contract.create_project(&client, &freelancer, &arbiter, &token_address, &milestones);
    contract.fund_milestone(&client, &project_id, &0);

    // Set time before deadline - should fail to refund
    env.ledger().with_mut(|li| {
        li.timestamp = 999;
    });
    let refund_res = contract.try_refund_milestone(&client, &project_id, &0);
    assert!(refund_res.is_err());

    // Set time after deadline - should refund successfully
    env.ledger().with_mut(|li| {
        li.timestamp = 1001;
    });
    contract.refund_milestone(&client, &project_id, &0);

    assert_eq!(token_client.balance(&contract.address), 0);
    assert_eq!(token_client.balance(&client), 10000); // Refunded

    let milestone_refunded = contract.get_milestones(&project_id).get(0).unwrap();
    assert_eq!(milestone_refunded.status, 6); // Refunded
}

#[test]
fn test_freelancer_voluntary_refund() {
    let (env, contract, client, freelancer, arbiter, token_client, token_address) = setup_test_env();

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 400,
        description: String::from_str(&env, "Voluntary Cancel"),
        deadline: 5000,
        status: 0,
    });

    let project_id = contract.create_project(&client, &freelancer, &arbiter, &token_address, &milestones);
    contract.fund_milestone(&client, &project_id, &0);

    // Freelancer can refund before deadline voluntarily
    env.ledger().with_mut(|li| {
        li.timestamp = 100;
    });
    contract.refund_milestone(&freelancer, &project_id, &0);

    assert_eq!(token_client.balance(&contract.address), 0);
    assert_eq!(token_client.balance(&client), 10000); // Refunded to client

    let milestone_refunded = contract.get_milestones(&project_id).get(0).unwrap();
    assert_eq!(milestone_refunded.status, 6); // Refunded
}

#[test]
fn test_unauthorized_actions() {
    let (env, contract, client, freelancer, arbiter, _token_client, token_address) = setup_test_env();

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        amount: 100,
        description: String::from_str(&env, "Access Test"),
        deadline: 1000,
        status: 0,
    });

    let project_id = contract.create_project(&client, &freelancer, &arbiter, &token_address, &milestones);

    // Freelancer tries to fund milestone (should fail)
    let fund_res = contract.try_fund_milestone(&freelancer, &project_id, &0);
    assert!(fund_res.is_err());

    contract.fund_milestone(&client, &project_id, &0);

    // Client tries to submit milestone (should fail)
    let submit_res = contract.try_submit_milestone(&client, &project_id, &0);
    assert!(submit_res.is_err());

    contract.submit_milestone(&freelancer, &project_id, &0);

    // Freelancer tries to approve milestone (should fail)
    let approve_res = contract.try_approve_milestone(&freelancer, &project_id, &0);
    assert!(approve_res.is_err());

    // Freelancer tries to dispute milestone (should fail)
    let dispute_res = contract.try_dispute_milestone(&freelancer, &project_id, &0, &String::from_str(&env, "Dispute!"));
    assert!(dispute_res.is_err());

    // Resolve dispute tries with random address (should fail)
    let stranger = Address::generate(&env);
    let resolve_res = contract.try_resolve_dispute(&stranger, &project_id, &0, &true);
    assert!(resolve_res.is_err());
}
