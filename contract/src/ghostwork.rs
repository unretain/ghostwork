// GHOSTWORK agent cards.
//
// Every NFT is an AI agent with a job. The owner seals a skill into it (only the
// hash of the private instructions is stored here; the text lives inside the TEE
// agent). Anyone can hire the card: payment is escrowed in this contract and is
// released to the card when a registered, attested agent posts the result. The
// card keeps its own treasury, job history, rating and level, and all of it moves
// with the token when it is transferred.
use crate::*;
use crate::art::{Traits, media_for, traits_for, traits_from_color};
pub use crate::evm::EvmTx;
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_contract_standards::non_fungible_token::{NonFungibleTokenEnumeration, Token, TokenId};
use near_sdk::json_types::U128;

pub const MIN_PRICE: u128 = 50_000_000_000_000_000_000_000; // 0.05 NEAR
/// Share of each job paid to the agent that ran it (covers inference and gas).
pub const OPERATOR_BPS: u128 = 1_000;
/// Share kept by the contract (covers the storage of job receipts).
pub const PROTOCOL_BPS: u128 = 500;
/// A customer can take their money back if a job is still open after this long.
pub const REFUND_AFTER_MS: u64 = 10 * 60 * 1000;

const MAX_RECENT_JOBS: usize = 20;
const MAX_TITLE: usize = 32;
const MAX_SKILL: usize = 60;
const MAX_ABOUT: usize = 240;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum JobStatus {
    /// Paid, waiting for the agent. Refundable if it is never answered.
    Open,
    /// Answered: the card has been paid.
    Done,
}

#[near(serializers = [borsh])]
pub struct Card {
    /// Public one-line description of what the card does.
    pub skill: String,
    pub about: String,
    /// sha256 of the owner's private instructions. `None` until a skill is sealed.
    pub prompt_hash: Option<String>,
    /// Price per job in yoctoNEAR.
    pub price: u128,
    /// Unclaimed earnings held for whoever owns the card.
    pub balance: u128,
    /// Lifetime earnings (after fees).
    pub earned: u128,
    pub jobs_done: u64,
    pub rating_sum: u64,
    pub rating_count: u64,
    pub recent_jobs: Vec<u64>,
    /// Chain Signatures requested for the card's foreign-chain wallets.
    pub signatures: u64,
    pub minted_at_ms: u64,
    /// Asking price in yoctoNEAR while the card is for sale.
    pub listed_price: Option<u128>,
}

#[near(serializers = [borsh])]
pub struct Job {
    pub token_id: TokenId,
    pub customer: AccountId,
    /// sha256 of the customer's request. The request itself never touches the chain.
    pub request_hash: String,
    pub paid: u128,
    pub status: JobStatus,
    pub created_ms: u64,
    pub completed_ms: Option<u64>,
    /// sha256 of the answer the agent returned.
    pub result_hash: Option<String>,
    pub rating: Option<u8>,
    pub worker: Option<AccountId>,
}

#[near(serializers = [json])]
pub struct JobView {
    pub job_id: U64,
    pub token_id: TokenId,
    pub customer: AccountId,
    pub request_hash: String,
    pub paid: U128,
    pub status: JobStatus,
    pub created_ms: U64,
    pub completed_ms: Option<U64>,
    pub result_hash: Option<String>,
    pub rating: Option<u8>,
    pub worker: Option<AccountId>,
}

#[near(serializers = [json])]
pub struct CardView {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub title: Option<String>,
    pub skill: String,
    pub about: String,
    pub prompt_hash: Option<String>,
    pub price: U128,
    pub balance: U128,
    pub earned: U128,
    pub jobs_done: U64,
    pub rating_sum: U64,
    pub rating_count: U64,
    pub path: String,
    pub signatures: U64,
    pub minted_at_ms: U64,
    pub listed_price: Option<U128>,
    /// The card art (SVG data URI), exactly as stored in the NFT metadata.
    pub media: Option<String>,
    pub traits: Traits,
    pub recent_jobs: Vec<JobView>,
}

#[near(serializers = [json])]
pub struct Stats {
    pub cards: U64,
    pub jobs_completed: U64,
    pub volume: U128,
    pub min_price: U128,
    pub operator_bps: u32,
    pub protocol_bps: u32,
    pub refund_after_ms: U64,
}

pub fn token_path(token_id: &str) -> String {
    format!("ghostwork/card/{token_id}")
}

fn require_hash(h: &str) {
    require!(
        h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit()),
        "Hash must be 64 hex characters"
    );
}

fn require_text(skill: &str, about: &str) {
    require!(
        !skill.is_empty() && skill.len() <= MAX_SKILL,
        "Skill must be 1-60 characters"
    );
    require!(about.len() <= MAX_ABOUT, "About must be at most 240 characters");
}

fn require_price(price: u128) {
    require!(
        price >= MIN_PRICE,
        &format!(
            "Price must be at least {}",
            NearToken::from_yoctonear(MIN_PRICE).exact_amount_display()
        )
    );
}

fn emit(event: &str, data: serde_json::Value) {
    log!(
        "EVENT_JSON:{}",
        serde_json::json!({ "standard": "ghostwork", "version": "1.0.0", "event": event, "data": [data] })
    );
}

fn job_view(job_id: u64, job: &Job) -> JobView {
    JobView {
        job_id: U64(job_id),
        token_id: job.token_id.clone(),
        customer: job.customer.clone(),
        request_hash: job.request_hash.clone(),
        paid: U128(job.paid),
        status: job.status.clone(),
        created_ms: U64(job.created_ms),
        completed_ms: job.completed_ms.map(U64),
        result_hash: job.result_hash.clone(),
        rating: job.rating,
        worker: job.worker.clone(),
    }
}

impl Contract {
    fn token_owner(&self, token_id: &TokenId) -> AccountId {
        self.tokens
            .owner_by_id
            .get(token_id)
            .unwrap_or_else(|| env::panic_str("Card not found"))
    }

    fn require_token_owner(&self, token_id: &TokenId) {
        require!(
            env::predecessor_account_id() == self.token_owner(token_id),
            "Only the card owner can do this"
        );
    }

    /// A listing never survives a change of owner.
    pub(crate) fn clear_listing(&mut self, token_id: &TokenId) {
        if let Some(card) = self.cards.get_mut(token_id) {
            card.listed_price = None;
        }
    }

    fn agent_is_valid(&self, account_id: &AccountId) -> bool {
        self.agents
            .get(account_id)
            .map(|a| self.check_invalid_reasons(account_id, a).is_empty())
            .unwrap_or(false)
    }

    fn card_view(&self, token: Token) -> CardView {
        let card = self
            .cards
            .get(&token.token_id)
            .unwrap_or_else(|| env::panic_str("Card not found"));
        let (title, media, extra) = token
            .metadata
            .map(|m| (m.title, m.media, m.extra))
            .unwrap_or((None, None, None));
        let traits = extra
            .and_then(|e| serde_json::from_str::<Traits>(&e).ok())
            .unwrap_or_else(|| traits_for(&token.token_id));
        CardView {
            path: token_path(&token.token_id),
            title,
            media,
            traits,
            owner_id: token.owner_id,
            skill: card.skill.clone(),
            about: card.about.clone(),
            prompt_hash: card.prompt_hash.clone(),
            price: U128(card.price),
            balance: U128(card.balance),
            earned: U128(card.earned),
            jobs_done: U64(card.jobs_done),
            rating_sum: U64(card.rating_sum),
            rating_count: U64(card.rating_count),
            signatures: U64(card.signatures),
            minted_at_ms: U64(card.minted_at_ms),
            listed_price: card.listed_price.map(U128),
            // newest first; refunded jobs are deleted, so skip ids that no longer exist
            recent_jobs: card
                .recent_jobs
                .iter()
                .rev()
                .filter_map(|id| self.jobs.get(id).map(|j| job_view(*id, j)))
                .collect(),
            token_id: token.token_id,
        }
    }
}

#[near]
impl Contract {
    /// Mint a new agent card. The caller pays for the storage it uses; the rest is refunded.
    #[payable]
    pub fn mint_card(
        &mut self,
        title: String,
        skill: String,
        about: String,
        price: U128,
        prompt_hash: Option<String>,
        color: Option<String>,
    ) -> Token {
        require!(
            !title.is_empty() && title.len() <= MAX_TITLE,
            "Title must be 1-32 characters"
        );
        require_text(&skill, &about);
        require_price(price.0);
        if let Some(h) = &prompt_hash {
            require_hash(h);
        }

        let owner = env::predecessor_account_id();
        let initial_storage = env::storage_usage();
        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        // art and traits are derived from the token id and stored on the NFT itself
        let traits = match color {
            Some(color) => traits_from_color(color),
            None => traits_for(&token_id),
        };
        let metadata = TokenMetadata {
            title: Some(title),
            description: Some(skill.clone()),
            media: Some(media_for(&traits)),
            extra: Some(serde_json::to_string(&traits).unwrap()),
            issued_at: Some(block_timestamp_ms().to_string()),
            ..Default::default()
        };
        self.cards.insert(
            token_id.clone(),
            Card {
                skill,
                about,
                prompt_hash,
                price: price.0,
                balance: 0,
                earned: 0,
                jobs_done: 0,
                rating_sum: 0,
                rating_count: 0,
                recent_jobs: Vec::new(),
                signatures: 0,
                minted_at_ms: block_timestamp_ms(),
                listed_price: None,
            },
        );
        let token = self
            .tokens
            .internal_mint_with_refund(token_id, owner.clone(), Some(metadata), None);
        self.cards.flush();

        // Reserve room for what the card grows into (job list, a sealed skill, longer text).
        let reserve = (MAX_RECENT_JOBS * 8 + 64 + MAX_SKILL + MAX_ABOUT) as u64;
        let used = env::storage_usage() - initial_storage + reserve;
        let cost = env::storage_byte_cost().saturating_mul(used as u128);
        let attached = env::attached_deposit();
        require!(
            attached >= cost,
            &format!("Attach at least {} to mint", cost.exact_amount_display())
        );
        let refund = attached.saturating_sub(cost);
        if refund > NearToken::from_yoctonear(1) {
            Promise::new(owner).transfer(refund).detach();
        }
        token
    }

    /// Change what the card does or what it charges. Passing `prompt_hash` re-seals the skill.
    pub fn update_card(
        &mut self,
        token_id: TokenId,
        skill: Option<String>,
        about: Option<String>,
        price: Option<U128>,
        prompt_hash: Option<String>,
    ) {
        self.require_token_owner(&token_id);
        let card = self.cards.get_mut(&token_id).unwrap();
        if let Some(skill) = skill {
            card.skill = skill;
        }
        if let Some(about) = about {
            card.about = about;
        }
        require_text(&card.skill, &card.about);
        if let Some(price) = price {
            require_price(price.0);
            card.price = price.0;
        }
        if let Some(h) = prompt_hash {
            require_hash(&h);
            card.prompt_hash = Some(h);
        }
    }

    /// Hire a card. Attach at least its price; the payment is held until the job is
    /// completed (or refunded). Returns the job id.
    #[payable]
    pub fn hire(&mut self, token_id: TokenId, request_hash: String) -> U64 {
        require_hash(&request_hash);
        let paid = env::attached_deposit().as_yoctonear();
        let card = self
            .cards
            .get_mut(&token_id)
            .unwrap_or_else(|| env::panic_str("Card not found"));
        require!(card.prompt_hash.is_some(), "This card has no skill sealed yet");
        require!(
            paid >= card.price,
            &format!(
                "Attach at least {} to hire this card",
                NearToken::from_yoctonear(card.price).exact_amount_display()
            )
        );

        let job_id = self.next_job_id;
        self.next_job_id += 1;
        card.recent_jobs.push(job_id);
        if card.recent_jobs.len() > MAX_RECENT_JOBS {
            card.recent_jobs.remove(0);
        }
        let customer = env::predecessor_account_id();
        emit(
            "job_opened",
            serde_json::json!({ "job_id": job_id.to_string(), "token_id": token_id, "customer": customer, "paid": paid.to_string() }),
        );
        self.jobs.insert(
            job_id,
            Job {
                token_id,
                customer,
                request_hash,
                paid,
                status: JobStatus::Open,
                created_ms: block_timestamp_ms(),
                completed_ms: None,
                result_hash: None,
                rating: None,
                worker: None,
            },
        );
        U64(job_id)
    }

    /// Called by a registered, attested agent once it has the answer. Releases the
    /// escrow: the card earns, the agent is paid for the compute. Answered jobs are
    /// final; the customer's rating is the record of how good the answer was.
    pub fn complete_job(&mut self, job_id: U64, result_hash: String) {
        require_hash(&result_hash);
        let worker = env::predecessor_account_id();
        require!(
            self.agent_is_valid(&worker),
            "Caller is not a verified agent"
        );
        let job = self
            .jobs
            .get_mut(&job_id.0)
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.status == JobStatus::Open, "Job is not open");
        job.status = JobStatus::Done;
        job.result_hash = Some(result_hash);
        job.completed_ms = Some(block_timestamp_ms());
        job.worker = Some(worker.clone());
        let paid = job.paid;
        let token_id = job.token_id.clone();

        let operator_cut = paid * OPERATOR_BPS / 10_000;
        let protocol_cut = paid * PROTOCOL_BPS / 10_000;
        let net = paid - operator_cut - protocol_cut;

        let card = self.cards.get_mut(&token_id).unwrap();
        card.balance += net;
        card.earned += net;
        card.jobs_done += 1;
        self.jobs_completed += 1;
        self.volume += paid;

        emit(
            "job_completed",
            serde_json::json!({ "job_id": job_id, "token_id": token_id, "worker": worker, "earned": net.to_string() }),
        );
        if operator_cut > 0 {
            Promise::new(worker)
                .transfer(NearToken::from_yoctonear(operator_cut))
                .detach();
        }
    }

    /// The customer takes their payment back if the job was never answered.
    pub fn refund_job(&mut self, job_id: U64) -> Promise {
        let job = self
            .jobs
            .get(&job_id.0)
            .unwrap_or_else(|| env::panic_str("Job not found"));
        let customer = env::predecessor_account_id();
        require!(job.customer == customer, "Only the customer can refund");
        require!(job.status == JobStatus::Open, "Job is not open");
        require!(
            block_timestamp_ms() >= job.created_ms + REFUND_AFTER_MS,
            "Refund opens 10 minutes after hiring"
        );
        let paid = job.paid;
        // Deleting the record frees its storage; the job list skips missing ids.
        self.jobs.remove(&job_id.0);
        emit("job_refunded", serde_json::json!({ "job_id": job_id }));
        Promise::new(customer).transfer(NearToken::from_yoctonear(paid))
    }

    /// The customer rates an answered job, 1 to 5 stars. One rating per job.
    pub fn rate_job(&mut self, job_id: U64, stars: u8) {
        require!((1..=5).contains(&stars), "Stars must be 1-5");
        let customer = env::predecessor_account_id();
        let job = self
            .jobs
            .get(&job_id.0)
            .unwrap_or_else(|| env::panic_str("Job not found"));
        require!(job.customer == customer, "Only the customer can rate");
        require!(job.status == JobStatus::Done, "Job is not completed");
        require!(job.rating.is_none(), "Job already rated");
        let token_id = job.token_id.clone();
        require!(
            self.token_owner(&token_id) != customer,
            "Owners cannot rate their own card"
        );
        self.jobs.get_mut(&job_id.0).unwrap().rating = Some(stars);
        let card = self.cards.get_mut(&token_id).unwrap();
        card.rating_sum += stars as u64;
        card.rating_count += 1;
    }

    /// The card owner withdraws the card's unclaimed earnings.
    pub fn claim(&mut self, token_id: TokenId) -> Promise {
        self.require_token_owner(&token_id);
        let card = self.cards.get_mut(&token_id).unwrap();
        let amount = card.balance;
        require!(amount > 0, "Nothing to claim");
        card.balance = 0;
        emit(
            "claimed",
            serde_json::json!({ "token_id": token_id, "amount": amount.to_string() }),
        );
        Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(amount))
    }

    /// Put the card up for sale at a fixed price.
    pub fn list_card(&mut self, token_id: TokenId, price: U128) {
        self.require_token_owner(&token_id);
        require!(price.0 > 0, "Price must be more than zero");
        self.cards.get_mut(&token_id).unwrap().listed_price = Some(price.0);
        emit(
            "card_listed",
            serde_json::json!({ "token_id": token_id, "price": price }),
        );
    }

    pub fn unlist_card(&mut self, token_id: TokenId) {
        self.require_token_owner(&token_id);
        self.cards.get_mut(&token_id).unwrap().listed_price = None;
    }

    /// Buy a listed card. The buyer gets the NFT and everything on it (unclaimed
    /// earnings, record, sealed skill); the seller gets the asking price.
    #[payable]
    pub fn buy_card(&mut self, token_id: TokenId) -> Promise {
        let buyer = env::predecessor_account_id();
        let seller = self.token_owner(&token_id);
        require!(buyer != seller, "You already own this card");
        let price = self
            .cards
            .get(&token_id)
            .and_then(|c| c.listed_price)
            .unwrap_or_else(|| env::panic_str("This card is not for sale"));
        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached >= price,
            &format!(
                "Attach at least {} to buy this card",
                NearToken::from_yoctonear(price).exact_amount_display()
            )
        );
        self.tokens
            .internal_transfer(&seller, &buyer, &token_id, None, None);
        self.clear_listing(&token_id);
        emit(
            "card_sold",
            serde_json::json!({ "token_id": token_id, "seller": seller, "buyer": buyer, "price": price.to_string() }),
        );
        if attached > price {
            Promise::new(buyer)
                .transfer(NearToken::from_yoctonear(attached - price))
                .detach();
        }
        Promise::new(seller).transfer(NearToken::from_yoctonear(price))
    }

    /// The card owner signs an EVM transaction from the card's own wallet, derived by
    /// NEAR Chain Signatures from this contract and the token id. Attach 300 Tgas.
    pub fn owner_sign_evm(&mut self, token_id: TokenId, tx: EvmTx) -> Promise {
        self.require_token_owner(&token_id);
        let hash = tx.signing_hash();
        self.cards.get_mut(&token_id).unwrap().signatures += 1;
        self.internal_request_signature(token_path(&token_id), hex::encode(hash), "Ecdsa".into())
    }

    // ---- views ----

    pub fn get_token_path(&self, token_id: TokenId) -> String {
        token_path(&token_id)
    }

    pub fn get_card(&self, token_id: TokenId) -> Option<CardView> {
        self.tokens.nft_token(token_id).map(|t| self.card_view(t))
    }

    pub fn get_cards(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<CardView> {
        self.tokens
            .nft_tokens(from_index, limit)
            .into_iter()
            .map(|t| self.card_view(t))
            .collect()
    }

    pub fn get_cards_for_owner(&self, account_id: AccountId) -> Vec<CardView> {
        self.tokens
            .nft_tokens_for_owner(account_id, None, Some(50))
            .into_iter()
            .map(|t| self.card_view(t))
            .collect()
    }

    pub fn get_job(&self, job_id: U64) -> Option<JobView> {
        self.jobs.get(&job_id.0).map(|j| job_view(job_id.0, j))
    }

    /// The art the next card would be minted with, for a chosen colour or the default one.
    pub fn preview_art(&self, color: Option<String>) -> (String, Traits) {
        let traits = match color {
            Some(color) => traits_from_color(color),
            None => traits_for(&self.next_token_id.to_string()),
        };
        (media_for(&traits), traits)
    }

    /// The background colours a card can be minted with: (name, hex).
    pub fn get_palette(&self) -> Vec<(String, String)> {
        crate::art::PALETTE
            .iter()
            .map(|(name, light, _)| (name.to_string(), light.to_string()))
            .collect()
    }

    pub fn get_stats(&self) -> Stats {
        Stats {
            cards: U64(self.next_token_id),
            jobs_completed: U64(self.jobs_completed),
            volume: U128(self.volume),
            min_price: U128(MIN_PRICE),
            operator_bps: OPERATOR_BPS as u32,
            protocol_bps: PROTOCOL_BPS as u32,
            refund_after_ms: U64(REFUND_AFTER_MS),
        }
    }
}

// The Shade template's unit tests exercise agent validation through this
// entry point; it is not part of the deployed contract.
#[cfg(test)]
impl Contract {
    pub fn request_signature(&mut self, path: String, payload: String, key_type: String) -> Promise {
        if let Some(failure) = self.require_valid_agent() {
            return failure;
        }
        self.internal_request_signature(path, payload, key_type)
    }
}
