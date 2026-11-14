use hex;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    env::{self, block_timestamp_ms},
    ext_contract,
    json_types::U64,
    log, near, require,
    serde::Serialize,
    serde_json,
    store::{IterableMap, IterableSet},
};
use shade_attestation::{
    attestation::{AcceptedDstackAttestation, DstackAttestation},
    measurements::{FullMeasurements, FullMeasurementsHex, create_mock_full_measurements_hex},
    report_data::ReportData,
    tcb_info::HexBytes,
};

use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_contract_standards::non_fungible_token::metadata::{NFT_METADATA_SPEC, NFTContractMetadata};
use near_sdk::collections::LazyOption;
use near_sdk::store::LookupMap;

pub use art::Traits;
pub use ghostwork::{Card, CardView, EvmTx, Job, JobStatus, JobView, Stats};
pub use internal::events::Event;
pub use internal::helpers::AgentRemovalReason;
pub use views::{AgentValidity, AgentView, ContractInfo};

mod art;
mod evm;
mod ghostwork;
mod internal;
mod nft;
mod owner;
pub mod views;

pub type Ppid = HexBytes<16>;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    // Shade Agent template state: TEE attestation and registered agents
    pub requires_tee: bool,
    pub attestation_expiration_time_ms: u64,
    pub owner_id: AccountId,
    pub mpc_contract_id: AccountId,
    pub approved_measurements: IterableSet<FullMeasurementsHex>,
    pub approved_ppids: IterableSet<Ppid>,
    pub agents: IterableMap<AccountId, Agent>,
    pub whitelisted_agents_for_local: IterableSet<AccountId>,
    // GHOSTWORK: each NFT is an agent card with a sealed skill, a treasury and a job history
    pub tokens: NonFungibleToken,
    pub nft_metadata: LazyOption<NFTContractMetadata>,
    pub next_token_id: u64,
    pub cards: LookupMap<String, Card>,
    pub jobs: LookupMap<u64, Job>,
    pub next_job_id: u64,
    pub jobs_completed: u64,
    pub volume: u128,
}

#[near(serializers = [borsh])]
pub struct Agent {
    pub measurements: FullMeasurementsHex,
    pub ppid: Ppid,
    pub valid_until_ms: u64,
}

#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    ApprovedMeasurements,
    ApprovedPpids,
    Agents,
    WhitelistedAgentsForLocal,
    NonFungibleToken,
    NftMetadata,
    TokenMetadata,
    Enumeration,
    Approval,
    Cards,
    Jobs,
}

const STORAGE_BYTES_TO_REGISTER: u128 = 486;

#[near]
impl Contract {
    #[init]
    #[private]
    pub fn new(
        requires_tee: bool,
        attestation_expiration_time_ms: U64,
        owner_id: AccountId,
        mpc_contract_id: AccountId,
    ) -> Self {
        Self {
            requires_tee,
            attestation_expiration_time_ms: attestation_expiration_time_ms.into(),
            owner_id,
            mpc_contract_id, // Set to v1.signer-prod.testnet for testnet, v1.signer for mainnet
            approved_measurements: IterableSet::new(StorageKey::ApprovedMeasurements),
            approved_ppids: IterableSet::new(StorageKey::ApprovedPpids),
            agents: IterableMap::new(StorageKey::Agents),
            whitelisted_agents_for_local: IterableSet::new(StorageKey::WhitelistedAgentsForLocal),
            tokens: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                env::current_account_id(),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            nft_metadata: LazyOption::new(
                StorageKey::NftMetadata,
                Some(&NFTContractMetadata {
                    spec: NFT_METADATA_SPEC.to_string(),
                    name: "GHOSTWORK Agents".to_string(),
                    symbol: "GHOST".to_string(),
                    icon: None,
                    base_uri: None,
                    reference: None,
                    reference_hash: None,
                }),
            ),
            next_token_id: 0,
            cards: LookupMap::new(StorageKey::Cards),
            jobs: LookupMap::new(StorageKey::Jobs),
            next_job_id: 0,
            jobs_completed: 0,
            volume: 0,
        }
    }

    // Register an agent, this needs to be called by the agent itself
    #[payable]
    pub fn register_agent(&mut self, attestation: DstackAttestation) -> bool {
        let predecessor = env::predecessor_account_id();
        let already_registered = self.agents.get(&predecessor).is_some();

        // New agents must cover storage; re-registration only updates existing state (no extra storage)
        if !already_registered {
            // You should update the STORAGE_BYTES_TO_REGISTER const if you store more data
            let storage_cost = env::storage_byte_cost()
                .checked_mul(STORAGE_BYTES_TO_REGISTER)
                .unwrap();
            require!(
                env::attached_deposit() >= storage_cost,
                &format!(
                    "Attached deposit must be greater than storage cost {:?}",
                    storage_cost.exact_amount_display()
                )
            );
        }

        // Verify the attestation and get the measurements and PPID for the agent
        let (measurements, ppid, advisory_ids) = self.verify_attestation(attestation);

        let valid_until_ms = block_timestamp_ms() + self.attestation_expiration_time_ms;
        let (advisory_ids_truncated, number_of_advisory_ids) =
            internal::events::summarize_advisory_ids(&advisory_ids);

        Event::AgentRegistered {
            account_id: &predecessor,
            measurements: &measurements,
            ppid: &ppid,
            advisory_ids_truncated,
            number_of_advisory_ids,
            current_time_ms: U64::from(block_timestamp_ms()),
            valid_until_ms: U64::from(valid_until_ms),
        }
        .emit();

        // Register the agent
        self.agents.insert(
            predecessor,
            Agent {
                measurements,
                ppid,
                valid_until_ms,
            },
        );

        true
    }
}
