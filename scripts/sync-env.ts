// scripts/sync-env.ts
// Synchronize .env with the deployed contract manifest from apps/contracts/deployments/localhost.json

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface DeploymentManifest {
  address: string;
  deployBlock: number;
}

async function main() {
  const manifestPath = resolve(process.cwd(), "apps/contracts/deployments/localhost.json");
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(manifestPath)) {
    console.error(`Manifest file not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifestRaw = await readFile(manifestPath, "utf8");
  const m = JSON.parse(manifestRaw) as DeploymentManifest;

  let env = existsSync(envPath) ? await readFile(envPath, "utf8") : "";

  const set = (k: string, v: string) => {
    const re = new RegExp(`^${k}=.*$`, "m");
    env = re.test(env) ? env.replace(re, `${k}=${v}`) : `${env.trimEnd()}\n${k}=${v}\n`;
  };

  set("ESCROW_ADDRESS", `"${m.address}"`);
  set("ESCROW_CONTRACT_ADDRESS", m.address);
  set("ESCROW_DEPLOY_BLOCK", String(m.deployBlock));

  await writeFile(envPath, env, "utf8");
  console.log(`Synced .env with localhost.json: ${m.address} (deployBlock: ${m.deployBlock})`);
}

main().catch((err) => {
  console.error("Failed to sync .env:", err);
  process.exit(1);
});
