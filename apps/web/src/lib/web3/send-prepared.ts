import { ethers } from "ethers";
import { ensureActiveChain } from "./client";

// One call the server prepared for the wallet to sign and send.
export type PreparedCall = { intentId: string; contractAddress: string; data: string; value: string };

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

// Signer for the injected wallet, connected, on the active chain, and on the signed-in account.
export async function walletSigner(expected: string): Promise<ethers.providers.JsonRpcSigner> {
  await ensureActiveChain();
  const ethereum = (globalThis as unknown as { ethereum?: ethers.providers.ExternalProvider }).ethereum;
  if (!ethereum) throw new Error("The Web3 wallet is not ready.");
  const provider = new ethers.providers.Web3Provider(ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();
  const actual = await signer.getAddress();
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Your wallet has ${short(actual)} selected, not the signed-in account ${short(expected)}. Switch accounts in the wallet and try again.`);
  }
  return signer;
}

// Sends the prepared calls one after another; each is recorded against its intent before its receipt is awaited.
export async function sendPreparedCalls(calls: PreparedCall[], record: (intentId: string, txHash: string) => Promise<void>, expected: string): Promise<string[]> {
  const signer = await walletSigner(expected);
  const hashes: string[] = [];
  for (const call of calls) {
    const tx = await signer.sendTransaction({ to: call.contractAddress, data: call.data, value: ethers.BigNumber.from(call.value) });
    await record(call.intentId, tx.hash);
    const receipt = await tx.wait(1);
    if (receipt.status !== 1) throw new Error("The transaction failed on-chain.");
    hashes.push(tx.hash);
  }
  return hashes;
}
