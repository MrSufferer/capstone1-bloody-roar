# Định hướng kiến trúc: đối chiếu tài liệu kiến trúc với code hiện tại

Ngày: 2026-11-12. Nhánh: `feat/payout-testrunner-chat`.
Đọc cùng: `ROADMAP_2026-08-01_to_2026-12-15.md`, `WORK_BREAKDOWN_2026-11-12.md`, `NEXT_STEPS_CLIENT_DEV_2026-11-12.md`.

---

## 0. Nguồn tài liệu

| Mã | Tài liệu | Tác giả trong repo | Ghi chú |
|---|---|---|---|
| **A** | `docs/PROPOSAL.md` mục 9 (kiến trúc mục tiêu, trạng thái Implemented / Target / Deferred), mục 11–15 (lịch, phân công, rủi ro, tiêu chí) | Commit `de00c56`, `8b33f29`, `906393e`, tài khoản `MrSufferer` (tkien2703@gmail.com) | Đây là tài liệu kiến trúc do Kiên viết theo commit. |
| **A2** | 11 sơ đồ UML: `docs/diagrams/rendered/01..11-*.png` | Commit `906393e`, cùng tài khoản | Hình minh họa cho mục 9 của A. |
| **A3** | `apps/contracts/SECURITY.md` | Cùng tài khoản | Ghi chú bảo mật contract. |
| **B** | `docs/submit-document/5. ArchitectureDesign_Caps1_BloodyRoar_v1.1.docx` | Tác giả Khôi, ngày 9/11/2026; cả team ký | Tài liệu đã nộp, mới hơn A. |

Lưu ý:
- Không tìm thấy chữ "kyler" trong repo. Xác định tài liệu của Kiên qua commit. Nếu Kiên viết ở nơi khác (Google Doc, Notion), gửi tôi link để đối chiếu.
- Thư mục `Captone2_ODWai-1/` là bài của team khác (Team17), không dùng.

---

## 1. Điểm thống nhất giữa A, B và code (giữ nguyên)

| Điểm | Bằng chứng trong code |
|---|---|
| Escrow không upgrade, không có rút tùy ý, chỉ pull-payment | `BloodyRoarEscrow.sol` không có proxy; luồng tiền qua `claim(recipient)` |
| Pause chỉ chặn `deposit` | `whenNotPaused` chỉ có ở `deposit` (dòng 232). Các hàm còn lại không bị chặn |
| Từ chối token fee-on-transfer | `if (received != amount) revert InvalidReceivedAmount` (dòng 246) |
| Token phải có 6 decimals | `if (decimals != 6) revert InvalidTokenDecimals` (dòng 219) |
| Owner đổi quyền hai bước | `Ownable2Step`; `proposeArbiter`, `proposeFeeRecipient` và hàm accept tương ứng |
| Chỉ Safe ký quyền quản trị | Owner, arbiter và fee recipient là Safe 2-of-3, có file `deployment-checks.ts` |
| AI chỉ mang tính tư vấn, không gọi `releaseFunds`, không đăng ruling | Plan tính năng 2; B mục 2 và bảng "AI advisory boundary" |
| `ChainEvent` có cờ canonical, checkpoint, phát lại khi reorg | `apps/worker/src/indexer/*`; batch reorg đã sửa (hash cửa sổ, cảnh báo một lần) |
| Trạng thái giao dịch không lấy từ `TransactionIntent` | Intent có `PENDING_SAFE_HEAD`, xác nhận khi event đã áp dụng (`effects/escrow.ts:159`) |
| Chat qua Socket.IO, có giới hạn kích thước payload | `socket/handlers.ts`; be-59 (256 KB) |
| Phí 2.5% từ phần developer, refund không phí | `PLATFORM_FEE_BPS = 250`; A mục 9.3 #3; B mục 4 |
| Timeout trọng tài 30 ngày, thách thức 7 ngày, thông báo cuối 24 giờ | Hằng số `ARBITER_STALL_PERIOD`, `CHALLENGE_PERIOD`, `FINAL_RULING_NOTICE_PERIOD` |
| Evidence để ngoài chuỗi, chỉ đưa digest on-chain | `createEvidenceManifest`; hash in `raiseDispute` |

---

## 2. Mâu thuẫn cần chốt

Đây là các điểm A, B và code không khớp nhau. Mỗi điểm cần một quyết định và ghi vào ADR.

| # | Chủ đề | A (PROPOSAL §9, Kiên) | B (Architecture v1.1, Khôi) | Code hiện tại | Đề xuất |
|---|---|---|---|---|---|
| M-1 | **Hạn duyệt (review)** | Bất biến 4 (§9.3): hạn cố định `deliveryDeadline + 7 ngày`. Nộp sát hạn không gia hạn. Tiêu chí §15: "fixed review timeout" | Không nêu rõ | Contract tính `submittedAt + 7 ngày` (dòng 301). Quyết định D1 trong sprint plan | **Theo A**, trừ khi team đổi có lý do. Đổi lại cần sửa contract, test, và đếm ngược trên UI (khoảng 2 pd). Phải chốt **trước khi deploy Base Sepolia (mục 2.x)** |
| M-2 | **Relayer tự claim** | §9.4: "MVP không có oracle/relayer" | Không có relayer. Developer tự claim | Có `auto-claim` dùng khóa relayer của platform trả gas (`auto-claim.ts`) | **Tắt mặc định, giữ claim thủ công** làm đường chính cho MVP. Nếu giữ relayer, phải ghi là trái A |
| M-3 | **Cơ sở dữ liệu** | §9.6: Supabase PostgreSQL | ADR-0001: Neon Postgres + pgvector (Target) | `.env` đang trỏ Supabase (DB thật có dữ liệu) | **Chốt một DB cho MVP: Supabase.** Neon chỉ xem xét ở M6 nếu cần pgvector. Cập nhật B |
| M-4 | **Lưu evidence** | §9.5: Supabase Storage, bucket riêng, signed URL hết hạn | Supabase Storage (private) | S3 presigned qua AWS SDK (`uploads/route.ts`) | Dùng S3-compatible API của Supabase, bucket private, URL hết hạn. Cập nhật QĐ-28. Khoảng 1 pd |
| M-5 | **Cách nộp bài** | §9.4: user nộp "work"; không nói rõ cách | Developer nộp "repository link and delivery hash" | File `.patch` upload (đường 1). Commit GitHub là đường 2 (chưa làm) | Giữ đường 1 cho MVP vì không cần quyền repo. **Ghi rõ là khác B** và đề nghị cập nhật B hoặc ghi ADR |
| M-6 | **Xác minh bằng test (AI)** | Không có trong A | "Verification Run" là GitHub Actions, chạy sau Submission, kết quả chỉ là evidence (Target, M6) | Sandbox Docker trên worker, gate chặn nộp khi chưa PASSED | Giữ sandbox worker cho MVP, GitHub Actions có thể xem ở M6. Gate chỉ chặn nộp, không chặn tiền, nên không mâu thuẫn với B. Ghi rõ |
| M-7 | **Triển khai** | §9.6: Railway (web và worker), Supabase, Alchemy. Có health check, rollback | "Not deployed yet… local-only" tại commit 74b21b6 | Có `railway.json`, `Dockerfile`. Deploy Base Sepolia là 2.x (chưa làm) | Cập nhật B khi deploy thật. Thêm runbook rollback (xem mục 3) |

---

## 3. Đối chiếu yêu cầu kiến trúc với code

Trạng thái: **Đạt** (có bằng chứng), **Một phần** (có nhưng chưa đủ), **Thiếu** (chưa làm), **Chưa kiểm** (cần đọc thêm).

### 3.1 Contract (A §9.3, A3)

| Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| Hạn duyệt cố định `deliveryDeadline + 7 ngày` | **Thiếu** | Xem M-1 |
| Refund, timeout, settlement, ruling, arbiter-stall không gọi fee recipient | **Chưa kiểm** | Cần đọc `_resolve`. Có test `fee accounting` trong 36 test |
| Hợp đồng không upgrade, không modifier thay đổi trạng thái sau deploy | **Đạt** | Không có proxy |
| Test: deployment roles, decimals, duplicate ID, fee-on-transfer, latest-hash release | **Một phần** | 36 test passing. Chưa kiểm từng test có trong danh sách §15 không |
| Fuzz và invariant test (tổng outflow không vượt deposit) | **Đạt** | Đã chạy 32.768 lần gọi (tracker mục 9) |
| Static analysis (Slither) | **Một phần** | Có `slither.config.json`. Chưa thấy báo cáo kết quả trong repo |
| Kiểm tra độc lập (review bên ngoài) | **Thiếu** | Rủi ro mức cao trong A §14. Chưa có người review ngoài nhóm |

### 3.2 Indexer và projection (A §9.5)

| Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| `ChainEvent` append-only, khóa `(chainId, contractAddress, txHash, logIndex)` | **Chưa kiểm** | Cần đọc schema `ChainEvent` |
| Chỉ fold log đến safe head | **Một phần** | Có `lastSafeBlock` trong checkpoint. Cần xác nhận indexer chỉ đọc đến safe head |
| Event xử lý có thứ tự, idempotent, phát lại được, nhận biết reorg | **Đạt** | Đã sửa reorg (hash cửa sổ, cảnh báo một lần) |
| Trạng thái tài chính không lấy từ `TransactionIntent` | **Đạt** | |
| `ProjectionCheckpoint` có decoder version và replay status | **Một phần** | Có `decoderVersion`. Cần kiểm tra `replayStatus` |

### 3.3 Backend và API (A §9.4)

| Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| GraphQL trả calldata có kiểu, không đánh dấu thành công | **Đạt** | `PreparedCall`, `prepare*` |
| Xác minh chữ ký EIP-712 còn hạn, khớp signer, token, amount, terms hash | **Chưa kiểm** | Cần đọc `submitFundingIntent` và `prepareEscrowDeposit` |
| Quyền admin tách khỏi quyền Safe | **Đạt** | Admin không ký gì on-chain |
| Không có relayer, không có tự thanh toán khi merge PR | **Thiếu** | Có auto-claim relayer (M-2). Webhook GitHub chỉ ghi nhận trạng thái PR |

### 3.4 Vận hành và quan sát (A §9.6)

| Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| Health check web: liveness và kết nối DB | **Chưa kiểm** | |
| Health check worker: safe head, tuổi checkpoint, độ trễ RPC, số job đang chờ, độ trễ projection | **Một phần** | Có `health.ts` với safe head, RPC latency, cursor. **Thiếu:** số job đang chờ, projection lag |
| Log có chain ID, contract, escrow ID, event identity, correlation ID; không log evidence hay secret | **Một phần** | Có pino và requestId. Cần kiểm tra không log secret |
| RPC lỗi: giữ checkpoint, retry có backoff, bắt kịp từ safe head | **Đạt** | Có `rpcErrorStreak` và alert |
| Rollback về artifact cũ | **Thiếu** | Chưa có runbook. Thêm vào `RUNBOOK.md` |
| Triển khai Base Sepolia có guard, verify contract, constructor args tái lập được | **Thiếu** | Mục 2.x |

### 3.5 Frontend (A §15)

| Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| Phân biệt: chờ ký, đã gửi, chờ safe head, đã xác nhận, thất bại | **Một phần** | Trạng thái intent có trong DB. UI chưa kiểm |

### 3.6 Bảo mật và phụ thuộc (A3, A §14)

| Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| Không còn advisory high/critical trong cây phụ thuộc production | **Thiếu** | A3 ghi rõ: lockfile có advisory high/critical trong dev tooling và web. Phải xử lý trước production. Dùng `bun audit` nếu có |
| Không dùng phiên bản `latest` | **Một phần** | Đã pin 3 package ở batch P3. Còn `@pothos/plugin-with-input` (đã pin ở review vòng 1) |
| Evidence không lộ ra ngoài | **Chưa kiểm** | Cần xác nhận bucket private và URL hết hạn |
| Ký tiền có Safe 2-of-3 tách bộ ký | **Chưa kiểm** | Chỉ có file kiểm tra. Chưa deploy |

### 3.7 Hợp đồng API (A §9.4, B)

| Yêu cầu | Trạng thái | Ghi chú |
|---|---|---|
| Đóng băng GraphQL SDL v1 ở M2 | **Thiếu** | Chưa đóng băng. Schema đang đổi liên tục |

---

## 4. Định hướng tiếp theo

### 4.1 Việc phải làm trước khi deploy Base Sepolia (mục 2.x)

Thứ tự theo phụ thuộc:

1. **Chốt M-1 (hạn duyệt).** Quyết định này ảnh hưởng contract, nên phải có trước deploy. Ai quyết: Kiên (chủ contract) và Khôi (tác giả B), sau đó mentor duyệt. Đề xuất theo A.
2. **Chốt M-2 (relayer).** Tắt auto-claim mặc định. Không ảnh hưởng contract.
3. **Chốt M-3 (DB).** Supabase. Không tốn công.
4. **Viết ADR-0004 đến ADR-0007** cho M-1, M-2, M-5, M-6. B đã tham chiếu ADR-0001..0003, nên dùng cùng định dạng.
5. **Cập nhật B** sau khi chốt, vì B là tài liệu đã nộp. Ghi phiên bản 1.2.
6. **Review độc lập contract** trước deploy: người ngoài nhóm đọc `BloodyRoarEscrow.sol` và danh sách bất biến. Hiện chưa có (3.1).

### 4.2 Việc cần thêm vào backlog (chưa có trong 58,5 pd MVP)

| Việc | Ước lượng | Lý do | Gợi ý |
|---|---|---|---|
| Evidence sang Supabase bucket riêng, URL hết hạn (M-4) | 1 pd | A và B đều yêu cầu | Đưa vào MVP |
| Digest evidence theo RFC 8785 + keccak256 (A §9.5) | 1,5 pd | Là cam kết mật mã trong A | Đưa vào MVP nếu có evidence on-chain |
| Health check worker đủ trường (job đang chờ, projection lag) | 1 pd | A §9.6 | Đưa vào MVP |
| Đóng băng GraphQL SDL v1 | 1 pd | A §9.4 | Đưa vào MVP |
| Xử lý advisory trong cây phụ thuộc (A3) | 2 pd | Bắt buộc trước production | Đưa vào MVP, ít nhất xử lý high/critical |
| Runbook rollback Railway | 1 pd | A §9.6 | Đưa vào MVP |
| UI trạng thái giao dịch đủ 5 trạng thái (A §15) | 2 pd | Yêu cầu chấp nhận | Đưa vào MVP nếu còn chỗ, nếu không thì dời |
| Review contract độc lập | Không do team tự làm | A §14 | Cần xếp lịch với mentor hoặc nhóm khác |

**Tổng 9,5–10,5 pd.** Vượt dự phòng hiện có (1,5 pd). Phải cắt tương ứng trong MVP, hoặc dời việc không bắt buộc sang sau 15/12. Đề xuất cắt: UI trạng thái (2 pd) và GraphQL SDL (1 pd) nếu cần. Giữ advisory và evidence.

### 4.3 Việc có thể dời sau 15/12

- Neon, pgvector và toàn bộ AI layer M6 (Platform Assistant, Acceptance Interview, Dispute Analysis) theo B.
- GitHub Actions Verification Run (B, M6).
- Đường nộp commit (đường 2).
- Safe testnet đầy đủ (chỉ cần khi deploy).

---

## 5. Rủi ro kiến trúc cần ghi lại

- **USDC bị đóng băng bởi issuer.** A3 ghi rõ Base Sepolia USDC có thể bị pause, freeze hoặc upgrade. UI phải xử lý trường hợp tiền bị khóa ngoài ý muốn. Đưa vào tài liệu rủi ro.
- **Không có review contract độc lập.** Rủi ro mức cao nhất trong A §14. Phải lên lịch trước deploy.
- **Hai tài liệu kiến trúc mâu thuẫn** (A và B). Nếu không chốt, mentor và hội đồng sẽ thấy hai phiên bản khác nhau khi đánh giá.
- **Quyết định kiến trúc đang nằm ở nhiều nơi** (plan, sprint, ghi chú). Cần gom về ADR để tránh lặp lại mâu thuẫn.

---

## 6. Quyết định cần bạn chốt

1. **M-1:** hạn duyệt theo A (cố định) hay giữ theo D1 (từ lúc nộp). Đề xuất: theo A.
2. **M-2:** tắt relayer auto-claim cho MVP. Đề xuất: có.
3. **M-3:** dùng Supabase làm DB duy nhất cho MVP. Đề xuất: có.
4. **M-5 và M-6:** nộp bằng patch và xác minh bằng sandbox worker trong MVP, ghi là khác B. Đề xuất: có.
5. **Phạm vi:** chấp nhận cắt thêm để đưa các việc mục 4.2 vào MVP, hay dời sang sau 15/12.
6. **Người review contract độc lập:** ai và khi nào.
