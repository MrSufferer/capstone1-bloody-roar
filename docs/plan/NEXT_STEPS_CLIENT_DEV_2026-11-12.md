# Việc còn lại: luồng client – dev, nhắn tin, bảo mật, các trường hợp biên

Ngày: 2026-11-12. Nhánh: `feat/payout-testrunner-chat`.
Đọc cùng: `REVIEW_2026-11-11.md`, `FEATURE_CORE_PLAN_2026-11-11.md`, `CHECK_PRISMA_LOGIC_2026-11-10.md`.

Quy ước: mỗi khẳng định về hành vi đều có đường dẫn code. Phần nào chưa kiểm được ghi là **"chưa kiểm"**.

---

## 0. Tóm tắt điều hành

### 0.1 Hiện trạng

| Thành phần | Trạng thái | Bằng chứng |
|---|---|---|
| Review 1–10 (vòng 1 và 2 Codex) | Đã sửa, đã kiểm chứng | typecheck, lint, test (mục 1.2) |
| Auto-claim, review window (contract) | Đã có, test pass | `auto-claim.db.test.ts`, contract 36 passing |
| Test runner (sandbox, gate, snapshot) | Đã có | `test-runner-flow.db.test.ts` (Docker) |
| Chat ISSUE_WORK và APPLICATION | Đã có | `conversations.db.test.ts` |
| Migration mới trên DB thật | **Chưa áp** (xem 0.2) | `prisma migrate status` |
| Gate nộp bài trên chain | Chỉ có ở server (mục 7 review) | `draft.module.ts:127` |
| AI sinh test: UX 3 bước, chọn file | **Chưa làm** | `FEATURE_CORE_PLAN` mục 1 |
| AI báo cáo bài nộp dev | **Chưa làm** | `FEATURE_CORE_PLAN` mục 2 |
| Nộp commit trên GitHub (đường 2) | **Chưa làm** | `FEATURE_CORE_PLAN` mục 2.3 |

### 0.2 Việc đang bị chặn

**Áp 3 migration lên Supabase (DB thật).** Lệnh `bun run --cwd packages/database db:migrate:prod` đã bị bộ phân loại an toàn từ chối vì được xem là deploy production. Tôi không tìm cách khác để chạy. Bạn cần chọn một trong hai:
- Chạy trực tiếp trong terminal: `! bun run --cwd packages/database db:migrate:prod`. Nên chụp snapshot Supabase trước (Dashboard → Backups).
- Cấp quyền cho lệnh này trong cài đặt Claude Code, rồi bảo tôi chạy lại.

Ba migration: `20261110175315_checkpoint_block_hashes`, `20261110175415_snapshot_processing`, `20261110180408_snapshot_attempts`. Đều thêm cột có giá trị mặc định hoặc thêm một giá trị enum, không xóa dữ liệu. Muốn hoàn tác: xóa cột, nhưng enum `PROCESSING` không xóa được dễ dàng trong PostgreSQL.

**Lưu ý:** chừng nào chưa áp migration, worker mới (đã sửa) và DB thật không khớp. Không nên chạy worker mới trỏ vào Supabase trước khi áp migration.

---

## 1. Kiểm chứng gần nhất (2026-11-11, chạy lại độc lập)

| Lệnh | Kết quả |
|---|---|
| `typecheck`, `lint` | PASS |
| Worker, có TEST DB | 95 pass, 5 skip, 0 fail |
| Worker, có Docker và GitHub | 100 pass, 0 fail |
| Worker, không có TEST DB | 45 pass, 96 skip, 0 fail |
| Web, có Docker | 667/667 |
| Database | 6/6 |
| Contract | 36 passing |

Chưa có: chạy E2E với Hardhat và UI (`E2E_UI_ONLY`), chạy trên nhiều worker, zip bom và sandbox độc hại trên Docker thật.

---

## 2. Mô hình trạng thái

### 2.1 Issue

```
                 select dev          deposit đúng           release (client)
OPEN ───────────────────► AWAITING_FUNDING ─────────► IN_PROGRESS ──────────► COMPLETED
 │  ▲                          │  │                       │   │
 │  └── reservation hết hạn ───┘  │                       │   └── raiseDispute ──► DISPUTED ──► (phán quyết) ──► COMPLETED / CANCELLED
 │      hoặc cancelReservation    │                       │
 └── cancelIssue (chỉ OPEN) ──► CANCELLED               │
                                 └── deposit lệch ──► (issue mở lại, reservation MISMATCHED, admin xử lý tay)
```

Nguồn: `issue.module.ts:753` (cancel chỉ khi OPEN), `select.module.ts` (selectDeveloper), `reservations.ts` (hết hạn → OPEN), `effects/escrow.ts` (deposit).

### 2.2 Đơn ứng tuyển (`ApplicationStatus`)

```
PENDING ──select dev + deposit thành công──► ACCEPTED
   │   └── client từ chối (chỉ khi issue OPEN) ──► REJECTED
   └── dev rút (chỉ khi PENDING) ──► WITHDRAWN
```

Lưu ý: đơn được chọn **vẫn là PENDING** cho tới khi deposit được xác nhận (`selectDeveloper` yêu cầu `PENDING`). Đơn các ứng viên khác bị REJECTED ở cùng lúc với deposit (`effects/escrow.ts:127-136`).

### 2.3 Reservation (`FundingReservation`)

`AWAITING_FUNDING` → `FUNDED` (deposit khớp) | `EXPIRED` (sau 24 giờ, `RESERVATION_HOURS = 24` tại `packages/shared/src/escrow/constants.ts:12`) | `CANCELLED` (client hủy) | `MISMATCHED` (deposit không khớp điều khoản, cần admin).

### 2.4 Escrow trên chain

Các pha dùng trong code: `FUNDED`, `DISPUTED`, `RESOLVED`. Hàm chính: `submitWork`, `releaseFunds`, `raiseDispute`, `claimReviewTimeout`, `claimMissedDeliveryRefund`, `claim`.

### 2.5 Bài nộp (`SubmissionStatus`) và test run

- Bài nộp: `DRAFT` → (chuẩn bị ký) → `PENDING_CHAIN` → `SUBMITTED`. Bản cũ thành `SUPERSEDED`. Cờ `changesRequested` là trạng thái riêng, không thuộc enum.
- Test run: `QUEUED` → `RUNNING` → `PASSED` | `FAILED` | `ERROR` | `TIMEOUT`. Run kẹt quá 20 phút được chuyển `ERROR` với log "worker lost" (`test-runs.ts:17`).

---

## 3. Luồng chi tiết theo thời gian

Ký hiệu: **[C]** client, **[D]** dev, **[W]** worker, **[S]** server web, **[X]** chain.

### 3.1 Đăng bounty

1. **[C]** tạo issue (`createIssue`). Issue ở `OPEN`.
2. **[C]** gắn nguồn: `setIssueSource` với `repoUrl` + `ref`, hoặc upload zip (`purpose=SOURCE`, chỉ khi `OPEN`).
   - Đổi nguồn: hủy mọi run đang chạy (`log: "Source changed"`), xóa xác minh cũ và đặt lại số lần thử (`issue-source.module.ts:45-47`).
3. **[W]** job `source-snapshot`: `PENDING` → `PROCESSING` → `READY` | `FAILED`. Lỗi được ghi vào `error`. Lần thử được đếm trong `attempts`.
4. **[C]** `generateTestCases`: chỉ chủ issue, chỉ khi `OPEN`, có giới hạn tần suất AI (`aiRateLimit`). Nếu snapshot `READY`, gửi `framework` và `context` đã lọc secret.
5. **[W]** `BASE_CHECK` tự xếp hàng khi code test đổi (`queueBaseCheck`). Kết quả ghi `baseStatus` từng test.
6. **[C]** approve từng test. Bị từ chối nếu `baseStatus` không khớp `expectBaseFail` (`TEST_NOT_VERIFIED`). Sửa code test sẽ xóa `baseStatus` và chạy lại kiểm chứng.
7. **[C]** sửa tiêu chí bị khóa khi issue không còn `OPEN` hoặc có reservation đang hoạt động (`ISSUE_NOT_EDITABLE`, `ai.module.ts:111,178`).

**Chưa kiểm:** bước "công bố" bounty ra marketplace (`isDraft` từ `false` sang?). Cần xác nhận UI có lưu nháp không.

### 3.2 Ứng tuyển và chat trước khi chọn

1. **[D]** `applyToIssue`: tạo đơn `PENDING`.
2. **[C] hoặc [D]** `openApplicationChat`: mở phòng `APPLICATION` (upsert theo `applicationId`). Chỉ client của issue và đúng dev của đơn mới mở được; admin bị từ chối (`application.module`).
3. Phòng `APPLICATION` **ghi được** khi issue `OPEN` và đơn `PENDING` (`chat-access.ts:38`). Đọc được với hai bên tham gia.
4. **[D]** rút đơn: `withdrawApplication`, chỉ khi `PENDING`.
5. **[C]** từ chối: `rejectApplication`, chỉ khi issue `OPEN`.

### 3.3 Chọn dev và giữ chỗ

1. **[C]** `selectDeveloper(issueId, applicationId, deliveryDeadline)`. Điều kiện (`select.module.ts`):
   - Đơn phải `PENDING` và thuộc issue (`NOT_FOUND`).
   - Có ít nhất một tiêu chí đã approve (`NO_APPROVED_CRITERIA`).
   - Token phải thuộc chain hiện tại và khớp escrow.
   - Chưa có reservation đang hoạt động (`ISSUE_ALREADY_RESERVED`).
2. Kết quả: reservation `AWAITING_FUNDING`, hạn 24 giờ, issue `AWAITING_FUNDING`. Đơn của dev vẫn `PENDING`.
3. **[C]** `cancelReservation` (chỉ khi còn `AWAITING_FUNDING`): reservation `CANCELLED`, issue về `OPEN` nếu không còn reservation khác.
4. **[W]** `reservations` job: hết hạn thì `EXPIRED`, issue về `OPEN` nếu không còn reservation khác (`reservations.ts:15-18`). Đơn của dev không đổi trạng thái.

### 3.4 Nạp tiền ký quỹ

1. **[C]** `submitFundingIntent`: ký EIP-712 `FundingIntent` (có `nonce`, `intentExpiry`). Server nhận chữ ký, nonce và hạn. Chi tiết cách server kiểm tra chữ ký chưa kiểm, cần đọc lại và có test.
2. **[S]** `prepareEscrowDeposit`: trả về các bước (approve token, deposit) dạng calldata.
3. **[C]** ký và gửi bằng ví. Server ghi nhận giao dịch qua `recordTransactionSubmitted`.
4. **[W]** indexer đọc event `Deposited`, đối chiếu với reservation (`effects/escrow.ts:56-89`):
   - Ví client, ví dev, số tiền, hạn giao, `termsHash` đều phải khớp.
   - **Khớp và reservation còn `AWAITING_FUNDING`:** reservation `FUNDED`, issue `IN_PROGRESS`, gán `developerId`, đơn được chọn `ACCEPTED`, các đơn khác `REJECTED`, thông báo cho hai bên.
   - **Khớp nhưng reservation đã hết hạn (deposit muộn):** chỉ được nhận nếu issue vẫn `OPEN` (QĐ-17, `escrow.ts:91-93`).
   - **Không khớp, hoặc deposit muộn mà issue không còn `OPEN`:** reservation `MISMATCHED`. Nếu không phải deposit muộn thì issue mở lại `OPEN`. Admin và hai bên được thông báo `DEPOSIT_MISMATCHED`. **Tiền on-chain không được tự xử lý**, cần admin (`escrow.ts:205-206`).

**Rủi ro đã biết:** trường hợp không khớp để lại khoản tiền trong escrow không có projection (xem E-F3, mục 6).

### 3.5 Làm việc và trao đổi

- Phòng `ISSUE_WORK` mở khi có dev được chọn (`workConversation`). Hai bên ghi được khi issue ở `AWAITING_FUNDING`, `IN_PROGRESS` hoặc `DISPUTED`. Sau `COMPLETED` hoặc `CANCELLED` chỉ đọc.
- Admin chỉ đọc, và chỉ khi issue `DISPUTED`.
- Tệp đính kèm trong chat: `purpose=CHAT`, phải thuộc đúng người gửi và đúng phòng.
- Trong phòng `ISSUE_WORK`, `DELIVERY` cũng được gửi như tệp chat (`chat-messages.ts:39`).

### 3.6 Nộp bài

1. **[D]** `createSubmissionDraft`: chỉ dev được gán, issue `IN_PROGRESS`, escrow `FUNDED`, ví khớp, chưa quá hạn (theo thời gian chain). Kiểm tra:
   - PR (nếu có): đúng `github.com/owner/repo/pull/n`, cùng repo với issue.
   - Tệp đính kèm: `purpose=DELIVERY`, do chính dev tải lên, có sha256 hợp lệ.
   - Mô tả đi qua AI guard.
   - Manifest và `deliveryHash` do server tính.
   - Nếu draft đã có bản ký dở (đã chuẩn bị `submitWork`), sửa draft sẽ tạo bản mới, bản cũ vẫn `DRAFT` (xem E-S6).
2. **[D]** tải file `.patch` hoặc `.diff` qua `/api/uploads`, rồi `complete`. Server tự tính sha256 và kiểm tra kích thước thật (`uploads/complete/route.ts`).
3. **[D]** `runSubmissionTests`: tạo run `QUEUED` với `bundleSha256` và `patchSha256`. Giới hạn 20 run mỗi issue mỗi ngày. Không cho chạy khi đang có run `QUEUED`/`RUNNING`.
4. **[W]** `testRunsJob`: kiểm tra checksum snapshot, patch và bộ test. Chạy trong sandbox (chi tiết mục 5.2). Kết quả ghi vào run, gửi `TEST_RUN_FINISHED` cho dev (hoặc client nếu là BASE_CHECK).
5. **[D]** `prepareSubmitWork`: cổng kiểm tra. Cần một run `PASSED` cùng `submissionId`, `bundleSha256` và `patchSha256` với bản hiện tại. Nếu không có tiêu chí thực thi nào, cổng bị bỏ qua (`lib/test-runs.ts:24`, xem E-S4).
6. **[D]** ký `submitWork(escrowId, deliveryHash)` bằng ví. Hạn ký: `min(hạn giao, 30 phút)`.
7. **[W]** indexer đọc `WorkSubmitted`, bài nộp chuyển `SUBMITTED`, client được thông báo.
8. **[C]** `requestChanges` (chỉ khi bài đang `SUBMITTED` và hash khớp escrow): đánh dấu `changesRequested`, thông báo dev. **Chỉ lưu DB, không có gì trên chain.**
9. **[D]** nộp lại: `submitWork` lần hai được chấp nhận nếu còn trước hạn giao. Hash mới ghi đè, `submittedAt` được cập nhật.

### 3.7 Duyệt và kết thúc

| Lựa chọn | Ai | Điều kiện | Kết quả |
|---|---|---|---|
| Release | Client | Escrow `FUNDED`, đã có `deliveryHash` | Dev nhận 97.5%, platform 2.5%, vào `claimable` |
| Yêu cầu sửa | Client | Bài `SUBMITTED` | Chỉ DB, dev được thông báo |
| Mở tranh chấp | **Cả hai bên** | Escrow `FUNDED` (không cần có bài nộp, không có mốc thời gian) | Escrow `DISPUTED`, chờ phán quyết |
| Hết hạn duyệt | **Bất kỳ ai** | 7 ngày từ `submittedAt` | Dev nhận tiền (`claimReviewTimeout`) |
| Hết hạn giao | **Bất kỳ ai** | Quá `deliveryDeadline`, chưa có bài | Client được hoàn tiền (`claimMissedDeliveryRefund`) |

Tranh chấp (`DISPUTED`): bằng chứng và phản hồi 72 giờ (`EVIDENCE_RESPONSE_PERIOD`), phán quyết có cửa sổ thách thức 7 ngày (`CHALLENGE_PERIOD`) và thông báo cuối 24 giờ (`FINAL_RULING_NOTICE_PERIOD`). Nếu trọng tài không hành động trong 30 ngày (`ARBITER_STALL_PERIOD`), hợp đồng cho chia theo timeout.

### 3.8 Nhận tiền

- **[D]** `prepareClaim` rồi ký `claim(recipient)` bằng ví. Tiền luôn về `recipient`, không về người gọi.
- **[W]** auto-claim: relayer của platform gọi `claim(dev)` cho các địa chỉ có số dư (không gửi cho `feeRecipient`). Có throttle 10 phút. Nếu relayer hết gas, job ghi cảnh báo và dev vẫn claim tay được.
- Auto-claim **không kiểm tra** người dùng có bị khóa (`isBanned`) hay không (`auto-claim.ts`, truy vấn không có điều kiện này). Chưa thấy rủi ro mất tiền, vì tiền vẫn về đúng ví dev. Chưa kiểm: có cần chặn để đúng chính sách hay không.

### 3.9 Sau khi hoàn tất

- `submitReview`: chỉ client, chỉ khi `COMPLETED`. **Chưa thấy dev đánh giá client** trong danh sách mutation.
- Bình luận công khai (`createIssueComment`): đi qua AI guard, bị chặn nếu người dùng bị khóa hoặc issue `CANCELLED`.

---

## 4. Nhắn tin

### 4.1 Quy tắc quyền

| Phòng | Trạng thái issue | Đọc | Ghi |
|---|---|---|---|
| APPLICATION | `OPEN`, đơn `PENDING` | Client và ứng viên | Client và ứng viên |
| APPLICATION | `OPEN`, đơn `REJECTED` hoặc `WITHDRAWN` | Client và ứng viên (lịch sử) | Không |
| APPLICATION | `AWAITING_FUNDING`, `IN_PROGRESS`… | Client và ứng viên (lịch sử) | Không |
| ISSUE_WORK | `AWAITING_FUNDING`, `IN_PROGRESS`, `DISPUTED` | Client, dev, admin (chỉ khi `DISPUTED`) | Client và dev |
| ISSUE_WORK | `COMPLETED`, `CANCELLED` | Client và dev | Không |
| Bất kỳ | Admin | Chỉ khi `DISPUTED` | **Không** |

Nguồn: `chat-access.ts`. Mọi thay đổi quyền đều được kiểm tra lại khi gửi tin (không chỉ lúc mở phòng).

### 4.2 Các trường hợp nhắn tin

| Mã | Tình huống | Hiện tại | Việc cần làm |
|---|---|---|---|
| M1 | Client nhắn nhiều ứng viên để dò thông tin | Giới hạn 10 tin mỗi 10 giây **trong bộ nhớ của từng process**. Không giới hạn số phòng mới | Giới hạn số phòng `APPLICATION` mở mỗi ngày mỗi người (đề xuất 10). Đưa giới hạn vào Redis khi scale |
| M2 | Trao đổi liên lạc ngoài nền tảng để tránh phí | AI guard che thông tin liên hệ rõ ràng. Chưa kiểm được độ bao phủ với cách viết lách (chữ số viết thành chữ, ký tự tách) | Thêm bộ mẫu kiểm thử cho cách lách phổ biến. Ghi rõ trong điều khoản |
| M3 | Gửi ảnh chứa số liên lạc hoặc mã QR | Tệp chat không được quét nội dung | Chấp nhận có giới hạn: cảnh báo trong UI. Nếu cần chặt hơn thì phải có kiểm duyệt ảnh (chi phí cao) |
| M4 | Người dùng bị quấy rối, không có cách báo cáo | **Không có** chức năng báo cáo tin nhắn hoặc chặn người dùng. Chỉ admin có `banUser` | Thêm báo cáo (tin nhắn, người dùng) và hàng đợi cho admin. Chặn người dùng tại chỗ |
| M5 | Người đã mất quyền vẫn nhận tin mới qua socket | Quyền kiểm tra khi **join room**. Room giữ đến khi ngắt kết nối (review mục 11) | Kiểm tra quyền khi phát tin, hoặc rời room khi trạng thái đổi |
| M6 | Tin gửi trùng do mạng chập chờn | Có `clientMessageId` để chống trùng | Đã có. Cần test khi gửi đồng thời |
| M7 | Ứng viên bị từ chối vẫn đọc được lịch sử | Theo thiết kế (`canReadConversation`) | Quyết định sản phẩm (xem mục 9) |
| M8 | Nhắn tin trước khi có dev, dev chưa được chọn | Phòng `APPLICATION` có. Client không thấy dev khác | Đã đúng theo quyết định D4 |
| M9 | Tệp chat nằm mãi trên S3 sau khi phòng đóng | Tệp được giữ. Không có chính sách xóa | Chính sách lưu trữ: xóa sau N ngày khi bounty đã đóng (quyết định) |
| M10 | Tin chứa mã độc trong tệp | Không quét | Quét tệp trước khi cho tải (ClamAV hoặc dịch vụ bên ngoài). Đây là yêu cầu trước khi mở cho người ngoài |

---

## 5. Bảo mật

### 5.1 Kiểm soát đã có (đã đối chiếu code)

| Lĩnh vực | Kiểm soát | Bằng chứng |
|---|---|---|
| Xác thực | JWT trong cookie, `SameSite=Lax` | `api/auth/*/route.ts`. Chưa kiểm: cờ `HttpOnly` và cơ chế CSRF của `/api/graphql` |
| Phân quyền GraphQL | Kiểm tra vai trò và quyền sở hữu trong từng mutation | Ví dụ: `cancelIssue`, `rejectApplication`, `withdrawApplication`, `selectDeveloper` |
| Đầu vào | zod và `parseOrThrow` | `draft.module.ts:16-27`, `chat-messages.ts:10-14` |
| Tệp tải lên | sha256 do server tính. Kiểm tra kích thước thật. Quyền tải theo `purpose` | `uploads/complete/route.ts`, `uploads/route.ts:177-206` |
| URL ký sẵn | Hết hạn sau 300 giây | `uploads/route.ts` (`expiresIn: 300`) |
| Snapshot nguồn | Chỉ người tham gia và admin (khi `DISPUTED`) tải được. Kiểm tra đường dẫn | `source-snapshots/[id]/route.ts` |
| Lọc secret | `.env*`, khóa và dòng giống khóa bị loại khỏi tarball và context AI | `packages/shared/src/source-privacy.ts`, `source-snapshot.ts` |
| Sandbox test | Không mạng khi chạy test, FS chỉ đọc, bỏ hết capability, không đặc quyền, giới hạn RAM, CPU, tiến trình, timeout | `sandbox.ts:52` |
| Cài đặt Python | Chỉ cài wheel đã đặt tên, không build project | `install-python.py` |
| Giải nén | Từ chối symlink, `..`, `.git`, đường dẫn tuyệt đối. Giới hạn byte thực | `archive.py` |
| Gate nộp bài | Khóa theo `patchSha256` và `bundleSha256` | `lib/test-runs.ts:22-28` |
| Chat | Kiểm tra quyền trong transaction, khóa dòng, AI guard | `chat-messages.ts`, `chat-access.ts` |
| Socket | Xác thực JWT khi join và khi gửi | `socket/handlers.ts` |
| Chữ ký giao dịch | EIP-712, có nonce và hạn | `submitFundingIntent`, `FundingIntent` |
| Hợp đồng | Pull-payment, kiểm tra solvency, fuzz 32768 lần gọi | tracker mục 9 |
| Admin | Ghi nhật ký (`adminLogs`), cấm người dùng (`banUser`) | `analytics`, `admin.module.ts` |
| Bình luận | AI guard, người bị khóa không bình luận được | `issue-comment.module.ts:51,69` |
| Giới hạn tần suất | AI (`aiRateLimit`), chat (10/10 giây), test run (20/ngày/issue) | các module tương ứng |

### 5.2 Tác nhân và mối đe dọa

| Tác nhân | Có thể làm gì | Biện pháp hiện có | Khoảng trống |
|---|---|---|---|
| **Dev độc hại** | Nộp code làm hỏng, chạy vòng lặp vô hạn, cố tác động tới worker, cố lấy secret của client, cố khóa tiền bằng tranh chấp | Sandbox, timeout, FS chỉ đọc, không mạng khi test. Bộ test khóa theo hash | Cài đặt còn mạng (mục 5.3, S-1). Tranh chấp không có điều kiện (mục 6, E-D1). Tệp `.patch` và test có thể thêm file vào `__bloodyroar__/` |
| **Client độc hại** | Đưa repo chứa lệnh giả để làm AI sinh test sai. Đổi tiêu chí sau khi dev đã làm. Duyệt bài rồi tranh chấp để không trả tiền. Spam bounty và ứng viên | Tiêu chí khóa khi đã chọn dev. Đổi nguồn hủy xác minh. Test chạy trong sandbox | Không chặn tranh chấp vô căn cứ của client (E-D1). Chưa có giới hạn số bounty mỗi người |
| **Người ngoài** | Thử truy cập snapshot, tệp, phòng chat. Thử gọi GraphQL không đăng nhập. Tấn công socket | Mọi endpoint kiểm tra quyền. Socket xác thực JWT | Chưa kiểm: rate limit toàn cục cho GraphQL. Rate limit trong bộ nhớ không đủ khi nhiều instance |
| **Admin** | Đọc chat khi tranh chấp. Cấm người dùng. Đổi vai trò | `adminLogs`. Admin không ghi được chat | Chưa thấy cơ chế hai người duyệt cho thao tác nhạy cảm (đổi vai trò, cấm). Chưa kiểm: admin có xem tệp tranh chấp không cần lý do |
| **Nhà cung cấp AI** | Nhận nội dung repo và tin nhắn | Lọc secret trước khi gửi. Chỉ gửi nội dung đã làm sạch | Chưa kiểm: điều khoản lưu trữ của nhà cung cấp. Prompt injection từ code dev (mục 6, E-AI1) |
| **Máy worker** | Bị chiếm thì có thể đọc snapshot, khóa relayer | Relayer chỉ có gas, không giữ USDC. Biến môi trường không được ghi log | `command.ts` truyền toàn bộ `process.env` (kể cả `RELAYER_PRIVATE_KEY`) cho tiến trình con trên host (S-3) |
| **RPC và chain** | Reorg, RPC trả dữ liệu sai | Kiểm tra hash, cửa sổ reorg 64 block, alert | Cửa sổ hash trống đến lần quét đầu tiên sau nâng cấp (mục 6, E-C1) |

### 5.3 Danh sách lỗ hổng và khoảng trống cần xử lý

| Mã | Mức | Vấn đề | Nguồn | Hướng xử lý |
|---|---|---|---|---|
| S-1 | Cao (triển khai) | Cài đặt sandbox còn mạng bridge; cần chặn egress khi deploy | Review mục 3 | Chặn tới mạng nội bộ và metadata bằng luật hạ tầng. Đã ghi trong runbook, chưa làm |
| S-2 | Cao | Tranh chấp không có điều kiện, có thể khóa tiền của bên kia | E-D1 | Quyết định chính sách (mục 9) |
| S-3 | Trung bình | `command.ts` truyền `process.env` cho tiến trình con | Chưa đưa vào review | Truyền môi trường tối thiểu (PATH, HOME, biến git) |
| S-4 | Trung bình | Rate limit trong bộ nhớ | `rate-limit.ts` | Chuyển sang Redis khi có nhiều instance |
| S-5 | Trung bình | Không có kiểm duyệt tệp chat | M10 | Quét tệp trước khi tải |
| S-6 | Thấp | Chưa kiểm: `HttpOnly` và CSRF cho `/api/graphql` | 5.1 | Kiểm tra trước khi mở cho người ngoài |
| S-7 | Thấp | Chưa kiểm: quyền đổi ví người dùng | 6, E-P5 | Kiểm tra code và quyết định |
| S-8 | Thấp | Admin đổi vai trò không cần người thứ hai duyệt | 5.2 | Quyết định (mục 9) |

---

## 6. Ma trận trường hợp biên

Ký hiệu mức: **Cao** (có thể mất tiền hoặc khóa tiền), **Trung** (làm hỏng trải nghiệm hoặc lệch trạng thái), **Thấp** (không ảnh hưởng tiền). Trạng thái: **Đủ** (đã xử lý), **Thiếu** (chưa xử lý), **Quyết định** (cần bạn chọn).

### 6.1 Đăng bounty và nguồn code

| Mã | Tình huống | Hiện tại | Mức | Trạng thái | Việc cần làm |
|---|---|---|---|---|---|
| E-B1 | Client sửa tiêu chí sau khi đã chọn dev | Bị chặn (`ISSUE_NOT_EDITABLE`) | — | Đủ | Không |
| E-B2 | Client đổi nguồn khi đang chạy test | Run bị hủy (`Source changed`), xác minh cũ bị xóa | — | Đủ | Thêm test UI: thông báo cho dev biết |
| E-B3 | Repo private hoặc ref sai | Snapshot `FAILED`, lỗi được ghi | Thấp | Thiếu | UI hiện lỗi và cho đổi nguồn ngay (bước 2 của plan tính năng 1) |
| E-B4 | Repo có symlink | `archive.py` từ chối, snapshot `FAILED` | Thấp | Thiếu | Thông báo rõ "repo có symlink, không hỗ trợ" |
| E-B5 | Framework không phải vitest hoặc pytest | `Unsupported project`, snapshot `FAILED` | Thấp | Đủ (lỗi) | UI hướng dẫn |
| E-B6 | AI sinh test không chạy được hoặc pass hết ở base | `BASE_CHECK` báo lỗi. Test bug phải `failed` ở base | Trung | Thiếu | Vòng tự sửa tối đa 2 lần (plan cũ, mục 3.2 bước 4). Hoặc để client sửa tay |
| E-B7 | Bounty chỉ có BDD, không có test chạy được | Gate nộp bài bị **bỏ qua**, không có kiểm tra tự động (`lib/test-runs.ts:24`) | **Trung** | Quyết định | Xem mục 9, D-5 |
| E-B8 | Client hủy bounty khi đã có nhiều ứng viên | Hủy được khi `OPEN` (`issue.module.ts:753`). Đơn `PENDING` bị xử lý cùng lúc, cách xử lý và có thông báo cho ứng viên hay không chưa kiểm | Thấp | Chưa kiểm | Đọc `issue.module.ts:760-770` và viết test |
| E-B9 | Bounty spam hàng loạt | Chưa thấy giới hạn số bounty mỗi người (chưa kiểm) | Trung | Thiếu | Giới hạn số bounty mở đồng thời |
| E-B10 | Token không đúng chain | `INVALID_TOKEN` khi chọn dev | — | Đủ | Không |

### 6.2 Ứng tuyển và chọn dev

| Mã | Tình huống | Hiện tại | Mức | Trạng thái | Việc cần làm |
|---|---|---|---|---|---|
| E-A1 | Hai client cùng chọn dev cho một bounty | `ISSUE_ALREADY_RESERVED` | — | Đủ | Không |
| E-A2 | Client chọn lại dev vừa hết hạn reservation | Đơn vẫn `PENDING`, chọn lại được | — | Đủ | Không |
| E-A3 | **Dev được chọn rút đơn trong lúc chờ tiền** | `withdrawApplication` chỉ kiểm tra `PENDING`, đơn vẫn `PENDING` khi reservation đang chờ. Khi deposit khớp, `effects/escrow.ts:127` đặt đơn thành `ACCEPTED` **theo id, không kiểm tra trạng thái**. Đơn `WITHDRAWN` bị ghi đè, issue gán cho dev đã rút | **Cao (trạng thái sai, dev bị gán việc)** | Thiếu | (1) Khóa rút đơn khi có reservation `AWAITING_FUNDING` hoặc `FUNDED` của đơn đó. (2) Trong effect, nếu đơn không còn `PENDING` thì đánh dấu `MISMATCHED` và thông báo admin. (3) Test đỏ trước |
| E-A4 | Ứng viên bị từ chối (`REJECTED`) vẫn đọc được phòng | Theo thiết kế (M7) | Thấp | Quyết định | Mục 9 |
| E-A5 | Client từ chối nhưng dev đã nhắn | Đơn `REJECTED`, phòng chỉ đọc | — | Đủ | Không |
| E-A6 | Dev ứng tuyển nhiều bounty cùng lúc | Chưa thấy giới hạn (chưa kiểm) | Thấp | Chưa kiểm | Kiểm tra |

### 6.3 Nạp tiền và đối chiếu

| Mã | Tình huống | Hiện tại | Mức | Trạng thái | Việc cần làm |
|---|---|---|---|---|---|
| E-F1 | Deposit khớp, bình thường | `FUNDED`, `IN_PROGRESS`, thông báo | — | Đủ | Không |
| E-F2 | Deposit sai số tiền, sai ví dev, sai hạn, sai `termsHash` | `MISMATCHED`, admin và hai bên được thông báo, issue mở lại (nếu không muộn) | Trung | Đủ (một phần) | Có runbook và công cụ cho admin xử lý |
| E-F3 | **Deposit muộn mà issue đã có reservation khác** | `MISMATCHED`, issue không đổi. Tiền nằm trong escrow không có projection. Chỉ admin xử lý. Chưa rõ đường hoàn tiền tự động | **Cao (tiền bị khóa ngoài hệ thống)** | Thiếu | Công cụ admin: đọc escrow on-chain, hướng dẫn hoàn tiền qua `claimMissedDeliveryRefund` sau hạn. Ghi rõ trong runbook. Xem chủ đề L1 của review |
| E-F4 | Client gửi chữ ký ví sai, hết hạn, hoặc dùng lại nonce | Chưa kiểm chi tiết trong `submitFundingIntent` | Trung | Chưa kiểm | Đọc code và viết test cho chữ ký sai, hết hạn, nonce đã dùng |
| E-F5 | Client ký deposit nhưng không gửi giao dịch | Intent hết hạn, reservation hết hạn 24 giờ | Thấp | Đủ | Không |
| E-F6 | Client ký deposit, giao dịch treo lâu rồi mới lên | Indexer ghi nhận, đối chiếu lại theo reservation hiện tại | Trung | Đủ | Test: deposit đến sau khi reservation đã `EXPIRED` và issue đã mở lại |
| E-F7 | Reorg làm mất deposit | Đã có cơ chế hash và cửa sổ (review mục 1) | Cao | Đủ (sau khi migration áp) | Test end-to-end với Hardhat |

### 6.4 Làm việc, trao đổi, nộp bài

| Mã | Tình huống | Hiện tại | Mức | Trạng thái | Việc cần làm |
|---|---|---|---|---|---|
| E-S1 | Dev nộp khi chưa có test PASSED | `TESTS_NOT_PASSED` | — | Đủ | Không |
| E-S2 | Dev sửa tệp đính kèm sau khi test PASSED | Hash đổi, phải chạy lại | — | Đủ | Không |
| E-S3 | Patch không áp được vào snapshot | Run `ERROR` "Patch does not apply" | Thấp | Đủ | UI nêu rõ nguyên nhân |
| E-S4 | Bounty không có tiêu chí thực thi | Gate bị bỏ qua | **Trung** | Quyết định | Xem D-5 |
| E-S5 | Run kẹt do worker chết | Chuyển `ERROR` sau 20 phút. Không khóa vĩnh viễn nữa | — | Đủ | Test đã có |
| E-S6 | Dev chuẩn bị ký rồi sửa draft | Tạo bản mới, bản cũ vẫn `DRAFT` mãi | Thấp | Thiếu | Dọn bản `DRAFT` cũ khi bản mới được ký, hoặc đánh dấu `SUPERSEDED` |
| E-S7 | Dev bấm chuẩn bị ký rồi bỏ | Intent hết hạn sau 30 phút | Thấp | Đủ | Không |
| E-S8 | **Dev nộp hai lần liên tiếp trước hạn** | Bản hai ghi đè bản một trên chain. `submittedAt` được cập nhật | Trung | Quyết định | Xem E-S9 |
| E-S9 | **Client duyệt bản A, dev nộp bản B trước khi client bấm release** | `releaseFunds(escrowId)` **không có tham số hash**. Client có thể ký release cho bản B chưa xem | **Cao (trả tiền cho bản chưa duyệt)** | Thiếu | Hai lựa chọn: (a) sửa contract `releaseFunds(escrowId, expectedDeliveryHash)` (cần audit). (b) Server chặn `prepareReleaseFunds` nếu hash mới nhất khác hash client đã xem (client gửi hash đã xem). Khuyến nghị (b) trước, (a) sau |
| E-S10 | Dev nộp sau hạn giao | Contract `DeadlinePassed`. Server chặn bằng chứng từ chain | — | Đủ | Không |
| E-S11 | Client yêu cầu sửa sau hạn giao | Dev không nộp lại được (contract chặn). Chỉ còn hết hạn duyệt hoặc tranh chấp | Trung | Quyết định | Cho phép gia hạn có điều kiện, hoặc ghi rõ cho client trước khi yêu cầu sửa |
| E-S12 | Client không bao giờ duyệt | Sau 7 ngày từ `submittedAt`, bất kỳ ai gọi `claimReviewTimeout` | Trung | Đủ | Nhắc client qua thông báo (job `deadline-notifications`, chưa kiểm nội dung) |
| E-S13 | Dev không bao giờ nộp | Sau hạn giao, client gọi `claimMissedDeliveryRefund` | Trung | Đủ | Không |
| E-S14 | Worker chạy test không hoạt động, run mãi ở `QUEUED` | Không có timeout cho `QUEUED`. Dev và client chờ vô hạn | Trung | Thiếu | Cảnh báo khi `QUEUED` quá N phút. Trang trạng thái worker |
| E-S15 | Patch thêm file vào `__bloodyroar__/` | File đó cũng được chạy cùng bộ test. Kết quả chỉ tính theo marker `[TC:id]`, nên không làm đổi kết quả của test thật | Thấp | Đủ (một phần) | Test: file lạ không ảnh hưởng kết quả |
| E-S16 | Dev nộp patch chứa secret | Patch được lưu và hiện cho client | Trung | Thiếu | Quét patch bằng cùng bộ mẫu với snapshot |
| E-S17 | Chat trước khi có dev, dev bị từ chối giữa chừng | Phòng APPLICATION chỉ đọc sau khi bị từ chối | — | Đủ | Không |

### 6.5 Tranh chấp, trọng tài, nhận tiền

| Mã | Tình huống | Hiện tại | Mức | Trạng thái | Việc cần làm |
|---|---|---|---|---|---|
| E-D1 | **Bên nào cũng mở tranh chấp bất cứ lúc nào khi `FUNDED`** | Contract không yêu cầu có bài nộp, không có mốc thời gian, không có phí. Dev có thể mở tranh chấp sau hạn giao để chặn client hoàn tiền. Client có thể mở ngay sau khi dev nộp để trì hoãn trả tiền. Tiền bị khóa tối đa 30 ngày (`ARBITER_STALL_PERIOD`) | **Cao (khóa tiền có chủ đích)** | Quyết định | Xem mục 9, D-2 |
| E-D2 | Trọng tài không hành động | Sau 30 ngày, chia theo timeout | Trung | Đủ | Thông báo rõ thời hạn cho các bên |
| E-D3 | Bằng chứng nộp sau thời hạn 72 giờ | Chưa kiểm | Trung | Chưa kiểm | Kiểm tra `submitCounterpartyEvidence` |
| E-D4 | Admin đọc tệp tranh chấp | Chỉ admin khi có tranh chấp (`canDownload`) | Thấp | Đủ | Ghi nhật ký truy cập tệp (chưa kiểm) |
| E-D5 | Phán quyết bị thách thức | Cửa sổ 7 ngày | — | Đủ | Không |
| E-R1 | Client duyệt xong, dev claim, rồi bị khóa tài khoản | Tiền vẫn claim được (auto-claim không kiểm tra ban) | Thấp | Quyết định | Mục 9, D-7 |
| E-R2 | Dev đổi ví sau khi có tiền claimable | Tiền gắn với địa chỉ cũ, phải ký bằng ví cũ | Trung | Chưa kiểm | Kiểm tra việc đổi ví (S-7) |
| E-R3 | Relayer hết gas | Cảnh báo `RELAYER_LOW_GAS`, dev claim tay | Thấp | Đủ | Không |
| E-R4 | Relayer gửi trùng khi chạy nhiều worker | Chưa có khóa. Scheduler chỉ tránh chồng trong một process | Trung | Thiếu (khi scale) | Khóa phân tán, hoặc một worker cho auto-claim |

### 6.6 Hệ thống và các tình huống kỹ thuật

| Mã | Tình huống | Hiện tại | Mức | Trạng thái | Việc cần làm |
|---|---|---|---|---|---|
| E-C1 | Sau nâng cấp, map hash còn trống đến lần quét đầu | Reorg sâu trong khoảng đó dừng indexer (fail-closed) | Thấp | Đủ (có ghi chú) | Ghi trong runbook. Không deploy vào lúc chain đang biến động |
| E-C2 | Indexer lỗi RPC kéo dài | Cảnh báo sau chuỗi lỗi | Trung | Đủ | Kiểm tra cảnh báo tới đúng người |
| E-C3 | Hai tiến trình web cùng ghi chat | Khóa trong transaction | — | Đủ | Test đồng thời (đã có một phần) |
| E-AI1 | Prompt injection từ code dev (khi có tính năng 2) | Chưa có tính năng | Cao (khi làm) | Thiếu | Thiết kế theo mục 2.5 của plan tính năng |
| E-AI2 | Repo client chứa lệnh giả làm AI sinh test sai | Test được kiểm chứng trên base trước khi approve | Trung | Đủ (một phần) | Client là người duyệt cuối |
| E-AI3 | AI trả JSON sai schema | Chưa kiểm | Thấp | Chưa kiểm | Kiểm tra schema đầu ra |
| E-P1 | Đổi tiêu chí không làm tăng `termsVersion` | Có `termsVersion`, tăng khi tiêu chí đổi | — | Đủ | Test |
| E-P2 | Người dùng bị cấm vẫn đăng nhập | Chưa kiểm | Trung | Chưa kiểm | Kiểm tra session khi bị cấm |
| E-P3 | Hai người cùng duyệt một test | Chưa có | Thấp | Chưa kiểm | Không ảnh hưởng tiền |
| E-P4 | Người dùng xóa tài khoản | Chưa thấy chức năng | Trung | Chưa kiểm | Quyết định chính sách |
| E-P5 | Đổi ví | Chưa kiểm | Trung | Chưa kiểm | Mục S-7 |

---

## 7. Kế hoạch việc tiếp theo

Thứ tự theo rủi ro tiền và mức độ chặn người dùng. Mỗi việc có điều kiện hoàn thành để kiểm tra.

### P0: trước khi chạy tiền thật hoặc mời người ngoài

| # | Việc | Liên quan | Điều kiện hoàn thành | Ai làm |
|---|---|---|---|---|
| 0.1 | Áp 3 migration lên Supabase | 0.2 | `migrate status` báo up to date. Kiểm tra lại số dòng các bảng liên quan | Bạn (chạy lệnh) |
| 0.2 | Khóa rút đơn khi đã được chọn, và chặn ghi đè trạng thái ở effect | E-A3 | Test đỏ: dev rút trong lúc chờ tiền thì bị chặn. Test: effect không ghi đè đơn `WITHDRAWN` | Codex |
| 0.3 | Ràng buộc release với bài đã duyệt | E-S9 | Test: client duyệt bản A, dev nộp bản B, prepare release bị chặn với lỗi rõ ràng | Codex (phương án b). Phương án a cần quyết định |
| 0.4 | Quy tắc tranh chấp | E-D1 | Đã có quyết định (mục 9, D-2). Code và test theo quyết định | Bạn quyết, Codex làm |
| 0.5 | Công cụ admin cho deposit lệch | E-F2, E-F3 | Runbook có bước xử lý. Admin xem được escrow lệch trên UI | Codex + bạn |
| 0.6 | Truyền env tối thiểu cho tiến trình con | S-3 | Test: tiến trình con không nhận `RELAYER_PRIVATE_KEY` | Codex |
| 0.7 | Chặn egress sandbox khi deploy | S-1 | Có luật hạ tầng và kiểm tra thử từ sandbox không tới được mạng nội bộ | Bạn (hạ tầng) |

### P1: hoàn thiện tính năng cốt lõi

| # | Việc | Liên quan | Điều kiện hoàn thành |
|---|---|---|---|
| 1.1 | UX đăng bounty 3 bước, chọn file, ghi chú lỗi | Plan tính năng 1 | Test UI: đi hết ba bước, lưu nháp, hiện lỗi snapshot |
| 1.2 | `focusFiles` và `hint` cho AI sinh test | Plan tính năng 1, 1.4 | Test: file được chọn nằm đầu context. Đường dẫn không hợp lệ bị từ chối |
| 1.3 | Vòng tự sửa test tối đa 2 lần | E-B6 | Test: test sai được sửa và kiểm chứng lại |
| 1.4 | Quy tắc bounty không có test chạy được | E-B7, E-S4 | Theo quyết định D-5 |
| 1.5 | Báo cáo và chặn người dùng | M4 | Test: báo cáo đi vào hàng đợi admin. Người bị chặn không nhắn được |
| 1.6 | Kiểm quyền khi phát tin qua socket | M5, S-4 | Test: người đã mất quyền không nhận tin mới |
| 1.7 | Giới hạn phòng APPLICATION mới mỗi ngày | M1 | Test: vượt giới hạn bị từ chối |
| 1.8 | Quét tệp chat và patch | M10, S-5, E-S16 | Test: tệp chứa mẫu độc bị chặn |
| 1.9 | Báo cáo bài nộp AI, phương án C | Plan tính năng 2 | Test: prompt injection không làm đổi kết quả test. Output sai schema bị bỏ |
| 1.10 | Cảnh báo `QUEUED` quá lâu | E-S14 | Test: cảnh báo được gửi |
| 1.11 | Đưa gate nộp bài lên chain | Review mục 7 | Quyết định D-4. Nếu chọn làm: thay contract, audit |

### P2: mở rộng và cứng hóa khi scale

| # | Việc | Liên quan |
|---|---|---|
| 2.1 | Rate limit trên Redis | S-4 |
| 2.2 | Khóa phân tán cho auto-claim và snapshot | E-R4 |
| 2.3 | Đường 2: nộp commit trên GitHub public | Plan tính năng 2.3 |
| 2.4 | Dev đánh giá client | Mục 3.9 |
| 2.5 | Chính sách lưu trữ tệp chat | M9 |
| 2.6 | Mục 12–15 của review | Review |

---

## 8. Kịch bản kiểm thử E2E

Đã có (trong `apps/web/scripts/e2e-role-flows.ts`): S1 luồng chuẩn, S2 yêu cầu sửa, S3 reservation hết hạn, S4 dev trễ hạn, S5 hết hạn duyệt.

Cần thêm:

| Mã | Kịch bản | Kết quả mong đợi |
|---|---|---|
| T-1 | Dev được chọn rút đơn trong lúc chờ tiền | Bị chặn (sau khi sửa E-A3) |
| T-2 | Deposit muộn, issue đã có reservation khác | `MISMATCHED`, issue không đổi, admin được thông báo |
| T-3 | Deposit muộn, issue vẫn `OPEN` | Được nhận (QĐ-17), đúng số tiền và hạn |
| T-4 | Client duyệt bản A, dev nộp bản B, client release | Bị chặn (sau khi sửa E-S9) |
| T-5 | Dev nộp hai lần trước hạn, client release bản cuối | Release đúng bản cuối, hash khớp |
| T-6 | Bên nào đó mở tranh chấp khi chưa có bài nộp | Theo quyết định D-2 |
| T-7 | Tranh chấp, trọng tài không hành động 30 ngày | Chia theo timeout đúng số tiền |
| T-8 | Test runner dừng giữa chừng | Run `ERROR` sau 20 phút, dev chạy lại được |
| T-9 | Snapshot repo có symlink | `FAILED` với thông báo rõ |
| T-10 | Ứng viên bị từ chối cố nhắn | Bị chặn |
| T-11 | Admin cố nhắn trong phòng tranh chấp | Bị chặn |
| T-12 | Socket: người mất quyền nhận tin | Không nhận (sau khi sửa M5) |
| T-13 | Chat: tin trùng do gửi lại | Chỉ lưu một tin |
| T-14 | Reorg làm mất deposit | Cửa sổ hash và alert đúng |
| T-15 | Zip bom và tệp giải nén quá lớn | Bị từ chối |

---

## 9. Quyết định cần bạn chốt

Khuyến nghị đã nêu. Ghi "Chờ" nếu chưa có.

| Mã | Câu hỏi | Khuyến nghị | Ảnh hưởng |
|---|---|---|---|
| D-1 | Áp migration lên Supabase | Chạy ngay, sau khi chụp snapshot Supabase | Mở khóa mọi tính năng mới trên DB thật |
| D-2 | **Quy tắc tranh chấp** | Dev chỉ mở tranh chấp sau khi đã nộp hoặc khi client yêu cầu sửa. Client chỉ mở tranh chấp trước hạn duyệt và phải nêu lý do. Mở tranh chấp không vô hạn: tối đa một lần cho mỗi bài nộp. Cân nhắc phí tranh chấp nhỏ để chặn lạm dụng | Cần đổi contract (điều kiện) nếu muốn ép trên chain, cần audit |
| D-3 | Ràng buộc release với bản đã duyệt (E-S9) | Server chặn trước (phương án b). Sau đó đưa lên contract khi có audit | Không cần đổi contract ở bước đầu |
| D-4 | Gate nộp bài: giữ ở server hay đưa lên chain | Giữ ở server. Ghi rõ trong UI rằng đây là kiểm tra của platform. Client phải xem kết quả trước khi release | Đưa lên chain cần đổi contract và audit |
| D-5 | Bounty không có test chạy được | Bắt buộc có ít nhất một test chạy được khi bounty dùng nguồn code. Nếu không có, hiện cảnh báo to cho dev: "không có kiểm tra tự động" và ghi vào hợp đồng | Thay đổi UX đăng bounty |
| D-6 | Dev rút đơn khi đã được chọn (E-A3) | Không cho rút khi có reservation đang chờ hoặc đã nạp tiền | Làm trước khi chạy tiền thật |
| D-7 | Người bị cấm có được claim tiền không | Vẫn cho claim (tiền là của họ, không phải của platform). Chỉ chặn đăng bounty và nhắn tin | Đơn giản, không đổi code claim |
| D-8 | Ứng viên bị từ chối có đọc được phòng không | Đọc được (lịch sử). Không ghi được | Đã đúng hiện tại |
| D-9 | Admin đổi vai trò hoặc cấm người dùng có cần người thứ hai duyệt | Có, khi hệ thống có từ hai admin trở lên | Thêm một bước phê duyệt |
| D-10 | Dev đánh giá client | Có, sau khi bounty `COMPLETED`. Đánh giá công khai, một lần | Thêm mutation và UI |
| D-11 | Giới hạn bounty mở đồng thời mỗi client | 5 | Chặn spam |
| D-12 | Giới hạn phòng APPLICATION mới mỗi ngày | 10 | Chặn dò thông tin |
| D-13 | Lưu tệp chat bao lâu | 90 ngày sau khi bounty đóng | Giảm chi phí và rủi ro lộ dữ liệu |
| D-14 | Ai là trọng tài | Chưa rõ trong tài liệu. Cần chốt trước khi mở tranh chấp cho người dùng thật | Cả quy trình tranh chấp |
| D-15 | Tính năng 1 và 2 (chọn file, báo cáo AI cho client) | Có chọn file. Báo cáo AI hiện cho client, ghi rõ là phụ trợ | Plan tính năng |

---

## 10. Vận hành khi triển khai

### 10.1 Trình tự

1. Chụp snapshot Supabase.
2. Áp migration (mục 0.2). Kiểm tra `migrate status`.
3. Dừng worker cũ. Chạy worker mới với `TEST_RUNNER_ENABLED`, `RELAYER_*`, `ALERT_WEBHOOK_URL`, `INDEXER_REORG_WINDOW` theo kế hoạch.
4. Khởi động web mới.
5. Theo dõi: lag của indexer, lỗi RPC, cảnh báo reorg, run `QUEUED` quá lâu, relayer hết gas.
6. Trong 24 giờ đầu, không mở tranh chấp cho người dùng thật (đến khi D-2 có).

### 10.2 Hoàn tác

- Các migration chỉ thêm cột và giá trị enum. Hoàn tác cột: `ALTER TABLE ... DROP COLUMN`. Giá trị enum `PROCESSING` khó gỡ trong PostgreSQL. Bản code cũ vẫn chạy được với cột thừa.
- Worker mới đổi cách lưu hash. Nếu cần quay lại bản cũ, hash đã lưu bị bỏ qua và cửa sổ hash sẽ trống. Nên tránh rollback giữa lúc chain biến động.

### 10.3 Cảnh báo

- `RELAYER_LOW_GAS`, `REORG_BEYOND_WINDOW` (một lần mỗi sự cố), lag indexer, lỗi RPC liên tiếp. Gửi qua `ALERT_WEBHOOK_URL`.
- Cần thêm: cảnh báo run `QUEUED` quá lâu (E-S14), snapshot `PROCESSING` quá lâu.

---

## Phụ lục A: Bản đồ code

| Chủ đề | File |
|---|---|
| Trạng thái issue, hủy, sửa | `apps/web/src/graphql/modules/issue/issue.module.ts` |
| Nguồn code | `apps/web/src/graphql/modules/issue/issue-source.module.ts` |
| Ứng tuyển, rút, từ chối | `apps/web/src/graphql/modules/application/application.module.ts` |
| Chọn dev, reservation | `apps/web/src/graphql/modules/escrow/select.module.ts` |
| Nạp tiền, intent | `apps/web/src/graphql/modules/escrow/intent.module.ts` |
| Nộp bài, draft, gate | `apps/web/src/graphql/modules/submission/draft.module.ts`, `lib/test-runs.ts` |
| Test run | `apps/web/src/graphql/modules/submission/test-runs.module.ts`, `apps/worker/src/jobs/test-runs.ts` |
| AI sinh test | `apps/web/src/graphql/modules/ai/ai.module.ts`, `apps/web/src/ai/` |
| Chat | `apps/web/src/graphql/modules/chat/`, `lib/chat-messages.ts`, `lib/chat-access.ts`, `socket/handlers.ts` |
| Tệp và quyền tải | `apps/web/src/app/api/uploads/route.ts` |
| Snapshot | `apps/worker/src/jobs/source-snapshot.ts`, `apps/web/src/app/api/source-snapshots/[id]/route.ts` |
| Sandbox | `apps/worker/src/runner/sandbox.ts`, `install-python.py`, `archive.py` |
| Lọc secret | `packages/shared/src/source-privacy.ts` |
| Effect deposit | `apps/worker/src/effects/escrow.ts` |
| Reservation hết hạn | `apps/worker/src/jobs/reservations.ts` |
| Auto-claim | `apps/worker/src/jobs/auto-claim.ts` |
| Reorg | `apps/worker/src/indexer/reorg.ts`, `scanner.ts` |
| Contract | `apps/contracts/contracts/BloodyRoarEscrow.sol` |
| Hằng số | `packages/shared/src/escrow/constants.ts` |

## Phụ lục B: Giả định và phần chưa kiểm

- Tải giả định: một worker, vài chục người dùng, chạy trên máy phát triển. Chưa có số liệu tải thật.
- Chưa kiểm: chính sách cookie `HttpOnly`, CSRF cho `/api/graphql`, quyền đổi ví, nội dung thông báo `deadline-notifications`, giới hạn số bounty mỗi người, cách UI công bố bounty từ nháp.
- Chưa chạy: E2E với UI, zip bom và sandbox độc hại trên Docker thật, nhiều worker cùng lúc.
- Mọi thứ không có trong tài liệu này là chưa được xác nhận. Không coi là đã xử lý.
