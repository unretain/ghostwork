#!/usr/bin/env bash
# Deploy the GHOSTWORK contract to NEAR mainnet. This spends real NEAR.
#
#   scripts/deploy-mainnet.sh <contract-id> <owner-id> <agent-account-id> [near-to-fund]
#
#   contract-id       account to create and deploy to, e.g. ghostwork.you.near
#   owner-id          your funded mainnet account; it pays, and becomes the contract owner
#   agent-account-id  the id the agent service prints on start ("Agent account ID: ...")
#   near-to-fund      NEAR moved into the contract account (default 11). The contract code
#                     is about 950 KB and NEAR locks 1 NEAR per 100 KB of storage, so about
#                     9.5 NEAR is locked for as long as the code is deployed.
#
# Needs near-cli-rs (`near`) with the owner's key in the legacy keychain
# (near account import-account ... network-config mainnet), and a built
# contract at contract/target/near/ghostwork.wasm.
set -euo pipefail

CONTRACT="${1:?contract id}"
OWNER="${2:?owner id}"
AGENT="${3:?agent account id}"
FUND="${4:-11}"
NET="network-config mainnet sign-with-legacy-keychain send"
WASM="$(dirname "$0")/../contract/target/near/ghostwork.wasm"
ZERO96="000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
ZERO64="0000000000000000000000000000000000000000000000000000000000000000"

[ -f "$WASM" ] || { echo "Build the contract first: $WASM is missing"; exit 1; }
read -r -p "Create $CONTRACT on MAINNET, funded with $FUND real NEAR from $OWNER? Type yes: " ok
[ "$ok" = "yes" ] || exit 1

call() { # call <method> <json-args>
  near contract call-function as-transaction "$CONTRACT" "$1" json-args "$2" \
    prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as "$OWNER" $NET
}

near account create-account fund-myself "$CONTRACT" "$FUND NEAR" autogenerate-new-keypair save-to-legacy-keychain sign-as "$OWNER" $NET
sleep 4

near contract deploy "$CONTRACT" use-file "$WASM" with-init-call new \
  json-args "{\"requires_tee\":false,\"attestation_expiration_time_ms\":\"604800000\",\"owner_id\":\"$OWNER\",\"mpc_contract_id\":\"v1.signer\"}" \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' $NET

# requires_tee is false: the owner approves the agent by hand. The placeholder
# measurements below are what an agent outside a TEE registers with.
call approve_measurements "{\"measurements\":{\"rtmrs\":{\"mrtd\":\"$ZERO96\",\"rtmr0\":\"$ZERO96\",\"rtmr1\":\"$ZERO96\",\"rtmr2\":\"$ZERO96\"},\"key_provider_event_digest\":\"$ZERO96\",\"app_compose_hash_payload\":\"$ZERO64\"}}"
call approve_ppids '{"ppids":["00000000000000000000000000000000"]}'
call whitelist_agent_for_local "{\"account_id\":\"$AGENT\"}"

near contract call-function as-read-only "$CONTRACT" get_stats json-args '{}' network-config mainnet now
echo
echo "Deployed: $CONTRACT"
echo "Website:  VITE_NETWORK=mainnet and VITE_CONTRACT_ID=$CONTRACT in .env.local"
echo "Agent:    NEAR_NETWORK=mainnet and AGENT_CONTRACT_ID=$CONTRACT in agent/.env, with a mainnet SPONSOR account"
