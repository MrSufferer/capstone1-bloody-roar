// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";

describe.skipIf(!process.env.TEST_DATABASE_URL)("AttachmentStatus REJECTED (real database)", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.attachment.deleteMany({ where: { uploaderId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("stores a rejected chat attachment", async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    const user = await prisma.user.create({ data: { walletAddress: `0x${randomBytes(20).toString("hex")}`, role: "CLIENT" } });
    userIds.push(user.id);
    const attachment = await prisma.attachment.create({
      data: { uploaderId: user.id, fileName: "fake.png", fileUrl: "chat/fake.png", fileSize: 4, fileMime: "image/png", purpose: "CHAT", status: "REJECTED" },
    });
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } })).status).toBe("REJECTED");
  });
});
