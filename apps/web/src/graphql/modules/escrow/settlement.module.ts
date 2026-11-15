import { EscrowPhase } from "@bloody-roar/database";
import { builder } from "../../builder";
import { requireAuth, type GraphQLContext } from "../../context";
import { gqlError } from "../../errors";
import { createPreparedCall, escrowTarget } from "../../../lib/escrow/prepare";
import { PreparedCallRef } from "./release.module";

async function settlementProjection(ctx: GraphQLContext, issueId: string) {
  const user = requireAuth(ctx);
  const projection = await ctx.db.escrowProjection.findUnique({ where: { issueId } });
  if (!projection?.escrowKey) throw gqlError("This bounty has no escrow yet", "NOT_FOUND");
  const target = escrowTarget();
  if (projection.chainId !== target.chainId || projection.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
    throw gqlError("Escrow does not match the configured contract", "ESCROW_CHAIN_MISMATCH");
  const wallet = user.walletAddress.toLowerCase();
  if (wallet !== projection.client.toLowerCase() && wallet !== projection.developer.toLowerCase())
    throw gqlError("Only the parties can settle", "FORBIDDEN");
  if (projection.phase === EscrowPhase.RESOLVED || projection.phase === EscrowPhase.NONE)
    throw gqlError("This escrow cannot be settled", "INVALID_PHASE");
  return { user, projection: { ...projection, escrowKey: projection.escrowKey }, wallet };
}

builder.mutationField("prepareProposeSettlement", (t) => t.field({
  type: PreparedCallRef,
  args: { issueId: t.arg.id({ required: true }), clientBps: t.arg.int({ required: true }) },
  resolve: async (_root, args, ctx) => {
    if (args.clientBps < 0 || args.clientBps > 10000) throw gqlError("Split must be between 0 and 10000", "INVALID_BASIS_POINTS");
    const { user, projection } = await settlementProjection(ctx, String(args.issueId));
    if (projection.settlementProposer) throw gqlError("A proposal is already pending", "SETTLEMENT_PENDING");
    return createPreparedCall(ctx.db, { userId: user.id, issueId: projection.issueId, escrowKey: projection.escrowKey, method: "proposeSettlement", args: { escrowId: projection.escrowKey, clientBps: String(args.clientBps) } });
  },
}));

builder.mutationField("prepareRevokeSettlement", (t) => t.field({
  type: PreparedCallRef,
  args: { issueId: t.arg.id({ required: true }) },
  resolve: async (_root, args, ctx) => {
    const { user, projection, wallet } = await settlementProjection(ctx, String(args.issueId));
    if (!projection.settlementProposer) throw gqlError("No pending proposal", "NO_PENDING_SETTLEMENT");
    if (projection.settlementProposer.toLowerCase() !== wallet) throw gqlError("Only the proposer can withdraw", "FORBIDDEN");
    return createPreparedCall(ctx.db, { userId: user.id, issueId: projection.issueId, escrowKey: projection.escrowKey, method: "revokeSettlement", args: { escrowId: projection.escrowKey } });
  },
}));

builder.mutationField("prepareAcceptSettlement", (t) => t.field({
  type: PreparedCallRef,
  args: { issueId: t.arg.id({ required: true }) },
  resolve: async (_root, args, ctx) => {
    const { user, projection, wallet } = await settlementProjection(ctx, String(args.issueId));
    if (!projection.settlementProposer) throw gqlError("No pending proposal", "NO_PENDING_SETTLEMENT");
    if (projection.settlementProposer.toLowerCase() === wallet) throw gqlError("The proposer cannot accept their own proposal", "FORBIDDEN");
    return createPreparedCall(ctx.db, { userId: user.id, issueId: projection.issueId, escrowKey: projection.escrowKey, method: "acceptSettlement", args: { escrowId: projection.escrowKey } });
  },
}));
