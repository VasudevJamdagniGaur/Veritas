const { ethers } = require("ethers");
const { getEnv } = require("./env");

const ABI = [
  "function setVerified(address user, bool verified)",
  "function setTrustScore(address user, uint256 score)",
];

function getChainClient() {
  const env = getEnv();
  if (!env.CHAIN_ENABLED) return null;
  if (!env.RPC_URL || !env.SIGNER_PRIVATE_KEY || !env.VERITAS_CONTRACT_ADDRESS) {
    return null;
  }

  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const wallet = new ethers.Wallet(env.SIGNER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(env.VERITAS_CONTRACT_ADDRESS, ABI, wallet);
  return { contract };
}

async function maybeWriteVerification({ walletAddress, isVerified, trustScore }) {
  const client = getChainClient();
  if (!client) return { wrote: false, reason: "chain disabled or misconfigured" };
  if (!walletAddress) return { wrote: false, reason: "no walletAddress" };

  try {
    const tx1 = await client.contract.setVerified(walletAddress, Boolean(isVerified));
    await tx1.wait();
    const tx2 = await client.contract.setTrustScore(walletAddress, BigInt(trustScore));
    await tx2.wait();
    return { wrote: true };
  } catch (e) {
    return { wrote: false, reason: "tx failed" };
  }
}

module.exports = { maybeWriteVerification };

