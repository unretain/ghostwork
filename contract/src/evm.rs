// Minimal EIP-1559 transaction builder. The contract builds the exact bytes it
// asks the MPC network to sign, so it knows the value being moved and can
// enforce per-token spending rules before any signature exists.
use near_sdk::json_types::{U64, U128};
use near_sdk::{env, near, require};

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct EvmTx {
    pub chain_id: U64,
    pub nonce: U64,
    pub max_priority_fee_per_gas: U128,
    pub max_fee_per_gas: U128,
    pub gas_limit: U64,
    /// 0x-prefixed 20-byte address
    pub to: String,
    /// wei
    pub value: U128,
    /// optional 0x-prefixed calldata
    pub data: Option<String>,
}

pub fn decode_hex(s: &str) -> Vec<u8> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    hex::decode(s).unwrap_or_else(|_| env::panic_str("Invalid hex"))
}

fn be_bytes(n: u128) -> Vec<u8> {
    let b = n.to_be_bytes();
    let first = b.iter().position(|x| *x != 0).unwrap_or(b.len());
    b[first..].to_vec()
}

fn rlp_prefix(len: usize, short: u8, long: u8) -> Vec<u8> {
    if len <= 55 {
        vec![short + len as u8]
    } else {
        let l = be_bytes(len as u128);
        let mut v = vec![long + l.len() as u8];
        v.extend(l);
        v
    }
}

fn rlp_bytes(b: &[u8]) -> Vec<u8> {
    if b.len() == 1 && b[0] < 0x80 {
        return vec![b[0]];
    }
    let mut v = rlp_prefix(b.len(), 0x80, 0xb7);
    v.extend_from_slice(b);
    v
}

fn rlp_uint(n: u128) -> Vec<u8> {
    rlp_bytes(&be_bytes(n))
}

fn rlp_list(items: &[Vec<u8>]) -> Vec<u8> {
    let body = items.concat();
    let mut v = rlp_prefix(body.len(), 0xc0, 0xf7);
    v.extend(body);
    v
}

impl EvmTx {
    pub fn to_address(&self) -> Vec<u8> {
        let b = decode_hex(&self.to);
        require!(b.len() == 20, "`to` must be a 20-byte address");
        b
    }

    /// keccak256(0x02 || rlp([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas,
    ///                        gasLimit, to, value, data, accessList]))
    pub fn signing_hash(&self) -> [u8; 32] {
        let data = self.data.as_deref().map(decode_hex).unwrap_or_default();
        let mut payload = vec![0x02u8];
        payload.extend(rlp_list(&[
            rlp_uint(self.chain_id.0 as u128),
            rlp_uint(self.nonce.0 as u128),
            rlp_uint(self.max_priority_fee_per_gas.0),
            rlp_uint(self.max_fee_per_gas.0),
            rlp_uint(self.gas_limit.0 as u128),
            rlp_bytes(&self.to_address()),
            rlp_uint(self.value.0),
            rlp_bytes(&data),
            rlp_list(&[]),
        ]));
        env::keccak256_array(&payload)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Expected hashes computed independently with viem:
    // keccak256(serializeTransaction({ type: "eip1559", accessList: [], ...tx }))
    #[test]
    fn signing_hash_matches_viem_simple_transfer() {
        let tx = EvmTx {
            chain_id: U64(11_155_111),
            nonce: U64(0),
            max_priority_fee_per_gas: U128(1_500_000_000),
            max_fee_per_gas: U128(30_000_000_000),
            gas_limit: U64(21_000),
            to: "0x1b48b83a308ea4beb845db088180dc3389f8aa3b".into(),
            value: U128(1_000_000_000_000_000),
            data: None,
        };
        assert_eq!(
            hex::encode(tx.signing_hash()),
            "cac4d091f10088b9d4614f1fb20bc02e450aad96f1726f534f7a32242a36708d"
        );
    }

    #[test]
    fn signing_hash_matches_viem_long_calldata() {
        let tx = EvmTx {
            chain_id: U64(11_155_111),
            nonce: U64(300),
            max_priority_fee_per_gas: U128(1),
            max_fee_per_gas: U128(2),
            gas_limit: U64(100_000),
            to: "0x0000000000000000000000000000000000000001".into(),
            value: U128(0),
            data: Some(format!("0xa9059cbb{}", "00".repeat(60))),
        };
        assert_eq!(
            hex::encode(tx.signing_hash()),
            "d61c9bec78d762ff37d93ecb3211bb243b835ec983ebc43cc903e95f2117e33d"
        );
    }
}
