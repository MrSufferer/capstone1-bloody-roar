import { createWalletClient, privateKeyToAccount, http, encodeFunctionData, decodeFunctionResult, ESCROW_ABI, type Hex } from "@bloody-roar/shared";
import type { Job, JobContext } from "../runtime/scheduler";
import { errorMessage } from "../log";

let disabledLogged = false;
export async function runAutoClaim(ctx: JobContext, sendClaim?: (recipient: string) => Promise<string>): Promise<void> {
  const { db, rpc, config, log, now } = ctx;
  if (!config.relayerPrivateKey) {
    if (!disabledLogged) { log.info({}, "auto-claim disabled: no relayer key"); disabledLogged = true; }
    return;
  }
  const contractAddress = config.escrowAddress.toLowerCase();
  const getter = async (functionName: "feeRecipient" | "claimable", recipient?: string): Promise<string | bigint> => {
    const data = encodeFunctionData({ abi: ESCROW_ABI, functionName, ...(recipient ? { args: [recipient as Hex] } : {}) });
    return decodeFunctionResult({ abi: ESCROW_ABI, functionName, data: await rpc.call<Hex>("eth_call", [{ to: contractAddress, data }, "latest"]) });
  };
  const feeRecipient = String(await getter("feeRecipient")).toLowerCase();
  const cutoff = new Date(now().getTime() - 600_000);
  // Throttle failed attempts too, even though they have no transaction hash.
  const rows = await db.$queryRaw<Array<{ address: string }>>`
    SELECT b.address FROM claimable_balances b
    WHERE b."chainId" = ${config.chainId} AND lower(b."contractAddress") = ${contractAddress}
      AND b."amountRaw" > 0 AND lower(b.address) <> ${feeRecipient}
      AND (b."autoClaimAt" IS NULL OR b."autoClaimAt" <= ${cutoff})
      AND EXISTS (SELECT 1 FROM users u WHERE lower(u."walletAddress") = lower(b.address))
    ORDER BY b."autoClaimAt" ASC NULLS FIRST, b.address LIMIT 10`;
  const wallet = sendClaim ? null : createWalletClient({ account: privateKeyToAccount(config.relayerPrivateKey as Hex), transport: http(config.rpcUrl) });
  for (const { address } of rows) {
    const where = { chainId_contractAddress_address: { chainId: config.chainId, contractAddress, address } };
    try {
      if (await getter("claimable", address) === 0n) {
        await db.claimableBalance.update({ where, data: { autoClaimAt: now() } });
        continue;
      }
      const hash = sendClaim ? await sendClaim(address) : await wallet!.writeContract({ chain: null, address: contractAddress as Hex, abi: ESCROW_ABI, functionName: "claim", args: [address as Hex] });
      await db.claimableBalance.update({ where, data: { autoClaimTxHash: hash, autoClaimAt: now() } });
    } catch (error) {
      log.warn({ address, error: errorMessage(error) }, "auto-claim failed");
      await db.claimableBalance.update({ where, data: { autoClaimAt: now() } });
    }
  }
}

export const autoClaimJob: Job = { name: "auto-claim", everyMs: 15_000, run: runAutoClaim };
