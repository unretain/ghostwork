// GHOSTWORK agent cards: minting, hiring, escrow, ratings, claims, transfers.
// A child of the template's unit_tests module so it can reuse its helpers.
use super::*;
use crate::ghostwork::{MIN_PRICE, REFUND_AFTER_MS};
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_sdk::json_types::U128;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const PRICE: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR

fn hash(c: char) -> String {
    std::iter::repeat(c).take(64).collect()
}

fn register_local_agent(contract: &mut Contract, agent: AccountId) {
    // whitelisting is owner-only (the contract owner is accounts(0))
    testing_env!(get_context(accounts(0), false).build());
    contract.whitelist_agent_for_local(agent.clone());
    testing_env!(get_context_with_deposit(agent, false, Some(DEPOSIT_005_NEAR)).build());
    contract.register_agent(create_mock_dstack_attestation());
}

fn mint(contract: &mut Contract, owner: AccountId, prompt_hash: Option<String>) {
    testing_env!(get_context_with_deposit(owner, false, Some(ONE_NEAR)).build());
    contract.mint_card(
        "Wraith".into(),
        "Reviews smart contracts".into(),
        "Finds the bug before the auditor does.".into(),
        U128(PRICE),
        prompt_hash,
        None,
    );
}

// Card "0" owned by accounts(3) with a sealed skill; accounts(2) is a registered agent.
fn setup_card() -> Contract {
    let mut contract = setup_contract();
    register_local_agent(&mut contract, accounts(2));
    mint(&mut contract, accounts(3), Some(hash('a')));
    contract
}

fn hire(contract: &mut Contract, customer: AccountId) -> U64 {
    testing_env!(
        get_context_with_deposit(customer, false, Some(NearToken::from_yoctonear(PRICE))).build()
    );
    contract.hire("0".into(), hash('b'))
}

fn complete(contract: &mut Contract, job_id: U64) {
    testing_env!(get_context(accounts(2), false).build());
    contract.complete_job(job_id, hash('c'));
}

#[test]
fn test_mint_card() {
    let contract = setup_card();
    let card = contract.get_card("0".into()).unwrap();
    assert_eq!(card.owner_id, accounts(3));
    assert_eq!(card.title.as_deref(), Some("Wraith"));
    assert_eq!(card.skill, "Reviews smart contracts");
    assert_eq!(card.price.0, PRICE);
    assert_eq!(card.path, "ghostwork/card/0");
    assert_eq!(card.prompt_hash, Some(hash('a')));
    assert_eq!(contract.get_stats().cards.0, 1);
}

#[test]
#[should_panic(expected = "to mint")]
fn test_mint_requires_storage_deposit() {
    let mut contract = setup_contract();
    testing_env!(get_context(accounts(3), false).build());
    contract.mint_card("Wraith".into(), "Skill".into(), "".into(), U128(PRICE), None, None);
}

#[test]
#[should_panic(expected = "Price must be at least")]
fn test_mint_price_too_low() {
    let mut contract = setup_contract();
    testing_env!(get_context_with_deposit(accounts(3), false, Some(ONE_NEAR)).build());
    contract.mint_card("Wraith".into(), "Skill".into(), "".into(), U128(MIN_PRICE - 1), None, None);
}

#[test]
#[should_panic(expected = "Hash must be 64 hex characters")]
fn test_mint_rejects_bad_hash() {
    let mut contract = setup_contract();
    testing_env!(get_context_with_deposit(accounts(3), false, Some(ONE_NEAR)).build());
    contract.mint_card("Wraith".into(), "Skill".into(), "".into(), U128(PRICE), Some("nope".into()), None);
}

#[test]
#[should_panic(expected = "This card has no skill sealed yet")]
fn test_hire_requires_sealed_skill() {
    let mut contract = setup_contract();
    mint(&mut contract, accounts(3), None);
    hire(&mut contract, accounts(4));
}

#[test]
#[should_panic(expected = "to hire this card")]
fn test_hire_underpaid() {
    let mut contract = setup_card();
    testing_env!(
        get_context_with_deposit(accounts(4), false, Some(NearToken::from_yoctonear(PRICE - 1)))
            .build()
    );
    contract.hire("0".into(), hash('b'));
}

#[test]
fn test_hire_escrows_then_complete_pays_the_card() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));

    // escrowed: nothing earned yet
    let card = contract.get_card("0".into()).unwrap();
    assert_eq!(card.balance.0, 0);
    assert_eq!(card.recent_jobs.len(), 1);
    assert_eq!(card.recent_jobs[0].status, JobStatus::Open);

    complete(&mut contract, job_id);
    let card = contract.get_card("0".into()).unwrap();
    assert_eq!(card.balance.0, PRICE * 85 / 100);
    assert_eq!(card.earned.0, PRICE * 85 / 100);
    assert_eq!(card.jobs_done.0, 1);

    let job = contract.get_job(job_id).unwrap();
    assert_eq!(job.status, JobStatus::Done);
    assert_eq!(job.result_hash, Some(hash('c')));
    assert_eq!(job.worker, Some(accounts(2)));

    let stats = contract.get_stats();
    assert_eq!(stats.jobs_completed.0, 1);
    assert_eq!(stats.volume.0, PRICE);
}

#[test]
#[should_panic(expected = "Caller is not a verified agent")]
fn test_complete_requires_verified_agent() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    // the card owner cannot release the escrow to themselves
    testing_env!(get_context(accounts(3), false).build());
    contract.complete_job(job_id, hash('c'));
}

#[test]
#[should_panic(expected = "Job is not open")]
fn test_complete_twice() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    complete(&mut contract, job_id);
    complete(&mut contract, job_id);
}

#[test]
#[should_panic(expected = "Refund opens 10 minutes after hiring")]
fn test_refund_too_early() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    testing_env!(get_context(accounts(4), false).build());
    let _ = contract.refund_job(job_id);
}

#[test]
fn test_refund_after_timeout_deletes_job() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    testing_env!(
        get_context_with_deposit_and_timestamp(accounts(4), false, None, Some(REFUND_AFTER_MS))
            .build()
    );
    let _ = contract.refund_job(job_id);
    assert!(contract.get_job(job_id).is_none());
    let card = contract.get_card("0".into()).unwrap();
    assert!(card.recent_jobs.is_empty());
    assert_eq!(card.balance.0, 0);
}

#[test]
#[should_panic(expected = "Only the customer can refund")]
fn test_refund_only_customer() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    testing_env!(
        get_context_with_deposit_and_timestamp(accounts(5), false, None, Some(REFUND_AFTER_MS))
            .build()
    );
    let _ = contract.refund_job(job_id);
}

#[test]
#[should_panic(expected = "Job is not open")]
fn test_refund_completed_job() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    complete(&mut contract, job_id);
    testing_env!(
        get_context_with_deposit_and_timestamp(accounts(4), false, None, Some(REFUND_AFTER_MS))
            .build()
    );
    let _ = contract.refund_job(job_id);
}

#[test]
fn test_rate_job() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    complete(&mut contract, job_id);
    testing_env!(get_context(accounts(4), false).build());
    contract.rate_job(job_id, 4);
    let card = contract.get_card("0".into()).unwrap();
    assert_eq!(card.rating_sum.0, 4);
    assert_eq!(card.rating_count.0, 1);
    assert_eq!(contract.get_job(job_id).unwrap().rating, Some(4));
}

#[test]
#[should_panic(expected = "Job already rated")]
fn test_rate_twice() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    complete(&mut contract, job_id);
    testing_env!(get_context(accounts(4), false).build());
    contract.rate_job(job_id, 5);
    contract.rate_job(job_id, 5);
}

#[test]
#[should_panic(expected = "Job is not completed")]
fn test_rate_open_job() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    testing_env!(get_context(accounts(4), false).build());
    contract.rate_job(job_id, 5);
}

#[test]
#[should_panic(expected = "Owners cannot rate their own card")]
fn test_owner_cannot_rate_own_card() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(3));
    complete(&mut contract, job_id);
    testing_env!(get_context(accounts(3), false).build());
    contract.rate_job(job_id, 5);
}

#[test]
fn test_claim() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    complete(&mut contract, job_id);
    testing_env!(get_context(accounts(3), false).build());
    let _ = contract.claim("0".into());
    let card = contract.get_card("0".into()).unwrap();
    assert_eq!(card.balance.0, 0);
    // lifetime earnings stay on the card as its record
    assert_eq!(card.earned.0, PRICE * 85 / 100);
}

#[test]
#[should_panic(expected = "Nothing to claim")]
fn test_claim_empty() {
    let mut contract = setup_card();
    testing_env!(get_context(accounts(3), false).build());
    let _ = contract.claim("0".into());
}

#[test]
#[should_panic(expected = "Only the card owner can do this")]
fn test_claim_only_owner() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    complete(&mut contract, job_id);
    testing_env!(get_context(accounts(4), false).build());
    let _ = contract.claim("0".into());
}

#[test]
#[should_panic(expected = "Only the card owner can do this")]
fn test_transfer_moves_treasury_and_record() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    complete(&mut contract, job_id);

    testing_env!(
        get_context_with_deposit(accounts(3), false, Some(NearToken::from_yoctonear(1))).build()
    );
    contract.nft_transfer(accounts(5), "0".into(), None, None);

    // unclaimed earnings, history and the sealed skill all travel with the card
    let card = contract.get_card("0".into()).unwrap();
    assert_eq!(card.owner_id, accounts(5));
    assert_eq!(card.balance.0, PRICE * 85 / 100);
    assert_eq!(card.jobs_done.0, 1);
    assert_eq!(card.prompt_hash, Some(hash('a')));

    // the new owner can claim them...
    testing_env!(get_context(accounts(5), false).build());
    let _ = contract.claim("0".into());

    // ...and the previous owner can no longer touch the card
    testing_env!(get_context(accounts(3), false).build());
    contract.update_card("0".into(), None, None, Some(U128(PRICE * 2)), None);
}

#[test]
fn test_update_card() {
    let mut contract = setup_card();
    testing_env!(get_context(accounts(3), false).build());
    contract.update_card(
        "0".into(),
        Some("Writes cold emails".into()),
        None,
        Some(U128(PRICE * 3)),
        Some(hash('d')),
    );
    let card = contract.get_card("0".into()).unwrap();
    assert_eq!(card.skill, "Writes cold emails");
    assert_eq!(card.price.0, PRICE * 3);
    assert_eq!(card.prompt_hash, Some(hash('d')));
}

#[test]
fn test_owner_sign_evm_counts_signatures() {
    let mut contract = setup_card();
    testing_env!(get_context(accounts(3), false).build());
    let tx = EvmTx {
        chain_id: U64(11_155_111),
        nonce: U64(0),
        max_priority_fee_per_gas: U128(1_000_000_000),
        max_fee_per_gas: U128(20_000_000_000),
        gas_limit: U64(21_000),
        to: "0x1b48b83a308ea4beb845db088180dc3389f8aa3b".into(),
        value: U128(1),
        data: None,
    };
    let _ = contract.owner_sign_evm("0".into(), tx);
    assert_eq!(contract.get_card("0".into()).unwrap().signatures.0, 1);
}

#[test]
#[should_panic(expected = "Only the card owner can do this")]
fn test_owner_sign_evm_only_owner() {
    let mut contract = setup_card();
    testing_env!(get_context(accounts(4), false).build());
    let tx = EvmTx {
        chain_id: U64(11_155_111),
        nonce: U64(0),
        max_priority_fee_per_gas: U128(1),
        max_fee_per_gas: U128(1),
        gas_limit: U64(21_000),
        to: "0x1b48b83a308ea4beb845db088180dc3389f8aa3b".into(),
        value: U128(1),
        data: None,
    };
    let _ = contract.owner_sign_evm("0".into(), tx);
}

// ---- marketplace ----

fn list(contract: &mut Contract, price: u128) {
    testing_env!(get_context(accounts(3), false).build());
    contract.list_card("0".into(), U128(price));
}

#[test]
fn test_buy_card_moves_everything() {
    let mut contract = setup_card();
    let job_id = hire(&mut contract, accounts(4));
    complete(&mut contract, job_id);
    list(&mut contract, PRICE * 20);
    assert_eq!(contract.get_card("0".into()).unwrap().listed_price, Some(U128(PRICE * 20)));

    testing_env!(
        get_context_with_deposit(accounts(5), false, Some(NearToken::from_yoctonear(PRICE * 20)))
            .build()
    );
    let _ = contract.buy_card("0".into());

    let card = contract.get_card("0".into()).unwrap();
    assert_eq!(card.owner_id, accounts(5));
    assert_eq!(card.listed_price, None);
    assert_eq!(card.balance.0, PRICE * 85 / 100);
    assert_eq!(card.jobs_done.0, 1);
    assert_eq!(card.prompt_hash, Some(hash('a')));

    // the buyer can claim what the card had earned
    testing_env!(get_context(accounts(5), false).build());
    let _ = contract.claim("0".into());
}

#[test]
#[should_panic(expected = "This card is not for sale")]
fn test_buy_unlisted_card() {
    let mut contract = setup_card();
    testing_env!(get_context_with_deposit(accounts(5), false, Some(ONE_NEAR)).build());
    let _ = contract.buy_card("0".into());
}

#[test]
#[should_panic(expected = "to buy this card")]
fn test_buy_underpaid() {
    let mut contract = setup_card();
    list(&mut contract, PRICE * 20);
    testing_env!(
        get_context_with_deposit(accounts(5), false, Some(NearToken::from_yoctonear(PRICE))).build()
    );
    let _ = contract.buy_card("0".into());
}

#[test]
#[should_panic(expected = "You already own this card")]
fn test_buy_own_card() {
    let mut contract = setup_card();
    list(&mut contract, PRICE);
    testing_env!(get_context_with_deposit(accounts(3), false, Some(ONE_NEAR)).build());
    let _ = contract.buy_card("0".into());
}

#[test]
#[should_panic(expected = "Only the card owner can do this")]
fn test_list_only_owner() {
    let mut contract = setup_card();
    testing_env!(get_context(accounts(4), false).build());
    contract.list_card("0".into(), U128(PRICE));
}

#[test]
fn test_unlist_and_transfer_clear_listing() {
    let mut contract = setup_card();
    list(&mut contract, PRICE);
    testing_env!(get_context(accounts(3), false).build());
    contract.unlist_card("0".into());
    assert_eq!(contract.get_card("0".into()).unwrap().listed_price, None);

    list(&mut contract, PRICE);
    testing_env!(
        get_context_with_deposit(accounts(3), false, Some(NearToken::from_yoctonear(1))).build()
    );
    contract.nft_transfer(accounts(5), "0".into(), None, None);
    assert_eq!(contract.get_card("0".into()).unwrap().listed_price, None);
}

#[test]
fn test_art_is_stored_on_the_nft() {
    let contract = setup_card();
    let token = contract.nft_token("0".into()).unwrap();
    let meta = token.metadata.unwrap();
    assert!(meta.media.unwrap().starts_with("data:image/svg+xml;base64,"));
    assert!(meta.extra.unwrap().contains("\"color\""));
    let card = contract.get_card("0".into()).unwrap();
    assert!(card.media.is_some());
}

// ---- chosen colour ----

#[test]
fn test_mint_with_chosen_colour() {
    let mut contract = setup_contract();
    let (preview, _) = contract.preview_art(Some("Tide".into()));
    testing_env!(get_context_with_deposit(accounts(3), false, Some(ONE_NEAR)).build());
    contract.mint_card("Wraith".into(), "Skill".into(), "".into(), U128(PRICE), None, Some("Tide".into()));
    let card = contract.get_card("0".into()).unwrap();
    assert_eq!(card.traits.color, "Tide");
    // what was previewed is what was minted
    assert_eq!(card.media, Some(preview));
    assert_eq!(contract.get_palette().len(), 6);
}

#[test]
#[should_panic(expected = "Colour must be one of the built-in options")]
fn test_mint_rejects_unknown_colour() {
    let mut contract = setup_contract();
    testing_env!(get_context_with_deposit(accounts(3), false, Some(ONE_NEAR)).build());
    contract.mint_card("Wraith".into(), "Skill".into(), "".into(), U128(PRICE), None, Some("Mauve".into()));
}
