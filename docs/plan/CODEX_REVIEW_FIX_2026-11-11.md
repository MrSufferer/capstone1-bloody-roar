Bạn đang làm việc trong repo `/Users/admin/repos/capstone1` (Bun monorepo, nhánh `feat/payout-testrunner-chat`).

Đọc trước: `AGENTS.md`, `docs/plan/REVIEW_2026-11-11.md` (nguồn công việc của bạn), `docs/plan/CHECK_PRISMA_LOGIC_2026-11-10.md`.

Nhiệm vụ: sửa các mục **1 đến 10** trong `REVIEW_2026-11-11.md` theo đúng phần "Fix" của từng mục. Làm đến khi xong hết mục 1–10, rồi báo cáo.

## Quy tắc

- Chỉ dùng `bun`. Không dùng npm hoặc pnpm.
- Mỗi mục: viết test đỏ trước, xác nhận test đỏ, rồi sửa cho xanh. Áp cho mọi mục có logic (1, 2, 4, 5, 6).
- Working tree có nhiều file đã sửa không thuộc việc này. Không revert, không format lại file không liên quan. Không commit.
- Diff ngắn nhất. Không thêm abstraction hay config không được yêu cầu. Dùng lại helper có sẵn.
- Comment chỉ ghi "vì sao". Shortcut có giới hạn ghi theo dạng: `// shortcut: <giới hạn>, <khi nào nâng cấp>`.
- Không đổi contract `BloodyRoarEscrow.sol` và không đổi logic chia tiền.
- Không sửa `.env`. Không chạy `db:reset`, `db:push`, `db:seed*`, `db:migrate:prod`.
- Test DB: `bloody_roar_check_test` trên `localhost:5433`. Lấy user và mật khẩu từ dòng `# DATABASE_URL=...bloody_roar_local` đã comment trong `.env`, rồi đặt vào `TEST_DATABASE_URL` khi chạy test. Không ghi mật khẩu vào file nào.
- Mục 1 cần migration (thêm lưu hash block). Khi đó:
  - Chạy migration bằng `DATABASE_URL=<URL check_test> bunx prisma migrate dev --name <tên>` trong `packages/database`. Không dùng lệnh `db:migrate` có sẵn, vì nó trỏ `.env`.
  - Sau đó chạy `bun run db:generate` (đã đổi schema nên bắt buộc).
  - Không đụng DB nào khác.

## Thứ tự

1. Mục 5 (test kẹt RUNNING) và mục 2 (zip bom) trước, vì nhỏ và độc lập.
2. Mục 3 (cài đặt Python không build project).
3. Mục 4 (loại secret khỏi snapshot và context AI).
4. Mục 1 (reorg). Đây là mục phức tạp nhất, làm sau cùng trong nhóm must-fix.
5. Mục 6, 8, 9, 10.

## Không làm

- Mục 7: không sửa code. Đây là quyết định sản phẩm.
- Mục 11 đến 15.

## Kiểm chứng cuối (bắt buộc)

- `bun run typecheck`
- `bun run lint`
- Trong `apps/worker`: `TEST_DATABASE_URL=<URL check_test> bun --env-file=../../.env test`. Kỳ vọng: 0 fail.
- Trong `apps/worker`: `DOCKER_TESTS=1 GITHUB_TESTS=1 TEST_DATABASE_URL=<URL check_test> bun --env-file=../../.env test`. Kỳ vọng: 0 fail, gồm sandbox và public-source.
- Trong `apps/web`: `DOCKER_TESTS=1 TEST_DATABASE_URL=<URL check_test> bunx vitest run`. Kỳ vọng: 0 fail.
- Trong `packages/database`: `TEST_DATABASE_URL=<URL check_test> bun test ./test`. Kỳ vọng: 0 fail.
- `bun run contracts:test`. Kỳ vọng: 36 passing.
- Chạy worker không set `TEST_DATABASE_URL` để xác nhận không có lỗi host giả.

## Báo cáo khi xong

Với từng mục 1–10 ghi: file đã đổi, tên test đỏ và test xanh, kết quả lệnh kiểm chứng. Ghi rõ mục nào không làm và lý do. Ghi rõ migration đã tạo (tên thư mục). Nếu một mục cần đổi ngoài phạm vi review, dừng lại và báo cáo, không tự mở rộng.
