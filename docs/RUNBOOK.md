# Runbook vận hành

Dành cho người trực khi app chạy trên Railway (xem [`DEPLOY.md`](DEPLOY.md) để biết cách deploy lần đầu).

## 1. Rollback

**Ứng dụng: redeploy image trước.** Trên Railway: service web → Deployments → chọn bản đang chạy tốt trước đó → Redeploy. Không sửa code trực tiếp lúc sự cố.

**Database: migration chỉ tiến, không rollback bằng tay.**
- Quy tắc viết migration: cột mới phải nullable hoặc có default, và phải deploy migration trước code cần nó. Nhờ vậy redeploy image cũ vẫn chạy được trên schema mới.
- Migration đã xóa hoặc đổi cột mà code cũ cần: khôi phục database từ backup Supabase, rồi redeploy image cũ. Chụp backup trước mọi migration có thao tác xóa.

**Contract: không upgrade.** Contract đã deploy là bất biến, không có đường rollback contract. Sự cố on-chain xử lý theo quy trình của escrow, không theo runbook này.

## 2. Kiểm tra nhanh

- `GET /api/health` phải trả `200` và `"database":"connected"`. Trả `503` nghĩa là không kết nối được database.
- Mọi response có header `x-request-id`. Dùng id này để tìm mọi dòng log của cùng một request.
- Log GraphQL: mỗi operation ghi `operation`, `durationMs`, `errors`. Tìm theo `requestId` hoặc theo tên operation.

## 3. Lỗi thường gặp

| Triệu chứng | Nguyên nhân và cách xử lý |
| --- | --- |
| Container thoát ngay, log có `Invalid environment: DATABASE_URL: required in production` (hoặc `AI_HASH_KEY`) | Thiếu biến bắt buộc khi chạy production. Thêm biến trên Railway rồi redeploy. |
| `429 Too many requests` kèm `Retry-After` | Vượt giới hạn theo IP hoặc theo user (`/api/auth/nonce`, `/api/auth/login`, `/api/graphql`, `/api/uploads`). Chờ đúng số giây trong `Retry-After`. Nhiều người chung một IP (NAT) có thể chạm giới hạn: tăng `GRAPHQL_POINTS_PER_MINUTE` trong `app/api/graphql/route.ts`. Giới hạn nằm trong bộ nhớ của từng instance, nên scale ra nhiều instance sẽ nhân giới hạn lên. |
| Đăng nhập ví thất bại, không rõ lý do | Kiểm tra `NEXT_PUBLIC_APP_URL` (xem DEPLOY.md mục 3). Biến này được đóng vào bundle lúc build, sai thì phải redeploy. |
| `Login challenge already used` | Nonce đã được dùng. Ví phải ký lại từ đầu. Đây là replay, không phải lỗi hệ thống. |
| Liên kết GitHub trả `GITHUB_ALREADY_LINKED` | Tài khoản GitHub đã gắn với ví khác. Chủ ví đó phải gọi `unlinkGithub` trước. |
| `next build` bị `SIGKILL` | Builder thiếu RAM (xem DEPLOY.md mục 2). |

## 4. Cấp quyền admin

```bash
railway run bun run --cwd apps/web scripts/grant-admin.ts 0x<address>
```

Lệnh đặt role `ADMIN` và ghi một dòng `AdminLog` (action `grant_admin`, adminId `cli`). Chạy trên đúng môi trường cần cấp quyền. Không chạy trên database của người khác.

## 5. Dừng server

`SIGTERM` (Railway gửi khi redeploy): đóng Socket.IO, đóng HTTP server, ngắt Prisma, rồi thoát `0`. Nếu chưa xong sau 10 giây, tiến trình thoát `1`.

## Auto-claim

Auto-claim is off in release (MVP) builds. Release builds leave
`RELAYER_PRIVATE_KEY` empty, and with no key the worker starts normally and skips
the job. Withdraw on the dashboard is the only claim path.

When the key is set, the worker uses it to pay gas for `claim(recipient)`. Funds
still go to the client or developer wallet, never to the relayer. The relayer
holds ETH for gas only; never use a client, developer or fee recipient wallet.

The job runs every 15 seconds and handles at most 10 wallets per tick. It only
picks registered user wallets on the configured chain and contract, and skips the
fee recipient. Attempts for a wallet are at least 10 minutes apart, including
after a send error or a lagging projection. The indexer confirms the `Claimed`
event and sets the balance to 0. The dashboard shows "pending" but keeps Withdraw
as a fallback.

### Enable it locally

1. Start a local chain (Hardhat) and the database used by the worker.
2. Create a fresh throwaway key for the relayer only. Never reuse a real wallet.
3. In your local env file (not `.env.example`, never committed), set
   `RELAYER_PRIVATE_KEY` to that key (`0x` plus 64 hex chars) and optionally
   `RELAYER_MIN_GAS_WEI` (default `1000000000000000`, 0.001 ETH).
4. Fund the relayer address with local ETH for gas.
5. Start the worker and check its log for the auto-claim job.
6. To turn it off again, clear `RELAYER_PRIVATE_KEY` and restart the worker.

The `RELAYER_LOW_GAS` alert fires once when the relayer balance drops below
`RELAYER_MIN_GAS_WEI` and stays quiet until the balance recovers. Top up ETH
when it fires; don't rotate the key just to fix low gas.

Checks: `bun run --cwd apps/worker test reconciliation.test.ts` confirms the
worker starts with an empty key. The end-to-end scenario
`tests/e2e/e33-auto-claim.test.ts` (run by `bun run test:e2e:backend`, last
verified 2026-11-10) creates an issue, funds, submits and releases it, then has
the relayer claim. It confirms the event, that USDC rises by the claimable amount,
and that the projection returns to 0 within a minute. It uses its own Hardhat
node, database and relayer funded over local RPC.

## Test runner và migration chat

Trước khi bật `TEST_RUNNER_ENABLED=true` trên worker:

```bash
docker build -t bloodyroar-test-runner:1 -f apps/worker/runner/Dockerfile apps/worker/runner
docker pull python:3.12-slim
bun run --cwd packages/database db:migrate:prod
bun run --cwd packages/database db:backfill:conversations
```

Image JS có Node 22 để chạy Vitest và Bun để cài package với `--ignore-scripts`.
Không bật lifecycle scripts cho source upload. Dự án cần native build riêng có
thể trả ERROR/No result; kết quả đó không được dùng để approve test.
Container test không có mạng, chạy UID 1000, giới hạn CPU/RAM/PID, root filesystem
chỉ đọc và chỉ mount thư mục làm việc. Không truyền secret của worker vào Docker.

`SNAPSHOT_DIR` mặc định `.data/snapshots`, tính từ repo root. Web và worker cần
truy cập cùng thư mục để tải pinned snapshot. Với nhiều máy worker, cần chuyển
lưu snapshot sang shared storage trước khi mở rộng. Snapshot lỗi trả FAILED;
run kẹt quá 20 phút được cleanup chuyển ERROR.

Migration backfill chat chạy trước khi đặt `conversationId` NOT NULL và bỏ
`readAt`; giữ nguyên nội dung, người gửi, thời gian và attachment cũ. Script
backfill có thể chạy lại. Sau triển khai cần restart web/worker cùng phiên bản
schema mới. Không chạy test reset DB trên database đang sử dụng.

Python runner chỉ cài wheel từ `requirements.txt` hoặc `project.dependencies` trong
`pyproject.toml`; không build/cài chính project. Chỉ hỗ trợ dependency theo tên,
không hỗ trợ đường dẫn local, URL hoặc pip directives.
Khi deploy thật, phải chặn egress của container cài dependency tới dải IP nội bộ,
loopback và endpoint metadata cloud ở firewall/network của host.
