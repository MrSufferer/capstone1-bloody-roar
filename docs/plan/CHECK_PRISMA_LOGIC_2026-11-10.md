# Kiểm tra lại: lỗi Prisma và logic còn dở

Ngày: 2026-11-10. Nhánh: `feat/payout-testrunner-chat`.
Bối cảnh: `docs/plan/IMPL_PAYOUT_TESTRUNNER_CHAT_2026-11-09.md` ghi nhận 32/36 checkbox đã xong (còn 2.x: deploy Base Sepolia, do người dùng làm).
File này ghi **kết quả kiểm tra thật hôm nay** và **việc cần làm tiếp**. Chưa sửa code nào ngoài việc sinh lại file generated (mục 0.2).

---

## 0. Tóm tắt

### 0.1 Lỗi Prisma bạn thấy là gì

Trên máy này, lỗi Prisma đến từ **cấu hình test**, không phải từ schema hay DB:

- Các file `test/preload.ts` (database, worker) và `src/test/setup.ts` (web) đặt `DATABASE_URL` về `postgresql://unit-tests.invalid:5432/...` khi `TEST_DATABASE_URL` không có.
- Test DB dùng `beforeAll(assertTestDatabase)` hoặc `describe` không `skipIf`, nên vẫn chạy và báo `PrismaClientInitializationError: Can't reach database server at unit-tests.invalid:5432`.
- Chạy không có `TEST_DATABASE_URL`: packages/database **1 pass / 4 fail**, worker **32 fail / 3 error**.
- Chạy có `TEST_DATABASE_URL` trỏ DB test riêng: packages/database **4/4 pass**, worker **88 pass / 0 fail / 3 skip** (3 skip là test gated bằng cờ môi trường).

Schema, migration và DB thật đều khớp (mục 1). Nếu lỗi bạn thấy đến từ dev server hoặc log worker, hãy gửi log đó. Tôi không thấy được terminal của bạn.

### 0.2 Sự cố tôi gây ra (cần bạn biết)

Khi chạy `prisma generate` để kiểm tra, generator Pothos **ghi đè** `apps/web/src/graphql/generated/pothos-types.ts`. File này đã có thay đổi chưa commit trong working tree (git status lúc đầu có `M`). Tôi đã đặt `POTHOS_OUTPUT` trỏ sang scratchpad nhưng không có tác dụng, vì `output` trong `schema.prisma` được ưu tiên. Tôi không backup trước khi chạy.

- Nội dung mới sinh từ schema hiện tại, có `conversationMemberships`, `testRuns`, `sourceSnapshot`, `conversations`. Typecheck PASS sau khi sinh lại.
- Tôi **không** khôi phục được bản cũ theo byte. VS Code không lưu lịch sử file này.
- Nếu bạn có bản cũ (stash, IDE, bản copy), so sánh `git diff`. Nếu không có, file này sinh lại được bằng `bun run db:generate`.

### 0.3 Test DB tôi đã tạo

- Tạo DB mới `bloody_roar_check_test` trong container `bloody_roar_postgres` (cổng 5433). Đã migrate 25/25.
- Không đụng các DB có sẵn. `bloody_roar_test` đang ở migration 13 (cũ hơn 12 migration) nên tôi không dùng.
- Muốn xóa: `docker exec bloody_roar_postgres psql -U postgres -c "DROP DATABASE bloody_roar_check_test"`.

---

## 1. Kết quả kiểm tra

| Lệnh / kiểm tra | Kết quả |
|---|---|
| `bun run typecheck` | PASS (chạy 2 lần, lần 2 sau khi sinh lại Pothos types) |
| `bun run lint` | PASS, không warning |
| `prisma validate` | schema hợp lệ |
| `prisma migrate status` (DB thật) | 25 migration, DB up to date |
| `prisma migrate diff` DB thật → schema | **rỗng**, không drift |
| SQL thô (`$queryRaw`, `$executeRaw`) | tên bảng khớp `@@map`; cột `requiredSkills`, `isDraft` khớp schema; SQL auto-claim chạy qua test DB đã pass |
| `bun run contracts:test` | 36 passing |
| `packages/database` test, không TEST DB | 1 pass, 4 fail (host giả) |
| `packages/database` test, có TEST DB | **4/4 pass** |
| `apps/worker` test, không TEST DB | 32 fail, 3 error (host giả) |
| `apps/worker` test, có TEST DB | **88 pass, 0 fail, 3 skip** (29 file) |
| `apps/web` test, không TEST DB | 633 pass, 28 skip (661) |
| `apps/web` test, có TEST DB | **660 pass, 1 skip** (661, 104 file) |
| Docker + GitHub gated (worker), Docker gated (web) | xem mục 1.1 |

Chạy trên DB test riêng `bloody_roar_check_test`, tuần tự, không song song. Lệnh: `TEST_DATABASE_URL=... bun test`, `bunx vitest run`.

### 1.1 Test cần Docker và mạng

- Image `bloodyroar-test-runner:1` có sẵn trên máy (tạo 13 giờ trước).
- Chạy `DOCKER_TESTS=1 GITHUB_TESTS=1` cho worker và `DOCKER_TESTS=1` cho web.
- **Worker** (`DOCKER_TESTS=1 GITHUB_TESTS=1`): **88 pass, 0 fail, 0 skip** (29 file, khoảng 91 giây).
- **Web** (`DOCKER_TESTS=1`): **661 pass, 0 fail, 0 skip** (104 file).

### 1.2 Các chỗ đã kiểm tra và không có vấn đề

- Drift DB ↔ schema: không có.
- Auto-claim SQL (`apps/worker/src/jobs/auto-claim.ts`): có test DB riêng (`auto-claim.db.test.ts`), đã pass.
- Lint không có warning.

---

## 2. Lỗi cấu hình và Prisma: việc cần làm

Các việc này nhỏ, làm được ngay. Không đổi logic tiền.

### Task P1: Test không có TEST_DATABASE_URL phải skip, không báo host giả

- **Vấn đề:** 32 fail ở worker và 4 ở database chỉ vì thiếu env. Nhìn vào rất giống lỗi thật.
- **Cách làm:** giống quy ước đã có ở web (`describe.skipIf(!process.env.TEST_DATABASE_URL)`). Áp cho các file worker và database có `beforeAll(assertTestDatabase)` mà chưa có `skipIf`. Đếm trước bằng `grep -rln "assertTestDatabase" apps/worker/test packages/database/test` rồi đối chiếu từng file.
- **Lựa chọn thay thế:** `preload.ts` throw một lỗi rõ ràng một lần ("Set TEST_DATABASE_URL to a *_test database"). Cách này fail nhanh hơn nhưng làm cả suite đỏ. **Cần bạn chọn** (xem mục 5).
- **Kiểm chứng:** không set `TEST_DATABASE_URL` thì `bun test` ở worker và database ra 0 fail. Có set thì số test giữ nguyên như mục 1.

### Task P2: Lệnh `db:generate` có env vô dụng và ghi đè file tracked

- **Vấn đề:** `packages/database/package.json` đặt `POTHOS_OUTPUT` ở `db:generate`, `db:migrate`, `db:push`, `db:reset`. Nhưng `schema.prisma` hardcode `output` của generator `pothos`, nên env này không có tác dụng. Lệnh luôn ghi vào `apps/web/src/graphql/generated/pothos-types.ts`, và file này được track trong git. Đây chính là sự cố ở mục 0.2.
- **Cách làm:** hai lựa chọn.
  - (a) Bỏ `POTHOS_OUTPUT=...` khỏi các script, vì nó không làm gì. Ghi chú trong `README` hoặc `AGENTS.md`: "db:generate ghi lại pothos-types.ts".
  - (b) Đưa `output` trong schema sang `env("POTHOS_OUTPUT")` kèm giá trị mặc định. Chỉ làm nếu muốn sinh ra chỗ khác để so sánh.
  - Khuyến nghị: (a). Ít thay đổi nhất.
- **Kiểm chứng:** `bun run db:generate` xong thì `git diff --stat` chỉ đổi file generated đó.

### Task P3: Dependency Prisma/Pothos đang lỏng

- **Vấn đề:**
  - `apps/web/package.json` ghi `"@graphql-yoga/node": "latest"`, `"@pothos/core": "latest"`, `"@pothos/plugin-prisma": "latest"`. Lockfile đang pin (`@pothos/plugin-prisma@4.17.0`, `@pothos/core@4.16.0`), nhưng `bun update` hoặc `bun add` sẽ kéo bản mới.
  - `@pothos/plugin-prisma@4.17.0` kéo `@prisma/generator-helper ^7.7.0`, trong khi Prisma CLI và client đang là 5.22.0. Generate vẫn chạy được hôm nay (mục 0.2), nhưng đây là lệch phiên bản dễ gây lỗi khi nâng cấp.
- **Cách làm:** đổi `"latest"` sang đúng phiên bản trong lock, không nâng cấp. Ghi nhận lệch `generator-helper` trong plan nâng cấp Prisma sau này (Prisma CLI đang có bản 8.x, xem thông báo lúc `migrate status`).
- **Kiểm chứng:** `bun install --frozen-lockfile` không đổi lock. `bun run typecheck` vẫn PASS.

### Task P4: Lệnh nguy hiểm có thể trỏ nhầm sang DB thật

- **Vấn đề:** `.env` đặt `DATABASE_URL` và `DIRECT_URL` trỏ tới Supabase (`aws-0-ap-northeast-2.pooler.supabase.com`), là DB có dữ liệu thật (98 user, 367 issue theo tracker). `packages/database/package.json` có `db:reset` dùng `prisma migrate reset` (xóa và tạo lại DB), `db:push`, và `db:seed:prod`. Không có guard nào chặn khi URL là remote.
- **Cách làm:** thêm guard ngắn ở đầu `db:reset`, `db:seed*` và `db:push`: từ chối nếu host không phải `localhost`/`127.0.0.1`, trừ khi có cờ rõ ràng. Hoặc để nguyên và chỉ ghi cảnh báo trong `RUNBOOK.md`. **Cần bạn chọn** (xem mục 5).
- **Kiểm chứng:** chạy `db:reset` với `.env` hiện tại phải bị từ chối, không chạm DB.

### Task P5: Thiếu test cho đường SQL "skill phổ biến"

- **Vấn đề:** `apps/web/src/graphql/modules/skill/skill.module.ts` chạy `$queryRaw` với `unnest("requiredSkills")` khi không có `query`. Đường này không có test DB nào chạy qua. SQL đúng về cột, nên rủi ro thấp.
- **Cách làm:** thêm một `*.db.test.ts` nhỏ: tạo 2 issue với `requiredSkills` khác nhau, gọi query `skills` không có `query`, kiểm thứ tự. Đây là logic có branch nên theo quy tắc ponytail cần một test.

---

## 3. Logic chưa hoàn thiện (có bằng chứng trong code)

Đây là các chỗ đã được ghi là shortcut hoặc đã bị loại khỏi phạm vi. Mức ưu tiên xếp theo rủi ro tiền.

| # | Vị trí | Vấn đề | Rủi ro | Ghi chú |
|---|---|---|---|---|
| L1 | `apps/worker/src/effects/escrow.ts:59` | Deposit không đi qua backend (QĐ-05) thì `if (!reservation) return;`, không tạo projection. Tiền on-chain có thật nhưng hệ thống không thấy. | Trung bình | Shortcut đã ghi "cần làm sau". Cần quyết định: có hiển thị escrow mồ côi không. |
| L2 | `apps/worker/src/indexer/reorg.ts:9` | Reorg sâu hơn `INDEXER_REORG_WINDOW` (mặc định 64 block, `config.ts:67`) không được unwind. Cursor và projection có thể sai. | Cao nếu xảy ra, xác suất thấp trên Base | Upgrade: lưu hash mỗi block. Tối thiểu: alert khi phát hiện hash lệch ngoài cửa sổ. |
| L3 | `apps/worker/src/jobs/source-snapshot.ts:72` | Snapshot nguồn lưu trên đĩa của một máy worker. | Chặn scale | Cần shared storage trước khi chạy nhiều worker. |
| L4 | `apps/web/src/lib/rate-limit.ts:2`, `apps/web/src/lib/auth.ts:90` | Rate limit và cache auth là in-memory, theo process. | Chặn scale | Không ảnh hưởng hôm nay vì chạy một process. |
| L5 | Tracker §9 | AI sinh test chỉ được kiểm bằng fixture xác định. Chưa đánh giá chất lượng model thật. | Chất lượng test sinh ra chưa biết | Cần một bộ eval nhỏ với model thật trước khi tin AC do AI sinh. |
| L6 | Plan §0 (D7) | Chỉ hỗ trợ vitest và pytest. Ngôn ngữ khác không làm. | Phạm vi | Đúng với quyết định, ghi lại để không quên. |
| L7 | Plan §0 (ngoài phạm vi) | Dev không nộp lại sau deadline. Repo private qua GitHub App không làm. | Nghiệp vụ | Hỏi lại nếu cần. |
| L8 | Tracker §9 | `commitSha` chỉ là metadata. Runner vẫn cần patch/diff. | Nhỏ | Đúng thiết kế, ghi lại. |
| L9 | Checkbox 2.x | Deploy Base Sepolia và cập nhật env production chưa làm. | Blocker demo thật | Người dùng làm, không phải Haiku. |
| L10 | Tracker §9 | `forge fmt --check` còn formatting có sẵn trong contract/mocks. | Nhỏ | Không reformat hàng loạt. |

---

## 4. Thứ tự đề xuất

| Đợt | Việc | Ước lượng | Lý do |
|---|---|---|---|
| 1 | P1, P2, P3 | 0,5 ngày | Dọn lỗi "Prisma" bạn thấy, không đổi logic |
| 1 | P4 | 0,5 ngày | Chặn rủi ro xóa nhầm DB thật, rất rẻ |
| 2 | L2: báo động khi reorg ngoài cửa sổ | 0,5–1 ngày | Tối thiểu trước khi làm lưu hash đầy đủ |
| 2 | L1: quyết định và làm xử lý deposit mồ côi | 1–2 ngày | Cần quyết định nghiệp vụ trước |
| 2 | P5 | 0,5 ngày | Test còn thiếu |
| 3 | L3, L4 | theo kế hoạch scale | Chỉ cần khi chạy nhiều worker/instance |
| 3 | L5 | 2–3 ngày | Cần model thật và bộ eval |

Mỗi task: làm theo quy trình ở mục 1.3 của tracker (typecheck, lint, test riêng, tick checkbox, commit chỉ file của task). Với logic tiền, quyền, gate: test đỏ trước.

---

## 5. Cần bạn quyết định

1. **P1:** skip test khi thiếu `TEST_DATABASE_URL` (khuyến nghị, giống web) hay fail nhanh một lần với thông báo rõ?
2. **P2:** bỏ `POTHOS_OUTPUT` khỏi script (khuyến nghị) hay làm `output` đọc từ env?
3. **P4:** guard chặn `db:reset`/`db:seed*`/`db:push` khi URL là remote (khuyến nghị) hay chỉ ghi cảnh báo trong runbook?
4. **L1:** deposit không qua backend thì hiển thị escrow mồ côi hay bỏ qua như hiện tại?
5. **L2:** tối thiểu là báo động, hay làm lưu hash đầy đủ ngay?
6. **0.2:** nếu bạn có bản cũ của `pothos-types.ts`, gửi để so sánh. Nếu không, không cần làm gì thêm.
