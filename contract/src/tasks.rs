// Radius: tasks in the physical world.
//
// An agent can't walk to a shop and take a photo. A person nearby can. A task says
// what to do and where, with the reward held by this contract. A person claims it,
// does it, and commits to their proof (a photo with place and time) by posting its
// hash. A verified agent checks the proof and settles: the person is paid in the
// same transaction.
//
// A task is paid for either by an account that attaches the reward, or by a card,
// out of that card's own earnings, when the agent running the card posts it.
use crate::ghostwork::{PROTOCOL_BPS, emit, require_hash};
use crate::*;
use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::json_types::U128;

pub const MIN_REWARD: u128 = 50_000_000_000_000_000_000_000; // 0.05 NEAR
/// A claim that produced no proof after this long can be taken over by someone else.
pub const CLAIM_MS: u64 = 60 * 60 * 1000;
const MAX_TITLE: usize = 80;
const MAX_DETAILS: usize = 500;
const MAX_RADIUS_M: u32 = 50_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum TaskStatus {
    /// Waiting for someone to take it.
    Open,
    /// Someone is on it.
    Claimed,
    /// Proof committed, waiting for the check.
    Submitted,
    /// Proof accepted and the worker paid.
    Paid,
    /// Withdrawn by whoever posted it; the reward went back.
    Cancelled,
}

#[near(serializers = [borsh])]
pub struct Task {
    pub poster: AccountId,
    /// Set when a card's treasury paid for the task.
    pub card: Option<TokenId>,
    pub title: String,
    /// What to do, and what the proof must show.
    pub details: String,
    /// Where: latitude and longitude in millionths of a degree, and how close counts.
    pub lat_e6: i32,
    pub lon_e6: i32,
    pub radius_m: u32,
    pub reward: u128,
    pub status: TaskStatus,
    pub created_ms: u64,
    pub worker: Option<AccountId>,
    pub claimed_ms: Option<u64>,
    /// sha256 commitment to the proof. The photo itself never touches the chain.
    pub proof_hash: Option<String>,
    /// sha256 of the written verdict from the agent that checked the proof.
    pub verdict_hash: Option<String>,
    pub settled_ms: Option<u64>,
    /// How many proofs were turned down so far.
    pub rejections: u32,
}

#[near(serializers = [json])]
pub struct TaskView {
    pub task_id: U64,
    pub poster: AccountId,
    pub card: Option<TokenId>,
    pub title: String,
    pub details: String,
    pub lat_e6: i32,
    pub lon_e6: i32,
    pub radius_m: u32,
    pub reward: U128,
    pub status: TaskStatus,
    pub created_ms: U64,
    pub worker: Option<AccountId>,
    pub claimed_ms: Option<U64>,
    pub proof_hash: Option<String>,
    pub verdict_hash: Option<String>,
    pub settled_ms: Option<U64>,
    pub rejections: u32,
}

fn task_view(id: u64, t: &Task) -> TaskView {
    TaskView {
        task_id: U64(id),
        poster: t.poster.clone(),
        card: t.card.clone(),
        title: t.title.clone(),
        details: t.details.clone(),
        lat_e6: t.lat_e6,
        lon_e6: t.lon_e6,
        radius_m: t.radius_m,
        reward: U128(t.reward),
        status: t.status.clone(),
        created_ms: U64(t.created_ms),
        worker: t.worker.clone(),
        claimed_ms: t.claimed_ms.map(U64),
        proof_hash: t.proof_hash.clone(),
        verdict_hash: t.verdict_hash.clone(),
        settled_ms: t.settled_ms.map(U64),
        rejections: t.rejections,
    }
}

fn require_task_text(title: &str, details: &str, lat_e6: i32, lon_e6: i32, radius_m: u32, reward: u128) {
    require!(!title.is_empty() && title.len() <= MAX_TITLE, "Title must be 1-80 characters");
    require!(!details.is_empty() && details.len() <= MAX_DETAILS, "Details must be 1-500 characters");
    require!((-90_000_000..=90_000_000).contains(&lat_e6), "Latitude out of range");
    require!((-180_000_000..=180_000_000).contains(&lon_e6), "Longitude out of range");
    require!((10..=MAX_RADIUS_M).contains(&radius_m), "Radius must be 10 m to 50 km");
    require!(
        reward >= MIN_REWARD,
        &format!("Reward must be at least {}", NearToken::from_yoctonear(MIN_REWARD).exact_amount_display())
    );
}

impl Contract {
    #[allow(clippy::too_many_arguments)]
    fn insert_task(
        &mut self,
        poster: AccountId,
        card: Option<TokenId>,
        title: String,
        details: String,
        lat_e6: i32,
        lon_e6: i32,
        radius_m: u32,
        reward: u128,
    ) -> U64 {
        let id = self.next_task_id;
        self.next_task_id += 1;
        emit(
            "task_posted",
            serde_json::json!({ "task_id": id.to_string(), "poster": poster, "card": card, "reward": reward.to_string() }),
        );
        self.tasks.insert(
            id,
            Task {
                poster,
                card,
                title,
                details,
                lat_e6,
                lon_e6,
                radius_m,
                reward,
                status: TaskStatus::Open,
                created_ms: block_timestamp_ms(),
                worker: None,
                claimed_ms: None,
                proof_hash: None,
                verdict_hash: None,
                settled_ms: None,
                rejections: 0,
            },
        );
        U64(id)
    }

    /// Mark the task paid and send the reward (less the storage fee) to the worker.
    fn pay_worker(&mut self, task_id: u64, verdict_hash: Option<String>) -> Promise {
        let task = self.tasks.get_mut(&task_id).unwrap();
        task.status = TaskStatus::Paid;
        task.verdict_hash = verdict_hash;
        task.settled_ms = Some(block_timestamp_ms());
        let worker = task.worker.clone().unwrap();
        let net = task.reward - task.reward * PROTOCOL_BPS / 10_000;
        self.tasks_paid += 1;
        self.task_volume += task.reward;
        emit(
            "task_paid",
            serde_json::json!({ "task_id": task_id.to_string(), "worker": worker, "paid": net.to_string() }),
        );
        Promise::new(worker).transfer(NearToken::from_yoctonear(net))
    }
}

#[near]
impl Contract {
    /// Post a task and attach its reward. Anyone can call this: a person, a script or another agent.
    #[payable]
    pub fn post_task(&mut self, title: String, details: String, lat_e6: i32, lon_e6: i32, radius_m: u32) -> U64 {
        let reward = env::attached_deposit().as_yoctonear();
        require_task_text(&title, &details, lat_e6, lon_e6, radius_m, reward);
        self.insert_task(env::predecessor_account_id(), None, title, details, lat_e6, lon_e6, radius_m, reward)
    }

    /// The card owner sets the most the card may spend on one task. Zero (the default) means none.
    pub fn set_task_budget(&mut self, token_id: TokenId, max_reward: U128) {
        self.require_token_owner(&token_id);
        self.cards.get_mut(&token_id).unwrap().task_budget = max_reward.0;
    }

    /// Add NEAR to a card's treasury, for example so it can pay for its first tasks.
    #[payable]
    pub fn fund_card(&mut self, token_id: TokenId) {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach some NEAR");
        let card = self
            .cards
            .get_mut(&token_id)
            .unwrap_or_else(|| env::panic_str("Card not found"));
        card.balance += amount;
    }

    /// A verified agent, while running a card's job, posts a task paid from that
    /// card's own treasury. Limited by the budget the card's owner set.
    #[allow(clippy::too_many_arguments)]
    pub fn card_post_task(
        &mut self,
        token_id: TokenId,
        title: String,
        details: String,
        lat_e6: i32,
        lon_e6: i32,
        radius_m: u32,
        reward: U128,
    ) -> U64 {
        require!(
            self.agent_is_valid(&env::predecessor_account_id()),
            "Caller is not a verified agent"
        );
        require_task_text(&title, &details, lat_e6, lon_e6, radius_m, reward.0);
        let owner = self.token_owner(&token_id);
        let card = self.cards.get_mut(&token_id).unwrap();
        require!(reward.0 <= card.task_budget, "Reward is above this card's task budget");
        require!(reward.0 <= card.balance, "The card's treasury can't cover this reward");
        card.balance -= reward.0;
        // the card's owner at the time is recorded as the poster and may cancel it
        self.insert_task(owner, Some(token_id), title, details, lat_e6, lon_e6, radius_m, reward.0)
    }

    /// Take a task. Also takes over a claim that produced no proof within the hour.
    pub fn claim_task(&mut self, task_id: U64) {
        let who = env::predecessor_account_id();
        let task = self
            .tasks
            .get_mut(&task_id.0)
            .unwrap_or_else(|| env::panic_str("Task not found"));
        require!(task.poster != who, "You posted this task");
        let stale = task.status == TaskStatus::Claimed
            && block_timestamp_ms() >= task.claimed_ms.unwrap_or(0) + CLAIM_MS;
        require!(task.status == TaskStatus::Open || stale, "Someone is already on this task");
        task.status = TaskStatus::Claimed;
        task.worker = Some(who);
        task.claimed_ms = Some(block_timestamp_ms());
    }

    /// The worker commits to their proof. Signing this transaction ties the proof to their account.
    pub fn submit_proof(&mut self, task_id: U64, proof_hash: String) {
        require_hash(&proof_hash);
        let task = self
            .tasks
            .get_mut(&task_id.0)
            .unwrap_or_else(|| env::panic_str("Task not found"));
        require!(task.status == TaskStatus::Claimed, "Task is not claimed");
        require!(
            task.worker.as_ref() == Some(&env::predecessor_account_id()),
            "Only the person who claimed the task can submit proof"
        );
        task.status = TaskStatus::Submitted;
        task.proof_hash = Some(proof_hash);
    }

    /// A verified agent has checked the proof. Approved: the worker is paid now.
    /// Turned down: the task goes back to the worker to try again.
    pub fn settle_task(&mut self, task_id: U64, approved: bool, verdict_hash: String) -> Option<Promise> {
        require_hash(&verdict_hash);
        require!(
            self.agent_is_valid(&env::predecessor_account_id()),
            "Caller is not a verified agent"
        );
        let task = self
            .tasks
            .get_mut(&task_id.0)
            .unwrap_or_else(|| env::panic_str("Task not found"));
        require!(task.status == TaskStatus::Submitted, "No proof is waiting on this task");
        if approved {
            return Some(self.pay_worker(task_id.0, Some(verdict_hash)));
        }
        task.status = TaskStatus::Claimed;
        task.proof_hash = None;
        task.verdict_hash = Some(verdict_hash);
        task.rejections += 1;
        emit("task_proof_rejected", serde_json::json!({ "task_id": task_id }));
        None
    }

    /// Whoever posted the task accepts the proof themselves, without waiting for an agent.
    pub fn approve_task(&mut self, task_id: U64) -> Promise {
        let task = self
            .tasks
            .get(&task_id.0)
            .unwrap_or_else(|| env::panic_str("Task not found"));
        require!(task.poster == env::predecessor_account_id(), "Only the poster can approve");
        require!(task.status == TaskStatus::Submitted, "No proof is waiting on this task");
        self.pay_worker(task_id.0, None)
    }

    /// Withdraw a task nobody is working on. The reward goes back where it came from.
    pub fn cancel_task(&mut self, task_id: U64) -> Option<Promise> {
        let task = self
            .tasks
            .get_mut(&task_id.0)
            .unwrap_or_else(|| env::panic_str("Task not found"));
        let who = env::predecessor_account_id();
        require!(task.poster == who, "Only the poster can cancel");
        let stale = task.status == TaskStatus::Claimed
            && block_timestamp_ms() >= task.claimed_ms.unwrap_or(0) + CLAIM_MS;
        require!(task.status == TaskStatus::Open || stale, "Someone is working on this task");
        task.status = TaskStatus::Cancelled;
        task.settled_ms = Some(block_timestamp_ms());
        let reward = task.reward;
        emit("task_cancelled", serde_json::json!({ "task_id": task_id }));
        match task.card.clone() {
            // a card's money goes back into the card, whoever owns it now
            Some(token_id) => {
                self.cards.get_mut(&token_id).unwrap().balance += reward;
                None
            }
            None => Some(Promise::new(who).transfer(NearToken::from_yoctonear(reward))),
        }
    }

    pub fn get_task(&self, task_id: U64) -> Option<TaskView> {
        self.tasks.get(&task_id.0).map(|t| task_view(task_id.0, t))
    }

    /// Tasks, newest first.
    pub fn get_tasks(&self, from_index: Option<U64>, limit: Option<u64>) -> Vec<TaskView> {
        let skip = from_index.map(|v| v.0).unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);
        (0..self.next_task_id)
            .rev()
            .skip(skip as usize)
            .take(limit as usize)
            .filter_map(|id| self.tasks.get(&id).map(|t| task_view(id, t)))
            .collect()
    }
}
