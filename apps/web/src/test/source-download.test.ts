// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: string },
  source: { id: "source", status: "READY", storagePath: "", issue: { clientId: "client", developerId: "dev", status: "IN_PROGRESS" } },
}));
vi.mock("@/lib/auth", () => ({ tokenFromRequest: () => state.user ? "session" : null, verifyJWT: async () => state.user }));
vi.mock("@bloody-roar/database", () => ({ prisma: { sourceSnapshot: { findUnique: async () => state.source } } }));
vi.mock("@/lib/storage", () => ({ localUploadPath: () => ({ root: "/repo/apps/web/.uploads" }) }));
import { GET } from "../app/api/source-snapshots/[id]/route";

let root: string;
beforeAll(async () => { root = await mkdtemp(path.join(tmpdir(), "br-source-download-")); vi.stubEnv("SNAPSHOT_DIR", root); });
afterAll(async () => { await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs(); });
it("downloads pinned bytes only for task parties, with admins limited to disputes and paths limited to regular snapshot files", async () => {
  const file = path.join(root, "source.tar.gz"); await writeFile(file, "pinned source"); state.source.storagePath = file;
  const get = () => GET(new Request("http://localhost/api/source-snapshots/source"), { params: { id: "source" } });
  expect((await get()).status).toBe(401);
  state.user = { id: "outsider", role: "DEVELOPER" }; expect((await get()).status).toBe(403);
  state.user = { id: "admin", role: "ADMIN" }; expect((await get()).status).toBe(403);
  state.source.issue.status = "DISPUTED";
  expect(await (await get()).text()).toBe("pinned source");
  for (const id of ["client", "dev"]) {
    state.user = { id, role: id === "client" ? "CLIENT" : "DEVELOPER" };
    const response = await get(); expect(response.status).toBe(200);
    expect(await response.text()).toBe("pinned source"); expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  state.source.storagePath = `${root}-outside/file`; expect((await get()).status).toBe(404);
  const link = path.join(root, "link.tar.gz"); await symlink(file, link);
  state.source.storagePath = link; expect((await get()).status).toBe(404);
});
