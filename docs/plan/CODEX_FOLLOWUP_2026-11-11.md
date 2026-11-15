Bạn đang làm việc trong repo `/Users/admin/repos/capstone1` (Bun monorepo, nhánh `feat/payout-testrunner-chat`).

Đọc trước: `AGENTS.md`, `docs/plan/REVIEW_2026-11-11.md`, và `docs/plan/CODEX_REVIEW_FIX_2026-11-11.md`. Vòng trước đã sửa mục 1–6, 8–10 và đã kiểm chứng đầy đủ. Vòng này sửa ba việc mới phát hiện khi review lại.

## Quy tắc

- Chỉ dùng `bun`. Không dùng npm hoặc pnpm.
- Viết test đỏ trước, xác nhận đỏ, rồi sửa cho xanh.
- Working tree có nhiều thay đổi chưa commit không thuộc việc này. Không revert, không format lại file không liên quan. Không commit.
- Diff ngắn nhất. Không thêm abstraction hay config không được yêu cầu.
- Comment chỉ ghi "vì sao". Shortcut có giới hạn ghi theo dạng `// shortcut: <giới hạn>, <khi nào nâng cấp>`.
- Không sửa `.env`. Không sửa contract `BloodyRoarEscrow.sol`. Không chạy `db:reset`, `db:push`, `db:seed*`, `db:migrate:prod`.
- Test DB: `bloody_roar_check_test` trên `localhost:5433`. Lấy user và mật khẩu từ dòng `# DATABASE_URL=...bloody_roar_local` đã comment trong `.env`, đặt vào `TEST_DATABASE_URL` khi chạy test. Không ghi mật khẩu vào file nào.
- Nếu cần migration: chạy `DATABASE_URL=<URL check_test> bunx prisma migrate dev --name <tên>` trong `packages/database`, rồi `bun run db:generate`. Không đụng DB nào khác.

## Việc 1: Snapshot kẹt ở PROCESSING sau khi worker crash (regression)

**Vấn đề.** Vòng trước đổi `apps/worker/src/jobs/source-snapshot.ts` sang đặt trạng thái `PROCESSING` trong transaction ngắn và commit ngay. Trước đó, nếu worker crash thì transaction rollback về `PENDING` và được thử lại. Bây giờ, nếu crash giữa chừng, snapshot kẹt ở `PROCESSING` mãi mãi. Job chỉ chọn `PENDING`, nên không ai xử lý lại. Issue kẹt ở "nguồn chưa sẵn sàng".

**Cách sửa.**
- Ở đầu mỗi lần chạy job, đưa các snapshot `PROCESSING` có thời điểm cập nhật cũ hơn 20 phút về `PENDING` (để thử lại). Nếu đã thử lại từ hai lần trở lên, đặt `FAILED` với `error = "worker lost"`. Nếu schema chưa có trường đếm số lần thử, thêm trường `attempts Int @default(0)` và migration. Hoặc dùng `updatedAt` nếu đã có. Chọn cách ít thay đổi nhất.
- Tham chiếu: `apps/worker/src/jobs/test-runs.ts` đã làm tương tự cho test run (dòng 17), dùng làm mẫu.

**Test đỏ trước** (trong `apps/worker/test/source-snapshot.test.ts` hoặc file DB mới): một snapshot ở `PROCESSING` với thời điểm cũ, sau khi chạy job phải về `PENDING` (lần đầu). Một snapshot đã thử lại đủ số lần phải thành `FAILED`.

## Việc 2: Scanner gọi RPC quá nhiều (mỗi block một lần)

**Vấn đề.** `apps/worker/src/indexer/scanner.ts` (khoảng dòng 43-49) lấy hash của mọi block trong cửa sổ `reorgWindow` (mặc định 64) ở mỗi lần quét, tức tối đa 64 lần gọi RPC mỗi tick khi chain có block mới.

**Lý do có thể tái sử dụng.** Hash của block phía trước được bảo toàn bởi hash của tip. Nếu một block dưới tip đổi, tip cũng đổi. `handleReorg` đã kiểm tra tip (`lastCanonicalBlockHash`) trước khi quét. Vì vậy có thể tái sử dụng hash đã lưu cho các block cũ.

**Cách sửa.**
- Chỉ dùng lại `canonicalBlockHashes` đã lưu khi `handleReorg` đã xác nhận tip khớp trong cùng tick. Nếu không, lấy lại toàn bộ cửa sổ như hiện tại.
- Chỉ gọi RPC cho các block mới: từ `lastScannedBlock + 1` đến `to`, và các block mới trong cửa sổ.
- Cắt map về đúng cửa sổ `[to - reorgWindow, to]`, để map không phình ra.

**Test đỏ trước**: với một mock RPC đếm số lần gọi, quét hai lần liên tiếp khi chain tiến 1 block. Lần thứ hai chỉ được phép gọi RPC cho block mới (không gọi lại 64 block cũ). Thêm test: nếu tip đổi hash, phải lấy lại cửa sổ đầy đủ.

## Việc 3: Project Python có layout `src/` có thể không import được

**Vấn đề.** `apps/worker/src/runner/sandbox.ts` không còn chạy `pip install .`, nên project kiểu `src/mypkg` không có trong `sys.path` khi chạy test. Chỉ `/work` có sẵn.

**Cách sửa.** Trong `docker(...)` của nhánh PYTEST, thêm `/work/src` vào `PYTHONPATH` (nối sau `/work/.br-deps`), chỉ khi thư mục đó tồn tại. Đơn giản nhất: đặt `PYTHONPATH=/work/.br-deps:/work/src` (đường dẫn không tồn tại thì Python bỏ qua).

**Test đỏ trước** (test Docker, trong `apps/worker/test/sandbox.test.ts`, bọc `DOCKER_TESTS`): project có `src/mypkg/__init__.py` và một test `__bloodyroar__/test_x.py` import `mypkg` phải pass.

## Kiểm chứng cuối (bắt buộc)

- `bun run typecheck`
- `bun run lint`
- Trong `apps/worker`: `TEST_DATABASE_URL=<URL check_test> bun --env-file=../../.env test`. Kỳ vọng: 0 fail.
- Trong `apps/worker`: `DOCKER_TESTS=1 GITHUB_TESTS=1 TEST_DATABASE_URL=<URL check_test> bun --env-file=../../.env test`. Kỳ vọng: 0 fail.
- Trong `apps/web`: `DOCKER_TESTS=1 TEST_DATABASE_URL=<URL check_test> bunx vitest run`. Kỳ vọng: 0 fail.
- Trong `packages/database`: `TEST_DATABASE_URL=<URL check_test> bun test ./test`. Kỳ vọng: 0 fail.
- `bun run contracts:test`. Kỳ vọng: 36 passing.
- Chạy worker không set `TEST_DATABASE_URL`, kỳ vọng 0 fail.

## Báo cáo khi xong

Với từng việc 1–3: file đã đổi, tên test đỏ và test xanh, kết quả kiểm chứng. Nếu có migration, ghi tên thư mục. Nếu một việc không làm được, dừng và báo cáo lý do, không tự mở rộng phạm vi.
