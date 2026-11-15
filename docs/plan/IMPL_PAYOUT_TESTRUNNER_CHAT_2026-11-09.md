# Kế hoạch triển khai: auto-claim, review window, test runner, chat nhiều người

Ngày: 2026-11-09. Người thực hiện: Claude Haiku (Claude Code). Người duyệt: trongkhoi.
Bối cảnh và lý do: `docs/plan/PAYOUT_TESTRUNNER_CHAT_PLAN_2026-11-09.md`. File này chỉ ghi **làm gì, làm ở đâu, kiểm tra thế nào**.

---

## 0. Quyết định đã chốt (sửa ở đây nếu khác)

| # | Câu hỏi | Chốt |
|---|---|---|
| D1 | Tự release khi test pass? | **Không.** Client vẫn ký `releaseFunds`. Review window tính từ lúc dev nộp (7 ngày), hết hạn thì dev tự nhận tiền. |
| D2 | Dev nộp code thế nào? | **File `.patch`/`.diff`** upload như file DELIVERY. Repo GitHub public thì chấp nhận thêm `commitSha`. |
| D3 | Test ẩn? | **Không làm.** Mọi test đều công khai cho dev. |
| D4 | Chat với ứng viên trước khi chọn? | **Có.** Mỗi đơn ứng tuyển có 1 phòng, AI guard bật. |
| D5 | Ai trả gas auto-claim? | **Platform** (ví relayer). |
| D6 | Nguồn code cho test runner | **GitHub public** (phase 3) và **upload .zip** (phase 3, task cuối). Repo private qua GitHub App: **không làm** ở đợt này. |
| D7 | Framework test hỗ trợ | **vitest** (JS/TS) và **pytest** (Python). Ngôn ngữ khác: không làm. |

Ngoài phạm vi: verifier tự release on-chain, DIRECT chat ngoài issue, test ẩn, GitHub App, nộp lại sau deadline.

---

## 1. Quy tắc làm việc cho Haiku

### 1.1 Trước khi bắt đầu mỗi phiên

1. `git status`. Working tree hiện có nhiều file đã sửa **không thuộc kế hoạch này**. Không commit, không revert chúng. Nếu chưa có nhánh, tạo `feat/payout-testrunner-chat` từ HEAD hiện tại.
2. Gọi skill `ponytail:ponytail` (mức `full`). Mọi task theo nguyên tắc diff ngắn nhất.
3. Chỉ đọc **mục của phase đang làm** trong file này (dùng `Read` với `offset`/`limit`), không đọc cả file mỗi lần.
4. Tìm checkbox `- [ ]` đầu tiên trong mục 8 (Tiến độ). Đó là task tiếp theo.

### 1.2 Bảng gọi skill / tool

| Khi nào | Gọi gì | Vì sao |
|---|---|---|
| Đầu mỗi phiên | `Skill: ponytail:ponytail` | Giữ diff nhỏ, không thêm abstraction |
| Cần hiểu một hàm, file, luồng | `codegraph_explore` (MCP) hoặc `codegraph explore "<tên symbol>"` | Một lần gọi trả source có số dòng và người gọi. **Không** grep rồi Read cả file |
| Cần xem file không index (prisma, sol, json, md) | `Read` với `offset`/`limit`, hoặc `grep -n` trước để biết dòng | Tiết kiệm token |
| Task có logic tiền, quyền, gate, contract | `Skill: mattpocock-skills:tdd` | Viết test đỏ trước, rồi code cho xanh |
| Test fail không rõ lý do, hoặc sửa 2 lần vẫn fail | `Skill: mattpocock-skills:diagnosing-bugs` | Tránh đoán mò, tránh vòng lặp |
| Task chạm Docker sandbox, upload, quyền chat | `Skill: security-review` sau khi xong task | Code của dev là code không tin cậy |
| Cuối mỗi phase | `Skill: code-review` với mức `low`, sau đó `Skill: simplify` | Bắt bug trước khi commit, cắt code thừa |
| Kiểm tra UI | `Skill: playwright-cli` (chỉ CLI) | Global CLAUDE.md cấm điều khiển trình duyệt bằng screenshot/click |
| Review lớn nhiều file | `repomix --compress <thư mục>` | Lấy AST gọn thay vì đọc từng file |

**Không** dùng Workflow/subagent. **Không** dùng Artifact cho plan. Không đọc `apps/web/src/graphql/generated/pothos-types.ts` (file sinh tự động, rất dài). Sinh lại bằng `bun run db:generate`.

### 1.3 Cổng kiểm tra cuối mỗi task

```bash
bun run typecheck
bun run lint
# cộng test riêng của task, ghi trong từng task
```

Task chỉ được tick khi cả ba xanh. Sau đó commit **chỉ các file của task**:

```bash
git add <các file của task>
git commit -m "<type>(<scope>): <mô tả>

Claude-Session: https://claude.ai/code/session_01WUZQcT8K1m3eXXwisM3WLe"
```

Rồi đổi `- [ ]` thành `- [x]` trong mục 8 và commit luôn file này.

### 1.4 Dừng lại và hỏi người dùng khi

- Test cần DB mà `TEST_DATABASE_URL` chưa có (phải là Postgres, tên DB kết thúc `_test`, xem `packages/database/src/test-guard.ts`).
- Cần deploy contract lên Base Sepolia (chỉ deploy local được tự làm).
- Phải đổi logic chia tiền, phí, hoặc quyền gọi hàm contract ngoài những gì ghi ở đây.
- Một task sửa quá 3 lần vẫn đỏ.
- Cần thêm dependency ngoài danh sách cho phép ở từng task.

### 1.5 Quy ước code của repo

- Runtime `bun`. Không dùng npm/pnpm (trừ `apps/contracts` đã có `package-lock.json`, vẫn chạy qua `bun run contracts:*`).
- GraphQL: Pothos, mỗi module tự `builder.mutationField/queryField`, lỗi qua `gqlError(message, CODE)`, input qua zod + `parseOrThrow`.
- Ghi DB có cạnh tranh: `$transaction` + `SELECT ... FOR UPDATE` + `Serializable`, như `draft.module.ts`.
- Notification: `createNotificationIdempotent` + `notifyNotificationCreated` (worker) hoặc `pg_notify` (web).
- Worker job: export `Job`, thêm vào mảng trong `apps/worker/src/jobs/index.ts`.
- Comment chỉ ghi "vì sao". Shortcut có giới hạn thì ghi `// shortcut: <giới hạn>, <khi nào nâng cấp>`.
- Text UI hiện đang lẫn Anh/Việt. Theo ngôn ngữ của file đang sửa.

---

## 2. Phase 1: Auto-claim, tiền tự về ví dev

Mục tiêu: sau `EscrowResolved`, worker tự gọi `claim(dev)`. Dev không phải bấm gì, không tốn gas.
Cơ sở: `claim(address recipient)` trong `BloodyRoarEscrow.sol` ai gọi cũng được, tiền luôn về `recipient`.

### Task 1.1: Export wallet client từ shared

- File: `packages/shared/src/index.ts`.
- Thêm vào dòng export viem: `createWalletClient`. Thêm dòng `export { privateKeyToAccount } from "viem/accounts";`.
- Không thêm dependency (viem 2.57.5 đã có trong `packages/shared`).
- Kiểm tra: `bun run typecheck`.

### Task 1.2: Schema theo dõi auto-claim

- File: `packages/database/prisma/schema.prisma`, model `ClaimableBalance`.
- Thêm:
  ```prisma
  autoClaimTxHash String?
  autoClaimAt     DateTime?
  ```
- Chạy `bun run db:migrate -- --name claimable_auto_claim` (sinh migration + pothos types).
- Kiểm tra: `bun run typecheck`.

### Task 1.3: Config relayer

- File: `apps/worker/src/config.ts`.
- Thêm vào `WorkerConfig`: `relayerPrivateKey: string | undefined`, `relayerMinGasWei: bigint`.
- Đọc `RELAYER_PRIVATE_KEY` (tùy chọn; nếu có phải khớp `/^0x[0-9a-fA-F]{64}$/`, sai thì push vào `errors`), `RELAYER_MIN_GAS_WEI` (mặc định `"1000000000000000"` = 0.001 ETH).
- Thêm 2 biến vào `.env.example` (nếu file có), kèm comment 1 dòng.
- Test: thêm case vào `apps/worker/test/config.test.ts`: key sai định dạng thì throw; không có key thì `undefined`.
- Kiểm tra: `cd apps/worker && bun test test/config.test.ts`.

### Task 1.4: Job auto-claim (gọi skill `tdd`)

- File mới: `apps/worker/src/jobs/auto-claim.ts`. Đăng ký trong `jobs/index.ts`.
- Đọc trước bằng codegraph: `intentsJob`, `contractConfigJob` (cách job lấy config, db, rpc), `applyClaimed`.
- Logic mỗi tick:
  1. Không có `relayerPrivateKey` thì return (log `info` một lần duy nhất).
  2. Đọc `feeRecipient()` của contract bằng `eth_call` (dùng ABI từ `@bloody-roar/shared`).
  3. Lấy tối đa 10 dòng `ClaimableBalance` với: `chainId`, `contractAddress` khớp config; `amountRaw > 0`; `address != feeRecipient`; (`autoClaimTxHash` null **hoặc** `autoClaimAt < now - 10 phút`); `address` khớp `User.walletAddress` (không phân biệt hoa thường).
  4. Với mỗi dòng: `eth_call claimable(address)`. Bằng 0 thì bỏ qua (indexer chưa kịp). Lớn hơn 0 thì gửi `claim(address)` bằng `createWalletClient` + `privateKeyToAccount`, rồi `update` `autoClaimTxHash`, `autoClaimAt = now`.
  5. Lỗi gửi tx: log `warn`, set `autoClaimAt = now` (để thử lại sau 10 phút), không throw (một ví lỗi không chặn ví khác).
- Không đổi `applyClaimed`. Khi event `Claimed` về, `amountRaw` thành 0 nên dòng tự rơi khỏi điều kiện.
- Test mới `apps/worker/test/auto-claim.test.ts` (mock rpc/wallet theo `test/helpers.ts`):
  - không có key thì không gửi gì;
  - `claimable` on-chain = 0 thì không gửi;
  - fee recipient bị loại;
  - đã gửi < 10 phút trước thì không gửi lại;
  - một dòng lỗi thì dòng sau vẫn được gửi.
- Kiểm tra: `cd apps/worker && bun test test/auto-claim.test.ts`.

### Task 1.5: Cảnh báo relayer hết gas

- File: `apps/worker/src/alerts.ts`. Đọc cách các alert khác được tạo trước.
- Nếu có relayer key: `eth_getBalance(relayerAddress) < relayerMinGasWei` thì bắn alert `RELAYER_LOW_GAS` (dùng cơ chế dedupe sẵn có của alerts).
- Test thêm vào `apps/worker/test/alerts.test.ts`.

### Task 1.6: UI Dashboard

- `apps/web/src/graphql/modules/escrow/release.module.ts`: `ClaimableBalanceRef` thêm `autoClaimPending: Boolean` = `autoClaimTxHash != null`.
- `apps/web/src/components/dashboard/dashboard-view.tsx`: query lấy thêm `autoClaimPending`. Nếu có dòng đang pending, hiện dòng chữ "Đang tự chuyển về ví của bạn…" cạnh số dư. **Giữ nút Claim** làm dự phòng.
- Kiểm tra: typecheck, lint, `bun run --cwd apps/web test`.

### Task 1.7: Kiểm tra end-to-end local

- Chạy Hardhat node, deploy local, worker với `RELAYER_PRIVATE_KEY` = một account Hardhat **khác** client/dev/fee.
- Làm 1 vòng: tạo issue → fund → submit → release. Trong ≤ 1 phút, `Claimed` xuất hiện, số dư USDC của dev tăng, `ClaimableBalance.amountRaw = 0`.
- Ghi lệnh đã chạy và kết quả vào `docs/RUNBOOK.md` mục "Auto-claim".
- Cuối phase: `code-review low`, `simplify`, commit.

---

## 3. Phase 2: Review window tính từ lúc nộp (sửa contract)

Hiện tại: `claimReviewTimeout` dùng `deliveryDeadline + REVIEW_PERIOD`. Sau sửa: `submittedAt + REVIEW_PERIOD`, với `submittedAt` = thời điểm `submitWork` **gần nhất**.
Phải deploy lại contract. Escrow trên contract cũ không đổi.

Gọi skill `mattpocock-skills:tdd` cho cả phase.

### Task 2.1: Test contract trước

- `apps/contracts/test/BloodyRoarEscrow.test.ts`: thêm test:
  - nộp ở ngày 1 thì `claimReviewTimeout` revert ở `submittedAt + 7d - 1`, thành công ở `submittedAt + 7d`;
  - nộp lại ở ngày 3 thì mốc dời sang `ngày3 + 7d`;
  - review timeout vẫn được dù đã qua `deliveryDeadline`.
- Sửa các test cũ đang dùng mốc `deliveryDeadline + REVIEW_PERIOD`.
- Chạy `bun run contracts:test`, xác nhận test mới **đỏ**.

### Task 2.2: Sửa contract

- `apps/contracts/contracts/BloodyRoarEscrow.sol`:
  - `struct Escrow`: thêm `uint256 submittedAt;` **ở cuối struct**.
  - `deposit`: khởi tạo `submittedAt: 0`.
  - `submitWork`: `escrow.submittedAt = block.timestamp;`
  - `claimReviewTimeout`: `uint256 deadline = escrow.submittedAt + REVIEW_PERIOD;`
- Không đổi gì khác. `deposit` vẫn giữ check `deliveryDeadline > type(uint256).max - REVIEW_PERIOD`.
- Cập nhật test Foundry nếu có dùng mốc cũ: `apps/contracts/test/foundry/BloodyRoarEscrow.t.sol`.
- Kiểm tra: `bun run contracts:test`; nếu máy có `forge`: `cd apps/contracts && forge test --offline`.

### Task 2.3: ABI và fold

- Đọc đầu file `apps/contracts/scripts/export-abi.ts` để biết cách chạy và file đích. Chạy nó, xác nhận `packages/shared/src/escrow/abi.ts` (và/hoặc `packages/shared/src/escrow-abi.ts`) đổi đúng struct `getEscrow`.
- `packages/shared/src/escrow/fold.ts`: state thêm `submittedAt` (lấy `blockTimestamp` của event `WorkSubmitted`); dòng ~359 đổi điều kiện review timeout sang `state.submittedAt + REVIEW_PERIOD`.
- Test: `apps/web/src/test/escrow-core/fold.test.ts` thêm case như 2.1. Chạy `bun run --cwd apps/web test -- escrow-core`.

### Task 2.4: Projection và server

- `grep -rn "reviewDeadline" apps packages --include='*.ts'` (bỏ node_modules). Mọi chỗ tính `reviewDeadline = deliveryDeadline + 7d` đổi thành: lúc FUNDED = `deliveryDeadline + 7d` (giữ giá trị cũ cho đến khi có bài nộp); lúc `WorkSubmitted` = `blockTimestamp + 7d`.
- Sửa comment ở `schema.prisma` dòng `reviewDeadline` cho đúng.
- `release.module.ts` `prepareClaimReviewTimeout` đã dùng `projection.reviewDeadline`, không phải sửa.
- Test worker liên quan: `apps/worker/test/effects-escrow.test.ts`, `scanner-projection.test.ts`, `deadlines.test.ts` (cần `TEST_DATABASE_URL`).

### Task 2.5: Deploy local + docs

- `bun run contracts:deploy`, cập nhật `ESCROW_ADDRESS`/`ESCROW_DEPLOY_BLOCK` trong `.env`, chạy lại seed demo theo `docs/LOCAL_DEV.md`.
- `docs/ESCROW_INTEGRATION.md`: sửa mô tả review window.
- **Không** deploy Base Sepolia. Ghi vào mục 8 là cần người dùng làm.
- Cuối phase: `code-review low`, commit.

---

## 4. Phase 3: Test case thực thi + test runner

Luồng tổng:
```
Client gắn source (GitHub public + ref, hoặc .zip)
  → worker tạo SourceSnapshot (tar.gz + context text)
  → client bấm "Generate" → AI sinh BDD + testCode
  → worker chạy BASE_CHECK: test bug phải FAIL trên code lỗi
  → client approve (chỉ approve được case đã qua BASE_CHECK đúng kỳ vọng)
  → hash testCode vào termsHash → chọn dev → fund
  → dev upload .patch → bấm "Chạy test" → worker chạy SUBMISSION
  → PASSED mới được prepareSubmitWork → client thấy kết quả cạnh nút Release
```

### Task 3.1: Schema

`packages/database/prisma/schema.prisma`:

```prisma
enum SourceSnapshotStatus { PENDING READY FAILED }
enum TestRunKind { BASE_CHECK SUBMISSION }
enum TestRunStatus { QUEUED RUNNING PASSED FAILED ERROR TIMEOUT }
enum TestFramework { VITEST PYTEST }

model SourceSnapshot {
  id           String               @id @default(cuid())
  issueId      String               @unique
  issue        Issue                @relation(fields: [issueId], references: [id], onDelete: Cascade)
  repoUrl      String?              // https://github.com/owner/repo
  ref          String?              // branch/tag người dùng nhập
  commitSha    String?              // sha đã resolve
  attachmentId String?              // khi upload .zip
  framework    TestFramework?
  installCommand String?
  storagePath  String?              // tar.gz trên đĩa worker
  sha256       String?
  context      String?              // cây thư mục + file liên quan, <= 80_000 ký tự
  status       SourceSnapshotStatus @default(PENDING)
  error        String?
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt
}

model TestRun {
  id           String        @id @default(cuid())
  issueId      String
  issue        Issue         @relation(fields: [issueId], references: [id], onDelete: Cascade)
  submissionId String?
  submission   Submission?   @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  kind         TestRunKind
  status       TestRunStatus @default(QUEUED)
  bundleSha256 String        // sha256 của JSON [{id,testFilePath,testCode}] sắp theo id
  patchSha256  String?
  results      Json?         // [{ testCaseId, status: "passed"|"failed"|"skipped", message? }]
  log          String?       // 20_000 ký tự cuối của stdout+stderr
  startedAt    DateTime?
  finishedAt   DateTime?
  createdAt    DateTime      @default(now())
  @@index([issueId, createdAt])
  @@index([status, createdAt])
}
```

`TestCase` thêm:
```prisma
testFilePath   String?   // tương đối, nằm dưới __bloodyroar__/
testCode       String?
expectBaseFail Boolean   @default(true)  // false = test regression, phải PASS trên base
baseStatus     String?   // "passed" | "failed" | null, từ BASE_CHECK gần nhất
```
Thêm quan hệ ngược ở `Issue` và `Submission`. Chạy `bun run db:migrate -- --name test_runner`.

### Task 3.2: Cho phép upload .patch và nguồn .zip

- `packages/shared/src/constants/index.ts` `ALLOWED_FILE_TYPES`: thêm `"text/x-diff"`, `"text/x-patch"`. Kiểm tra trong `/api/uploads` có so magic bytes/mime không. Có thì cho phép file text với 2 mime này.
- `AttachmentPurpose`: thêm `SOURCE`. Upload `.zip` với purpose `SOURCE` chỉ client của issue được làm, issue phải `OPEN`. Sửa chỗ kiểm quyền purpose trong `apps/web/src/app/api/uploads/route.ts` theo đúng mẫu các purpose khác.
- Gọi `security-review` sau task này.

### Task 3.3: GraphQL `setIssueSource`

- File mới: `apps/web/src/graphql/modules/issue/issue-source.module.ts` (import vào nơi các module được đăng ký; tìm bằng codegraph `schema`).
- `setIssueSource(issueId, repoUrl?, ref?, attachmentId?)`:
  - chỉ client, issue `OPEN`, dùng `lockCriteriaIssue` (export nó từ `ai.module.ts`);
  - đúng một trong hai: `repoUrl` (phải `https://github.com/<owner>/<repo>`, không `.git`, không query) **hoặc** `attachmentId` (purpose `SOURCE`, của issue này);
  - upsert `SourceSnapshot` về `PENDING`, xóa `commitSha/storagePath/sha256/context/error`;
  - xóa `testCode`/`baseStatus` của mọi TestCase chưa approve; tăng `termsVersion`.
- Query `issueSource(issueId)`: client thấy đủ; người khác chỉ thấy khi snapshot `READY` (trả `repoUrl, commitSha, framework, status`, không trả `context`).

### Task 3.4: Worker job snapshot

- File mới: `apps/worker/src/jobs/source-snapshot.ts`, đăng ký trong `jobs/index.ts`.
- Env: `SNAPSHOT_DIR` (mặc định `<repo>/.data/snapshots`), `TEST_RUNNER_ENABLED` (mặc định `false`; tắt thì job return).
  `// shortcut: snapshot nằm trên đĩa worker, chạy nhiều worker thì chuyển sang S3`
- Mỗi tick lấy 1 snapshot `PENDING` (`FOR UPDATE SKIP LOCKED` qua `$queryRaw`):
  - **GitHub**: `git ls-remote <repoUrl> <ref || HEAD>` lấy sha → `git clone --filter=blob:none --no-checkout` vào thư mục tạm → `git checkout <sha>` → `git archive --format=tar.gz`. Gọi bằng `Bun.spawn` với mảng tham số (**không** dùng shell string), timeout 120s.
  - **Zip**: đọc file attachment. Nếu cần đọc storage, copy ≤ 20 dòng logic đọc từ `apps/web/src/lib/storage.ts` sang `apps/worker/src/storage.ts`. **Không** import từ `apps/web`. Giải nén bằng `unzip -q` vào thư mục tạm; từ chối nếu có đường dẫn `..` hoặc tuyệt đối, tổng > 200 MB, hoặc > 20 000 file. Sau đó `tar czf`.
  - Phát hiện framework: có `package.json` chứa `vitest` thì `VITEST`, `installCommand = "bun install --ignore-scripts"`; có `pyproject.toml`/`requirements.txt` thì `PYTEST`, `installCommand = "pip install -r requirements.txt pytest"` (hoặc `pip install . pytest`). Không nhận ra thì `FAILED` với `error = "Unsupported project: need vitest or pytest"`.
  - `context`: cây thư mục (bỏ `node_modules`, `.git`, `dist`, file nhị phân), tối đa 400 dòng; rồi nội dung các file có tên/đường dẫn trùng từ khóa trong title/description của issue (tách từ ≥ 4 ký tự), cộng `package.json`/`pyproject.toml`, đến khi đủ 80 000 ký tự.
  - Lưu `storagePath`, `sha256` (của tar.gz), `commitSha`, `status READY`. Lỗi thì `FAILED` + `error` ≤ 500 ký tự. Luôn xóa thư mục tạm trong `finally`.
- Test `apps/worker/test/source-snapshot.test.ts`: phát hiện framework, chặn zip-slip, cắt context đúng giới hạn (test hàm thuần, không cần mạng).

### Task 3.5: Sandbox runner

- File mới: `apps/worker/src/runner/sandbox.ts`, một hàm:
  ```ts
  runInSandbox({ snapshotPath, patchPath?, files: {path, code}[], framework, installCommand, timeoutMs })
    → { status: "passed"|"failed"|"error"|"timeout", results, log }
  ```
- Các bước (mỗi lệnh dùng `Bun.spawn` với mảng tham số):
  1. Giải nén snapshot vào thư mục tạm `work/`.
  2. Có patch: `git apply --check` rồi `git apply` (chạy trong `work/` sau `git init`). Patch hỏng thì `error` "Patch does not apply".
  3. Ghi từng file test vào `work/__bloodyroar__/<path>`. Từ chối path có `..` hoặc tuyệt đối.
  4. Install (có mạng):
     `docker run --rm --network bridge --memory 2g --cpus 2 --pids-limit 512 --user 1000:1000 -v <work>:/work -w /work <image> sh -c "<installCommand>"`, timeout 5 phút.
  5. Test (**không mạng**):
     `docker run --rm --network none --memory 2g --cpus 2 --pids-limit 256 --read-only --tmpfs /tmp --user 1000:1000 -v <work>:/work -w /work <image> sh -c "<testCommand>"`, timeout 10 phút. Quá thời gian thì `docker kill`, status `timeout`.
     - VITEST: image `oven/bun:1`, `testCommand = "bunx vitest run __bloodyroar__ --reporter=json --outputFile=/work/.br-results.json"`
     - PYTEST: image `python:3.12-slim`, `testCommand = "python -m pytest __bloodyroar__ --junitxml=/work/.br-results.xml -q"`
  6. Parse kết quả: tên test phải bắt đầu `[TC:<testCaseId>]`. Map về `testCaseId`. TestCase không thấy kết quả thì `failed` với message "No result".
  7. `log` = 20 000 ký tự cuối. `finally` xóa thư mục tạm.
- Không mount gì ngoài `work/`. Không truyền env của worker vào container.
- Test `apps/worker/test/sandbox.test.ts`: parse JSON vitest, parse junit, chặn path `..`. Test chạy Docker thật đặt sau `if (!process.env.DOCKER_TESTS) test.skip`.
- Gọi `security-review` sau task này.

### Task 3.6: Worker job chạy test

- File mới: `apps/worker/src/jobs/test-runs.ts`. Lấy 1 `TestRun QUEUED` (`SKIP LOCKED`), set `RUNNING` + `startedAt`.
- Lấy test: mọi TestCase của issue có `testCode` (BASE_CHECK: tất cả; SUBMISSION: chỉ `isApproved`). Tính lại `bundleSha256`; khác giá trị trên run thì `ERROR` "Criteria changed".
- SUBMISSION: patch lấy từ attachment DELIVERY đầu tiên của submission có tên kết thúc `.patch`/`.diff` (tra qua `submission.manifest.attachments`). Không có thì `ERROR` "No patch file".
- Gọi `runInSandbox`. Lưu `status` (PASSED khi mọi case `passed`), `results`, `log`, `finishedAt`.
- BASE_CHECK: cập nhật `TestCase.baseStatus` từng case.
- Notification (idempotent): BASE_CHECK xong thì báo client; SUBMISSION xong thì báo dev.
- Run kẹt `RUNNING` > 20 phút: job `cleanup` chuyển sang `ERROR` (thêm vào `apps/worker/src/jobs/cleanup.ts`).

### Task 3.7: AI sinh test thực thi

- `apps/web/src/graphql/modules/ai/ai.module.ts`, `generateTestCases`:
  - Đọc `SourceSnapshot`. Không `READY` thì giữ hành vi cũ (chỉ BDD).
  - `READY`: thêm vào user message `framework`, `context` (đã qua `scanAndMask`). System prompt thêm yêu cầu: mỗi case trả thêm `testFilePath` (dưới `__bloodyroar__/`, đuôi `.test.ts` hoặc `test_*.py`), `testCode` (tự chứa, import từ code dự án theo đường dẫn tương đối gốc repo), `expectBaseFail` (true nếu test bắt lỗi được mô tả). Tên mỗi test **phải** bắt đầu `[TC:{{ID}}]`.
  - `GeneratedCaseSchema`: thêm `testFilePath`, `testCode` (max 20 000), `expectBaseFail` đều optional.
  - Sau `createMany`, thay `{{ID}}` trong `testCode` bằng id thật (`createMany` không trả id, nên tạo từng dòng bằng `create` trong transaction).
  - `maxTokens` = 8000 khi có source.
  - Có ít nhất 1 case có `testCode` thì tạo `TestRun BASE_CHECK QUEUED` trong cùng transaction.
- Model: không sửa code. Ghi vào `.env.example`: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL_TESTGEN` (model id do người dùng điền).
- Test: `apps/web/src/test/ai-testgen.test.ts` thêm case: có source thì prompt chứa context, có tạo BASE_CHECK; `{{ID}}` được thay.

### Task 3.8: Khóa approve theo BASE_CHECK + terms hash

- `updateTestCase`:
  - thêm `testCode`, `testFilePath`, `expectBaseFail` vào input và danh sách `editsCriteria`;
  - sửa `testCode` thì xóa `baseStatus` và tạo `BASE_CHECK` mới;
  - approve case có `testCode` chỉ khi `baseStatus === (expectBaseFail ? "failed" : "passed")`. Sai thì lỗi `TEST_NOT_VERIFIED`.
- Mutation `rerunBaseCheck(issueId)` cho client (tối đa 1 run QUEUED/RUNNING mỗi issue).
- `apps/web/src/graphql/modules/escrow/select.module.ts` `reservationTermsHash`: với case có `testCode`, nối vào `text`: `` ` | test=${sha256(testFilePath + "\n" + testCode)}` ``. **Không** đổi cấu trúc `computeTermsHash` (đang có hash vector cố định trong Foundry).
- Test: `apps/web/src/test/test-case-terms.db.test.ts` thêm case: đổi `testCode` thì termsHash đổi.

### Task 3.9: Chạy test trên submission + gate nộp bài (gọi skill `tdd`)

- `draft.module.ts`:
  - mutation mới `runSubmissionTests(submissionId)`: chỉ dev của issue, submission `DRAFT`, tối đa 1 run đang chạy mỗi issue, tối đa 20 run/ngày/issue. Tạo `TestRun SUBMISSION QUEUED` với `bundleSha256` hiện tại và `patchSha256` (sha256 của attachment patch).
  - `prepareSubmitWork`: nếu issue có TestCase approved có `testCode`, bắt buộc có `TestRun` của **chính submission này**, `status PASSED`, `bundleSha256` khớp bộ hiện tại. Thiếu thì lỗi `TESTS_NOT_PASSED`.
- Query `testRuns(issueId, submissionId?)`: client, dev, admin của issue. Trả status, results, log, thời gian.
- Test (web): gate chặn khi chưa có run / run FAILED / bundle lệch; cho qua khi PASSED.

### Task 3.10: UI

- `components/issues/create-issue-form.tsx` và/hoặc `test-case-panel.tsx`: ô "Nguồn code" (GitHub URL + branch, hoặc upload .zip), trạng thái snapshot.
- `test-case-panel.tsx`: mỗi case hiện khối code (thu gọn được), `baseStatus`, nút sửa code, nút "Chạy lại kiểm tra trên code lỗi". Nút approve disabled kèm lý do khi chưa verify.
- `issue-detail-view.tsx` (1351 dòng, **đọc bằng codegraph hoặc offset**, đừng Read cả file):
  - dev: sau khi tạo draft, nút "Chạy test", hiện kết quả từng case; nút Submit disabled đến khi PASSED;
  - client: cạnh nút Release hiện "x/y test pass" + link xem log.
- Kiểm UI bằng `playwright-cli` theo `docs/TESTING_GUIDE.md`.

### Task 3.11: Kiểm end-to-end

- Repo mẫu public nhỏ (vitest) có 1 bug cố ý. Đi hết luồng ở đầu Phase 3 trên local với `TEST_RUNNER_ENABLED=true`.
- Kiểm: BASE_CHECK đỏ đúng chỗ; patch đúng thì PASSED; patch sai thì FAILED và không submit được.
- Ghi kết quả vào `docs/TESTING_GUIDE.md` mục "Test runner".
- Cuối phase: `code-review low`, `security-review`, `simplify`, commit.

---

## 5. Phase 4: Chat nhiều hội thoại

Giữ `Message.issueId` (mọi hội thoại đợt này đều thuộc một issue). Thêm `conversationId`.

### Task 4.1: Schema

```prisma
enum ConversationKind { ISSUE_WORK APPLICATION }
enum ParticipantRole  { CLIENT DEVELOPER APPLICANT ADMIN }

model Conversation {
  id            String           @id @default(cuid())
  kind          ConversationKind
  issueId       String
  issue         Issue            @relation(fields: [issueId], references: [id], onDelete: Cascade)
  applicationId String?          @unique
  application   Application?     @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  lastMessageAt DateTime?
  createdAt     DateTime         @default(now())
  participants  ConversationParticipant[]
  messages      Message[]
  @@index([issueId, kind])
}

model ConversationParticipant {
  conversationId String
  conversation   Conversation    @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  userId         String
  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           ParticipantRole
  lastReadAt     DateTime?
  joinedAt       DateTime        @default(now())
  @@id([conversationId, userId])
  @@index([userId])
}
```
`Message`: thêm `conversationId String?` + relation + `@@index([conversationId, createdAt])`.
Một issue chỉ có **một** ISSUE_WORK: tạo partial unique index bằng SQL trong file migration:
`CREATE UNIQUE INDEX conversations_issue_work_key ON conversations("issueId") WHERE kind = 'ISSUE_WORK';`
(nếu model có `@@map`, theo đúng tên bảng thật).
Chạy `bun run db:migrate -- --name conversations --create-only`, thêm SQL index, rồi `bun run db:migrate`.

### Task 4.2: Backfill

- Script `packages/database/src/backfill-conversations.ts` (chạy bằng `bun --env-file=../../.env run src/backfill-conversations.ts`), idempotent:
  - mỗi issue có `developerId` và có message: upsert ISSUE_WORK + participant CLIENT, DEVELOPER;
  - `lastReadAt` của mỗi người = `max(readAt)` của các tin người kia gửi cho họ (null nếu chưa đọc);
  - `Message.conversationId` = id đó; `lastMessageAt` = tin cuối.
- Thêm script vào `packages/database/package.json`: `"db:backfill:conversations"`.
- Chạy trên DB local, in số dòng đã cập nhật.

### Task 4.3: Tạo hội thoại tự động

- ISSUE_WORK: tạo (upsert) khi dev được chọn. Tìm chỗ set `developerId` bằng codegraph (`select.module.ts`). Thêm participant CLIENT + DEVELOPER trong cùng transaction.
- APPLICATION: tạo khi gọi mutation mới `openApplicationChat(applicationId)` (client của issue hoặc chính ứng viên). Participant CLIENT + APPLICANT.
- ADMIN: khi issue sang `DISPUTED`, thêm admin xử lý làm participant. Tìm chỗ chuyển trạng thái trong worker `effects/` (dispute). Nếu chưa có admin cụ thể thì `canRead` cho mọi ADMIN như hiện tại, chưa thêm participant.

### Task 4.4: Quyền

- `apps/web/src/lib/chat-access.ts`: thêm
  ```ts
  canReadConversation(conv, issue, application | null, actor, isParticipant)
  canWriteConversation(...)
  ```
  - ISSUE_WORK: như `canReadIssueChat`/`canWriteIssueChat` hiện tại + phải là participant (admin đọc khi DISPUTED).
  - APPLICATION: participant đọc được mọi lúc; ghi khi `issue.status === "OPEN"` và `application.status === "PENDING"`.
- Giữ 2 hàm cũ cho đến task 4.7 rồi xóa nếu không còn ai gọi.
- Test thuần `apps/web/src/test/chat-access.test.ts` (tạo nếu chưa có): đủ ma trận kind × status × role.

### Task 4.5: GraphQL

- `chat.module.ts`:
  - `myConversations(first, after)`: hội thoại có mình là participant, sắp `lastMessageAt desc nulls last`, trả `{ id, kind, issue{id,title}, counterpart: User, lastMessage, unreadCount, canWrite }`. `unreadCount` = count tin `createdAt > lastReadAt` và `senderId != me` và `!isDeleted`. Gom 1 query `groupBy`, không N+1.
  - `messages(conversationId, first, after)`: thay `issueId`. Bỏ đoạn set `readAt` hàng loạt.
  - `markConversationRead(conversationId)`: `lastReadAt = now`.
  - `unreadMessageCount(issueId)`: giữ tên, tính theo participant ISSUE_WORK (UI đang dùng).
  - `myUnreadMessageTotal`: tổng cho badge Navbar.
- Gửi tin: mọi đường (GraphQL + socket) ghi `conversationId`, cập nhật `lastMessageAt` trong cùng transaction, giữ `guardMessage`.

### Task 4.6: Socket

- `packages/shared` (types `ClientToServerEvents`/`ServerToClientEvents`): thêm `conversation:join(conversationId, ack)`, `conversation:leave`. Payload tin nhắn thêm `conversationId`. Thêm event server `inbox:update({ conversationId, lastMessageAt, unreadDelta })`.
- `apps/web/src/socket/handlers.ts`:
  - khi kết nối, socket join room `user:<userId>`;
  - `conversation:join` kiểm `canReadConversation` rồi join `conv:<id>`;
  - tin mới emit vào `conv:<id>` và `inbox:update` vào `user:<id>` của mọi participant khác;
  - `task:join` cũ: tra ISSUE_WORK của issue rồi join room tương ứng, để UI cũ chạy được trong lúc chuyển.

### Task 4.7: UI

- `components/chat/chat-room.tsx`: prop `conversationId` thay `issueId` (giữ cách render, upload, reply). Mở phòng thì gọi `markConversationRead`.
- Trang mới `apps/web/src/app/messages/page.tsx` + `components/chat/inbox-view.tsx`:
  - desktop: trái là danh sách (tên đối phương, tiêu đề issue, tin cuối, thời gian, badge chưa đọc, lọc "Chưa đọc"); phải là `ChatRoom`;
  - mobile (< 768px): danh sách, bấm vào thì sang màn phòng, có nút quay lại;
  - nghe `inbox:update` để đẩy hội thoại lên đầu và tăng badge.
  - Dùng component có sẵn trong `components/ui`. Gọi skill `frontend-design` nếu cần chọn bố cục.
- `Navbar.tsx` / `left-sidebar`: mục "Tin nhắn" với badge `myUnreadMessageTotal`.
- Tab Bounty Chat trong `issue-detail-view.tsx`: lấy ISSUE_WORK của issue rồi render `ChatRoom conversationId`.
- Trang danh sách ứng viên (tìm bằng codegraph `Application`): nút "Nhắn tin" gọi `openApplicationChat` rồi chuyển tới `/messages?c=<id>`.
- Kiểm bằng `playwright-cli`: 1 client với 2 ứng viên → 2 hội thoại riêng, badge đúng, ứng viên A không đọc được phòng của B.

### Task 4.8: Dọn

- Khi mọi đường ghi đã có `conversationId`: migration đặt `Message.conversationId` NOT NULL, bỏ cột `Message.readAt`. Xóa `canReadIssueChat`/`canWriteIssueChat` nếu không còn ai gọi (kiểm bằng codegraph).
- Cập nhật `docs/AUTHZ_MATRIX.md` phần chat.
- Cuối phase: `code-review low`, `security-review` (quyền chat), `simplify`, commit.

---

## 6. Biến môi trường mới

| Biến | Nơi dùng | Mặc định | Ghi chú |
|---|---|---|---|
| `RELAYER_PRIVATE_KEY` | worker | không có = tắt auto-claim | Ví chỉ chứa ETH gas |
| `RELAYER_MIN_GAS_WEI` | worker | `1000000000000000` | Ngưỡng cảnh báo |
| `TEST_RUNNER_ENABLED` | worker | `false` | Cần Docker trên máy worker |
| `SNAPSHOT_DIR` | worker | `.data/snapshots` | Thêm `.data/` vào `.gitignore` nếu chưa có |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL_TESTGEN` | web | có sẵn | Người dùng điền model id |

---

## 7. Prompt dán cho Haiku

```
Bạn làm theo docs/plan/IMPL_PAYOUT_TESTRUNNER_CHAT_2026-11-09.md.
1. Đọc mục 0 và mục 1 của file đó (quy tắc, bảng skill). Gọi Skill ponytail:ponytail.
2. Tìm checkbox "- [ ]" đầu tiên ở mục 8. Đọc riêng mục của task đó.
3. Làm đúng một task: dùng codegraph_explore để đọc code, viết test trước nếu task có ghi tdd,
   rồi code, rồi chạy cổng kiểm tra ở mục 1.3.
4. Xanh thì commit các file của task, tick checkbox, commit file plan. Đỏ quá 3 lần thì dừng và báo.
5. Lặp lại bước 2 đến hết phase. Hết phase thì chạy code-review low + simplify, báo tóm tắt và dừng.
Không sửa file ngoài phạm vi task. Không đụng các thay đổi chưa commit có sẵn trong working tree.
Gặp điều kiện ở mục 1.4 thì dừng và hỏi.
```

Khuyến nghị: mỗi phase một phiên mới (`/clear` giữa các phase) để context gọn.

---

## 8. Tiến độ

### Phase 1: Auto-claim
- [x] 1.1 Export wallet client từ shared
- [x] 1.2 Schema auto-claim
- [x] 1.3 Config relayer
- [x] 1.4 Job auto-claim
- [x] 1.5 Cảnh báo hết gas
- [x] 1.6 UI Dashboard
- [x] 1.7 Kiểm end-to-end local

### Phase 2: Review window từ lúc nộp
- [x] 2.1 Test contract (đỏ)
- [x] 2.2 Sửa contract
- [x] 2.3 ABI + fold
- [x] 2.4 Projection + server
- [x] 2.5 Deploy local + docs
- [ ] 2.x (NGƯỜI DÙNG) Deploy Base Sepolia, cập nhật env production

### Phase 3: Test runner
- [x] 3.1 Schema
- [x] 3.2 Upload .patch / .zip
- [x] 3.3 `setIssueSource`
- [x] 3.4 Job snapshot
- [x] 3.5 Sandbox runner
- [x] 3.6 Job chạy test
- [x] 3.7 AI sinh test thực thi
- [x] 3.8 Khóa approve + terms hash
- [x] 3.9 Chạy test submission + gate
- [x] 3.10 UI
- [x] 3.11 Kiểm end-to-end

### Phase 4: Chat
- [x] 4.1 Schema
- [x] 4.2 Backfill
- [x] 4.3 Tạo hội thoại tự động
- [x] 4.4 Quyền
- [x] 4.5 GraphQL
- [x] 4.6 Socket
- [x] 4.7 UI inbox
- [x] 4.8 Dọn

Thứ tự phase: 1 → 2 → 3 → 4. Phase 4 độc lập, có thể làm song song với 3 trên nhánh khác.


## 9. Review và hoàn thiện bởi Codex — 2026-11-10

Khi bắt đầu review, mới có task 1.1–1.3 hoàn tất. Các task code còn lại đã được
triển khai, đọc lại các đường gọi liên quan và kiểm thử. Không tạo commit gộp
vì worktree còn nhiều thay đổi có sẵn ngoài kế hoạch này. Không dùng sub-agent.

Các lỗi/rủi ro đã xử lý:

- Điều kiện retry auto-claim trong bản kế hoạch có thể gửi lại mỗi tick sau lỗi:
  throttle bằng `autoClaimAt` cho cả thành công, lỗi và projection còn chậm.
- Review timeout, fold, projection và UI đều tính 7 ngày từ lần nộp gần nhất.
  Giữ nguyên hash vector terms; thêm fingerprint code vào text trước khi hash.
- Vitest 2 trên image chỉ có Bun có thể tạo báo cáo rỗng. Image
  `bloodyroar-test-runner:1` có Node thật để chạy Vitest, Bun cài dependency với
  `--ignore-scripts`. Missing/skipped/error không đủ điều kiện approve.
- Annotated Git tag: resolve `^{commit}` trước khi lưu `commitSha`; test đã đỏ
  với SHA tag rồi xanh với SHA commit thật.
- Draft chỉ được nộp sau PASSED của đúng submission/bundle/SHA256 patch.
  Thay source hủy xác minh và approval cũ. Upload phải hoàn tất và khớp checksum.
- Chat dùng chung persistence/AI guard cho HTTP và socket, khóa attachment/reply
  theo conversation, retry serialization conflict, recheck quyền sửa tin trong
  transaction. Read marker không chạy trước tin chưa commit; badge đúng khi
  đang chờ funding. Đồng nhất payload NOTIFY để không phát trùng.
- Seed chạy được trên DB mới: hội thoại của issue chưa chọn dev là APPLICATION;
  fixture chỉ dành cho dữ liệu demo có sẵn không tạo FK mồ côi. UI E32 dùng
  accessible label/toast hiện tại. Harness tách RPC/cache và tắt route warmup.

Kiểm chứng cuối:

| Lệnh / suite | Kết quả |
|---|---|
| `bun run typecheck` | PASS |
| `bun run lint` | PASS |
| `bun run build` | PASS |
| `DOCKER_TESTS=1 bun run --cwd apps/web test` | 661/661, 104 file, không skip |
| `DOCKER_TESTS=1 GITHUB_TESTS=1 bun run --cwd apps/worker test` | 88/88, 29 file, không skip |
| `bun run --cwd packages/database test` | 4/4 |
| `bun run --cwd apps/web test:integration` | 2/2 |
| `bun run contracts:test` | 36/36 |
| `bun run --cwd apps/contracts test:fuzz` | 13/13, mỗi invariant 512 runs, tổng 32768 calls |
| `bun run --cwd apps/contracts test:fork` | 1/1 trên Base Sepolia fork; không deploy mạng thật |
| `bun run test:e2e:backend` | 43/43 backend E2E; đã chạy lại UI riêng sau sửa selector |
| `E2E_UI_ONLY=1 bun run test:e2e:local` | 3/3 UI, gồm E32 và E34 desktop/mobile/badge |
| `git diff --check` | PASS |

Các suite DB chạy trên DB test riêng. Migration cũng đã áp lên DB hiện tại:
25 migrations up to date, giữ đủ 98 users / 367 issues / 1121 messages / 144
attachments ngay sau migration, không còn message thiếu conversation. Có backup
messages/attachments trước migration. Backfill chạy lại trả 0 dòng cần chuyển.
`db:seed:local` và `db:seed:demo` đã chạy xong; seed vẫn giữ 1121 messages.

Deploy local mới trên RPC 8545: escrow
`0xd20fFD09d17d95993b4842375fA07b2bEBc74647`, block 26; token
`0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82`. Đã cập nhật `.env`, kiểm tra ABI
`submittedAt`, manifest và env khớp. Tiến trình web/worker đang mở từ trước cần
restart để nạp code và cấu hình mới; không tự dừng các phiên đang sử dụng.

Giả định/giới hạn giữ theo kế hoạch: snapshot dùng đĩa chung một máy; native
install scripts không được bật; `commitSha` là metadata bổ sung còn runner yêu
cầu patch/diff; AI test dùng fixture xác định, không đánh giá chất lượng model
thật. Auto-claim cần relayer key/gas, test runner cần bật env; mặc định không tự
đổi các cấu hình này. `security-review`/`simplify` không có trong skill catalog
phiên này, nên đã review thủ công sandbox, upload, quyền và các đường gọi.
`forge fmt --check` còn báo formatting có sẵn trong contract/mocks ngoài thay
đổi logic; không reformat hàng loạt. Base Sepolia deploy vẫn dành cho người dùng
đúng checkbox 2.x, không thực hiện trong phiên này.
