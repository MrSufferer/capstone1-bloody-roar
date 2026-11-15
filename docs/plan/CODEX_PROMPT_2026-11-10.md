Bạn đang làm việc trong repo `/Users/admin/repos/capstone1` (Bun monorepo, nhánh `feat/payout-testrunner-chat`). Đọc `AGENTS.md` và `docs/plan/CHECK_PRISMA_LOGIC_2026-11-10.md` trước khi làm.

## Quy tắc chung

- Chỉ dùng `bun`. Không dùng npm hoặc pnpm.
- Working tree đang có khoảng 199 file đã sửa không thuộc việc này. Không commit, không revert, không format lại file không liên quan. Chỉ sửa các file liệt kê trong task.
- Diff ngắn nhất. Không thêm abstraction, config hay tính năng nào không được yêu cầu. Dùng lại helper có sẵn.
- Logic tiền, quyền, gate: viết test đỏ trước, rồi sửa cho xanh.
- Comment chỉ ghi "vì sao". Shortcut có giới hạn ghi theo dạng: `// shortcut: <giới hạn>, <khi nào nâng cấp>`.
- KHÔNG chạy lệnh nào ghi vào DB: không `db:reset`, `db:push`, `db:seed*`, `db:migrate:prod`. Không sửa `.env`. `.env` trỏ tới Supabase, là DB thật.
- KHÔNG chạy `db:generate`. Lệnh này ghi lại `apps/web/src/graphql/generated/pothos-types.ts`, file đang có thay đổi chưa commit. Batch này không đổi schema.
- Test DB: `bloody_roar_check_test` trên `localhost:5433` (container `bloody_roar_postgres`). Lấy user và mật khẩu từ dòng `# DATABASE_URL=...bloody_roar_local` đã comment trong `.env`, rồi đặt vào biến môi trường `TEST_DATABASE_URL` khi chạy test. Không ghi mật khẩu vào bất kỳ file nào.

## Task 1: Test thiếu TEST_DATABASE_URL phải skip (P1)

Khi không có `TEST_DATABASE_URL`, test DB đang trỏ tới host giả `unit-tests.invalid` và fail. Làm theo quy ước của web: bọc suite bằng `describe.skipIf(!process.env.TEST_DATABASE_URL)`.

Áp cho các file:
- `apps/worker/test/`: notify, contract-config, intent-race, lock, effects-claimed, deadline-notifications, intents, reorg, reconciliation, reservations, replay, cleanup, auto-claim.db, scanner-projection, effects-escrow, effects-dispute, scanner, effects-resolved
- `packages/database/test/`: notifications, funding-reservation, seed-demo

Không sửa `preload.ts` và `test-guard.test.ts`. Hai file này kiểm tra chính guard.

Nếu một `beforeAll` không liên quan đến DB, tách nó ra khỏi suite cần skip để không skip nhầm.

Kiểm chứng:
- Không set `TEST_DATABASE_URL`: `bun test` trong `apps/worker` và `packages/database` có 0 fail.
- Có set `TEST_DATABASE_URL`: worker phải ra 88 pass, 3 skip. Database phải ra 4/4 pass.

## Task 2: Bỏ POTHOS_OUTPUT không có tác dụng (P2)

`packages/database/prisma/schema.prisma` đã hardcode `output` cho generator `prisma-pothos-types`, nên `POTHOS_OUTPUT` trong `packages/database/package.json` không làm gì.

- Bỏ `POTHOS_OUTPUT=...` khỏi các script `db:generate`, `db:migrate`, `db:migrate:prod`, `db:push`, `db:reset`.
- Không đổi schema.

Kiểm chứng: `git diff packages/database/package.json` chỉ có các dòng script đó.

## Task 3: Pin dependency Prisma và Pothos (P3)

`apps/web/package.json` đang ghi `"latest"` cho `@graphql-yoga/node`, `@pothos/core` và `@pothos/plugin-prisma`. Đổi sang đúng phiên bản đang có trong `bun.lock`:
- `@graphql-yoga/node` → `3.9.1`
- `@pothos/core` → `4.16.0`
- `@pothos/plugin-prisma` → `4.17.0`

Không nâng cấp package nào khác.

Kiểm chứng: `bun install --frozen-lockfile` không đổi `bun.lock`. Typecheck PASS.

## Task 4: Guard chặn lệnh DB nguy hiểm trỏ tới remote (P4)

Thêm một script nhỏ, ví dụ `packages/database/scripts/assert-local-db.ts`. Script đọc `DATABASE_URL`, thoát với mã lỗi 1 và thông báo rõ nếu host không phải `localhost` hoặc `127.0.0.1`. Có override tường minh bằng `ALLOW_REMOTE_DB=1`.

Gắn guard vào đầu các script: `db:reset`, `db:push`, `db:seed`, `db:seed:demo`, `db:seed:local`.

KHÔNG gắn vào `db:seed:prod` và `db:migrate:prod`. Hai lệnh này được phép chạy lên remote.

Test (`bun test`) cho hàm kiểm tra: localhost được qua, URL Supabase bị chặn, có `ALLOW_REMOTE_DB=1` thì được qua.

Kiểm chứng: với `.env` hiện tại, gọi script guard trực tiếp phải bị từ chối. Không chạy `db:reset` để kiểm chứng.

## Task 5: Test cho đường query skill phổ biến (P5)

`apps/web/src/graphql/modules/skill/skill.module.ts` có nhánh `$queryRaw` với `unnest("requiredSkills")` khi không có `query`. Chưa có test DB nào chạy qua nhánh này.

Thêm `apps/web/src/test/skill-popular.db.test.ts`, theo mẫu các file `*.db.test.ts` khác và bọc `describe.skipIf` như Task 1. Test tạo 2 issue không phải draft với `requiredSkills` khác nhau, gọi query `skills` không có `query`, rồi kiểm thứ tự theo số lần dùng.

## Task 6: Reorg vượt cửa sổ phải báo động và dừng, không ghi sai (L2, mức tối thiểu)

`apps/worker/src/indexer/reorg.ts`: hiện khi fork sâu hơn `INDEXER_REORG_WINDOW` (mặc định 64) thì không unwind và vẫn tiếp tục ghi.

Yêu cầu:
- Sau khi lùi đúng `reorgWindow` block mà hash vẫn lệch với node, không advance cursor và không ghi event mới từ block đó.
- Ghi lỗi có tên rõ, ví dụ `REORG_BEYOND_WINDOW`, và gửi qua `evaluateAlerts` và `sendAlerts` trong `apps/worker/src/alerts.ts`. Thêm input cần thiết, giữ kiểu hiện có.
- Không tự sửa dữ liệu đã ghi. Người vận hành xử lý thủ công.
- Viết test đỏ trước trong `apps/worker/test/reorg.test.ts`: fork sâu hơn cửa sổ thì cursor không đi tiếp và alert được tạo.
- Cập nhật comment `shortcut:` ở đầu hàm để phản ánh hành vi mới. Ghi rõ giới hạn còn lại và khi nào nâng cấp (lưu hash mỗi block).

## KHÔNG làm trong batch này

- L1, deposit không qua backend (`apps/worker/src/effects/escrow.ts:59`): chờ quyết định nghiệp vụ. Không đổi.
- L3 và L4, snapshot trên đĩa và rate limit/auth in-memory: để sau, khi scale.
- L5, đánh giá chất lượng AI sinh test: cần model thật.
- Không đổi contract, không đổi logic chia tiền hoặc phí, không deploy Base Sepolia, không đổi `.env`.

## Kiểm chứng cuối (bắt buộc)

- `bun run typecheck`
- `bun run lint`
- Trong `apps/worker`: `TEST_DATABASE_URL=<URL check_test> bun test`
- Trong `packages/database`: `TEST_DATABASE_URL=<URL check_test> bun test ./test`
- Trong `apps/web`: `TEST_DATABASE_URL=<URL check_test> bunx vitest run`
- `bun run contracts:test`
- Chạy lại worker và `packages/database` không set `TEST_DATABASE_URL` để xác nhận không còn lỗi host giả.

## Báo cáo khi xong

Với từng task, ghi: file đã đổi, kết quả test (số pass, fail, skip), và phần nào bỏ qua hoặc chưa kiểm chứng. Không commit. Nếu một task cần đổi ngoài phạm vi trên, dừng lại và hỏi trước.
