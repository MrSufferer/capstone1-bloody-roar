import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, expect as baseBrowserExpect, type Browser, type BrowserContext } from "@playwright/test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "../../../tests/e2e/harness/fixture";
import { gqlAs } from "../../../tests/e2e/harness/gql";
import { login } from "../../../tests/e2e/harness/wallet";
import { walletOf } from "../../../tests/e2e/harness/funding";

let browser: Browser;
const browserExpect = baseBrowserExpect.configure({ timeout: 120_000 });
beforeAll(async () => { assertTestDatabase(process.env.TEST_DATABASE_URL); browser = await chromium.launch({ channel: "chrome" }); }, 120_000);
afterAll(() => browser?.close());
test("E34: desktop and mobile inbox keep two applicants' threads private", async () => {
  const f = await fixture();
  const open = async (applicationId: string) => {
    const result = await gqlAs(f.client, `mutation($id: ID!) { openApplicationChat(applicationId: $id) }`, { id: applicationId });
    expect(result.errors).toBeUndefined(); return result.data?.openApplicationChat as string;
  };
  const roomA = await open(f.applicationId), roomB = await open(f.rivalApplicationId);
  const texts = [`Private applicant A ${f.issueId}`, `Private applicant B ${f.issueId}`];
  for (const [n, room] of [roomA, roomB].entries()) {
    const result = await gqlAs(f.client, `mutation($id: ID!, $text: String!) { sendMessage(conversationId: $id, content: $text) { id } }`, { id: room, text: texts[n] });
    expect(result.errors).toBeUndefined();
  }
  const contexts: BrowserContext[] = [];
  try {
    for (const user of [f.client, f.rival]) {
      const cookie = (await login(walletOf(f, user))).cookie, separator = cookie.indexOf("=");
      const context = await browser.newContext(); contexts.push(context);
      await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: "http://localhost:4012" }]);
    }
    const page = await contexts[0]!.newPage(); page.setDefaultTimeout(120_000);
    await page.goto(`http://localhost:4012/messages?c=${roomA}`);
    // The existing chat section has an accessible label; locate it directly across both screen sizes.
    const room = page.locator('section[aria-label="Task chat"]');
    await browserExpect(room.getByText(texts[0]!, { exact: true })).toBeVisible();
    await page.getByTestId(`conversation-${roomB}`).click();
    await browserExpect(room.getByText(texts[1]!, { exact: true })).toBeVisible();
    await browserExpect(room.getByText(texts[0]!, { exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Back to conversations" }).click();
    await browserExpect(page.getByTestId(`conversation-${roomA}`)).toBeVisible();
    const rival = await contexts[1]!.newPage(); rival.setDefaultTimeout(120_000);
    const unread = (await gqlAs(f.rival, `{ myUnreadMessageTotal }`)).data?.myUnreadMessageTotal as number;
    expect(unread).toBeGreaterThan(0);
    await rival.goto(`http://localhost:4012/messages?c=${roomA}`);
    await browserExpect(rival.getByTestId(`conversation-${roomB}`)).toBeVisible();
    await browserExpect(rival.getByTestId(`conversation-${roomB}`).getByLabel("1 unread messages")).toBeVisible();
    await browserExpect(rival.getByRole("link", { name: `Messages, ${unread} unread`, exact: true })).toBeVisible();
    await browserExpect(rival.getByTestId(`conversation-${roomA}`)).toHaveCount(0);
    await browserExpect(rival.getByText(texts[0]!, { exact: true })).toHaveCount(0);
    const denied = await gqlAs(f.rival, `query($id: ID!) { messages(conversationId: $id) { edges { node { content } } } }`, { id: roomA });
    expect(denied.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    await rival.getByTestId(`conversation-${roomB}`).click();
    await browserExpect(rival.locator('section[aria-label="Task chat"]').getByText(texts[1]!, { exact: true })).toBeVisible();
    await browserExpect(rival.getByRole("link", { name: unread > 1 ? `Messages, ${unread - 1} unread` : "Messages", exact: true })).toBeVisible();
  } finally { for (const context of contexts) await context.close(); }
}, 240_000);
