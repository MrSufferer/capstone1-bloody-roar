# Phân rã công việc: MVP (phiên bản 3, theo ADR)

Ngày cập nhật: 2026-11-13 (phiên bản 3). Thay thế phiên bản 2.
Thay đổi so với phiên bản 2: thêm gửi ảnh và tệp trong chat có quét (ADR-0016, C-1 đến C-9). Chốt D-5 và D-6. R-2 đã giải quyết một phần.
Đọc cùng: `ADR_2026-11-12.md` (quyết định kiến trúc), `CHAT_FILES_SECURITY_2026-11-13.md` (thiết kế chat và quét), `ROADMAP_2026-08-01_to_2026-12-15.md` (lịch), `ARCH_DIRECTION_2026-11-12.md`, `NEXT_STEPS_CLIENT_DEV_2026-11-12.md`, `REVIEW_2026-11-11.md`.

## Tóm tắt thay đổi

| Thay đổi | Pd |
|---|---|
| Thêm gửi ảnh và tệp trong chat có quét (C-1 đến C-9) | +10,5 |
| Cắt để giữ sức chứa: S-703 vòng tự sửa AI (3), S-204 nhắc hạn (1,5), S-112 health đủ trường (1) | −5,5 |
| Rút: S-901 từ 3 xuống 1,5 pd (T-1 đến T-4), S-201 từ 1,5 xuống 1 pd | −2 |
| Cắt từ phiên bản 2: S-602 lưu nháp server (3), S-903 gộp vào S-904 (1) | đã tính ở phiên bản 2 |
| Đóng: S-1001 (đã có ADR và tài liệu này) | đã tính ở phiên bản 2 |
| **MVP v3** | **62 pd** |

Tổng khối lượng: 118,5 pd = MVP 62 pd + 56,5 pd dời, cắt hoặc rút.

Sức chứa theo ngày phát hành:
- **18/12/2026** (đề xuất): 65 pd (tính từ 13/11). Dự phòng **3 pd**.
- **15/12/2026**: 57,5 pd. Thiếu **4,5 pd** nếu giữ gửi ảnh trong chat. Nếu bỏ gửi ảnh (còn 51,5 pd), dự phòng **6 pd**.

**Nhãn trạng thái:** `MVP` (làm trước phát hành), `MVP mới` (thêm từ ADR hoặc từ yêu cầu chat), `Dời` (sau phát hành), `Cắt` (không làm, có thay thế), `Đóng` (đã xong), `Rút` (rút phạm vi, còn một phần).

---

## Quy ước

- **Pd** (person-day): 1 pd = 6 giờ tập trung. Cỡ việc: S ≤ 1 pd, M 1–3 pd, L > 3 pd.
- **Người làm** gợi ý theo `PROJECT_SPRINT_PLAN.md` mục 2: Khôi (backend lead, hạ tầng, quét), Kiên (contract), Hiếu (backend GraphQL), Hân (UX/UI và QA), Trâm (UI).
- **Mã:** `B-xx` là việc backend, `A-xx` là việc AI, `C-xx` là việc chat có quét, `S-xxx` là story trong backlog (mục 5).

---

## 1. Backend cần làm gì

### 1.1 An toàn tiền và trạng thái

**B-1. Khóa rút đơn khi đã được chọn.** `MVP`. S-101.
- Làm gì: `withdrawApplication` từ chối nếu đơn có reservation `AWAITING_FUNDING` hoặc `FUNDED`. (D-6 đã chốt: có.)
- File: `apps/web/src/graphql/modules/application/application.module.ts`.
- Xong khi: test đỏ trước. Dev được chọn rút đơn trong lúc chờ tiền bị chặn bằng `APPLICATION_NOT_WITHDRAWABLE`.

**B-2. Effect deposit không ghi đè trạng thái đơn.** `MVP`. S-102.
- Làm gì: `apps/worker/src/effects/escrow.ts:127` chỉ đặt `ACCEPTED` khi đơn còn `PENDING`. Nếu không, reservation `MISMATCHED`, thông báo admin, không đổi issue.
- Xong khi: test đỏ trước. Đơn `WITHDRAWN` không bị ghi đè. Deposit khớp vẫn chuyển đúng.

**B-3. Chặn release khi hash đã xem khác hash mới nhất.** `MVP`. S-103.
- Làm gì: `prepareReleaseFunds` nhận `reviewedDeliveryHash`. Nếu khác `deliveryHash` mới nhất trong projection, trả `DELIVERY_CHANGED`.
- Ghi chú: đây là kiểm tra phía server. Contract vẫn release hash mới nhất, đúng với kiến trúc (A §15, "latest-hash release").
- Xong khi: test đỏ trước (client duyệt bản A, dev nộp bản B, release với hash A bị chặn). Backend làm trước, UI nối sau ở S-604.

**B-4. Whitelist env cho tiến trình con.** `MVP`. S-104.
- Làm gì: `apps/worker/src/runner/command.ts` chỉ truyền `PATH`, `HOME`, `TMPDIR`, biến `GIT_*`, `DOCKER_HOST`. Không truyền `RELAYER_PRIVATE_KEY`, `DATABASE_URL`.
- Xong khi: test đỏ trước.

**B-5. Cảnh báo bounty không có test chạy được.** `MVP`. S-201. (D-5 đã chốt: cảnh báo to, không chặn đăng.)
- Làm gì: ghi `noExecutableTests` trên issue. UI hiển thị cảnh báo to cho dev và client: "Bounty này không có kiểm tra tự động". Gate nộp bài không coi "không có test" là đã kiểm tra (`lib/test-runs.ts:22-28`), nên dev vẫn nộp được nhưng thấy cảnh báo.
- Xong khi: test: đăng bounty không có test vẫn thành công, có cờ; UI hiện cảnh báo.

**B-6. Dọn bản nháp cũ khi tạo bản mới.** `MVP`. S-202.
- Làm gì: khi bản mới được ký hoặc draft đã chuẩn bị bị sửa, đánh dấu bản cũ `SUPERSEDED` (`draft.module.ts:85-97`).
- Xong khi: không còn bản `DRAFT` cũ sau khi tạo bản mới.

### 1.2 API trạng thái cho UI

**B-7. Truy vấn `issueWorkflow(issueId)`.** `MVP`. S-206.
- Làm gì: trả trạng thái tổng hợp và danh sách hành động khả dụng kèm lý do.
- File: module mới `apps/web/src/graphql/modules/issue/workflow.module.ts`. Tái dùng luật có sẵn.
- Xong khi: với mỗi trạng thái, `reason` khớp mã lỗi của mutation tương ứng.

**B-8. Thông báo nhắc hạn.** `Dời` (cắt v3, S-204).
- Lý do cắt: nice-to-have, không chặn luồng tiền. Đưa lại sau 15/12.

**B-9. Mã lỗi snapshot thân thiện.** `Dời`. S-405.
- Trong MVP, UI hiển thị thông báo lỗi nguyên văn.

### 1.3 Chat

**B-10. Kiểm quyền khi phát tin và rời phòng khi mất quyền.** `MVP`. S-301.
- Làm gì: trong `socket/handlers.ts`, kiểm lại `canReadConversation` khi phát `message:new`. Gửi lệnh rời phòng khi issue `COMPLETED` hoặc `CANCELLED`, hoặc đơn bị từ chối.
- Xong khi: test đỏ trước. Người đã mất quyền không nhận tin mới.

**B-11. Báo cáo tin nhắn và người dùng (không phải tệp).** `Dời`. S-302.
- Lý do: báo cáo tệp (C-8) đã có trong MVP. Báo cáo tin chữ và chặn người dùng dời sau 15/12. Rủi ro: xem R-2.

**B-12. Chặn người dùng.** `Dời`. S-303. Phụ thuộc S-302.

**B-13. Giới hạn phòng APPLICATION mới mỗi ngày.** `Dời`. S-304. Phụ thuộc D-12.

**B-14. Gửi ảnh và tệp trong chat có quét.** `MVP mới`. S-305 gồm C-1 đến C-9 (ADR-0016). Thiết kế đầy đủ: `CHAT_FILES_SECURITY_2026-11-13.md`.
- Chỉ ảnh tĩnh (JPEG, PNG, WebP). Quét qua 10 lớp: quyền, khai báo, magic bytes, giới hạn, ClamAV, tái mã hóa bằng sharp, phân loại NSFW, lưu trữ ngẫu nhiên, tải có quyền, quota.
- Fail-closed: không có kết quả quét thì không tự duyệt.
- Mục tiêu: p95 ≤ 3 s từ lúc chọn đến lúc gửi được (ước lượng, cần đo trong C-4a).
- Chi tiết các việc C-1 đến C-9 trong mục 9 của tài liệu chat.

### 1.4 Test runner và snapshot

**B-15. Cảnh báo `QUEUED` quá lâu.** `MVP`. S-401.
- Xong khi: test: run quá hạn tạo đúng một cảnh báo.

**B-16. Quét patch trước khi lưu và chạy.** `MVP`. S-402.
- Làm gì: dùng bộ mẫu `packages/shared/src/source-privacy.ts`. Có secret thì từ chối với `PATCH_CONTAINS_SECRET`.
- Xong khi: test đỏ trước.

**B-17. File lạ trong thư mục test không ảnh hưởng kết quả.** `MVP`. S-403.

**B-18. Lưu cây file đầy đủ của snapshot.** `MVP`. S-404. Phụ thuộc cho A-1 (wizard).
- Làm gì: thêm cột `fileTree` (JSON: đường dẫn, kích thước, đã lọc tệp nhạy cảm) vào `source_snapshots`. Không đưa nội dung file vào đây.
- Migration: 1 cột mới.

### 1.5 Vận hành và indexer

**B-19. Áp migration lên Supabase.** `MVP`, chặn. S-107. Phụ thuộc D-1.
- Làm gì: chụp snapshot Supabase, chạy `db:migrate:prod` (người dùng chạy lệnh hoặc cấp quyền), kiểm tra `migrate status`.

**B-20. E2E reorg trên Hardhat.** `Dời`. S-502. Test đơn vị đã có từ S6 và đã sửa theo review.

**B-21. Khóa phân tán cho auto-claim.** `Không cần` (ADR-0005). Relayer tắt trong MVP.

**B-22. Giới hạn tần suất bằng Redis.** `Dời`. Chỉ cần khi có nhiều instance web (ADR-0013).

**B-23. Mạng cài đặt sandbox.** `MVP` (runbook). S-106 và S-113.
- Làm gì: luật egress chặn dải nội bộ và metadata cho container cài đặt. Kiểm tra từ container không tới được `169.254.169.254` và `10.0.0.0/8`.

**B-30. Health check worker đủ trường.** `Dời` (cắt v3, S-112). Đã có: safe head, tuổi cursor, độ trễ RPC. Thiếu: số job đang chờ và projection lag.

**B-31. Máy worker có Docker, runbook khởi động và rollback.** `MVP mới`. S-113. Theo ADR-0010. Máy này cũng chạy ClamAV cho C-3.
- Xong khi: runbook được thử một lần trên máy đó.

**B-32. Xử lý advisory cho gói production.** `MVP mới`. S-114. Theo ADR-0012.
- Xong khi: không còn advisory high hoặc critical trong gói production.

### 1.6 Contract (Kiên)

**B-26. Hạn duyệt cố định.** `MVP mới`. S-108. Theo ADR-0004.
- Làm gì: trong `BloodyRoarEscrow.sol`, đổi `submittedAt + REVIEW_PERIOD` thành `deliveryDeadline + REVIEW_PERIOD` tại `claimReviewTimeout` (dòng 301). Cập nhật test Hardhat và fuzz.
- Thời điểm: S8, trước deploy Base Sepolia.
- Chờ Kiên xác nhận.

**B-24. Quy tắc tranh chấp.** `Dời`. S-203a, S-203b. Tranh chấp tắt trong MVP (B-28).

**B-25. Gate on-chain.** `Dời`. Chỉ làm khi D-4 chọn làm, và có audit.

**B-28. Cờ tắt tranh chấp.** `MVP mới`. S-110. Theo ADR-0015.
- Làm gì: cờ `DISPUTE_ENABLED=false`. Khi tắt, `canDispute` luôn `false`, các mutation tranh chấp trả `DISPUTE_DISABLED`.

### 1.7 Các việc theo ADR trong MVP

**B-27. Tắt relayer.** `MVP mới`. S-109. Theo ADR-0005. Cờ `AUTO_CLAIM_ENABLED`, mặc định `false`.

**B-29. Supabase Storage qua API S3.** `MVP mới`. S-111. Theo ADR-0007. Bucket riêng tư. Cũng là nơi lưu staging và approved cho C-1.

---

## 2. AI cần làm gì

### 2.1 Tính năng 1: AI sinh test có chọn file

**A-1. `generateTestCases` nhận `focusFiles` và `hint`.** `MVP`. S-701.
- Thêm `focusFiles` (tối đa 3) và `hint` (tối đa 500 ký tự). Validate bằng zod. Đường dẫn phải nằm trong `fileTree` (B-18).
- Xong khi: test: đường dẫn ngoài `fileTree` bị từ chối.

**A-2. Context có file được chọn đầy đủ.** `MVP`. S-702.
- Thứ tự: nội dung đầy đủ `focusFiles` (tối đa 20 KB mỗi file), rồi `package.json` hoặc `pyproject.toml`, rồi phần còn lại. Vẫn qua `sanitizeSourceContext`.

**A-3. Vòng tự sửa tối đa hai lần.** `Dời` (cắt v3, S-703).
- Lý do: cải thiện tỉ lệ test đạt, không chặn luồng tiền. Trong MVP, test sai được client sửa tay.

**A-4. Bộ đánh giá 8–10 repo mẫu.** `Dời`. S-704.
- Rủi ro chấp nhận (R-3): chọn model không có số liệu. Trong demo ghi rõ là chưa đánh giá.

**A-5. Chống tiêm lệnh từ repo.** `MVP`, rút còn 1,5 pd. S-705.
- Làm: một repo mẫu có câu lệnh giả. Kiểm tra test sinh ra vẫn đỏ trên base với lỗi thật.

**A-6. Schema đầu ra và chi phí AI.** `Dời`. S-706. Trong MVP, output không parse được thì báo lỗi.

### 2.2 Tính năng 2: AI báo cáo bài nộp

**Toàn bộ EP-8 (A-7 đến A-11, S-801 đến S-806, 11,5 pd): `Dời` sau phát hành.** Không ảnh hưởng luồng tiền.

Nguyên tắc vẫn giữ: AI không quyết định tiền, không gọi `releaseFunds`, không ảnh hưởng gate.

### 2.3 Quét ảnh trong chat (không phải LLM)

Việc quét ảnh trong chat (C-2, C-4) dùng thư viện xác định và model phân loại nhỏ trên CPU. Không dùng LLM, không dùng OCR. Chi tiết: `CHAT_FILES_SECURITY_2026-11-13.md` mục 4.

---

## 3. UI thay đổi và hiển thị thế nào

### 3.1 Đăng bounty: wizard 3 bước (S-601)

```
Bước 1  Việc cần làm        Bước 2  Nguồn code và điểm lỗi      Bước 3  Duyệt tiêu chí
[tiêu đề]                   ( ) GitHub public  [URL] [ref]      Tiêu chí 1  ✔ đỏ trên base
[mô tả]                     ( ) Tải zip        [kéo thả]        Tiêu chí 2  ✖ xanh trên base  [Sửa]
[loại] [kỹ năng]            ─────────────────────────           Tiêu chí 3  ✔ đỏ trên base
[số tiền] [token]           Trạng thái: Đang phân tích…         [Kiểm chứng lại]
                            Framework: Vitest (tự nhận)         [Đăng bounty]  ← sáng khi đủ
[Tiếp]                      Cây file: [✓ src/x.ts] [ ] …
                            Ghi chú lỗi: [ ........ ]
                            [AI soạn tiêu chí và test]
```

- **Lưu nháp:** wizard lưu tạm trên trình duyệt (`localStorage`). Đây là tiện ích theo từng người xem. Đóng trình duyệt là mất tiến độ (R-5). Không có `isDraft` trên server trong MVP.
- Trạng thái snapshot: `PENDING`, `PROCESSING`, `READY`, `FAILED`, kèm thông báo lỗi nguyên văn và nút đổi nguồn.
- Trạng thái base check: đang chạy, đạt, không đạt, kèm lý do.
- Cảnh báo to nếu không có test chạy được (B-5): "Bounty này không có kiểm tra tự động."
- Nút "Đăng bounty" chỉ sáng khi đủ điều kiện. Dưới nút hiện lý do.

### 3.2 Trang issue: panel theo vai trò (S-603)

Client thấy: panel "Nguồn và kiểm tra", "Tiêu chí" (khóa khi đã chọn dev, có lý do), "Ứng viên" (trạng thái đơn), "Bài nộp" (phiên bản, hash rút gọn, kết quả test mới nhất).

Dev thấy: các panel rút gọn, nút tải snapshot, nút nộp bài.

Đếm ngược trên panel: hạn giao (nếu chưa nộp), mốc nhận tiền tối đa `deliveryDeadline + 7 ngày` (sau khi B-26 xong), hạn reservation 24 giờ.

Banner lý do phòng chỉ đọc nằm trong panel này. Đây là phần tối thiểu của báo cáo phòng chat, đưa vào S-603 trong 4 pd.

### 3.3 Màn duyệt bài của client (S-604)

- Hiển thị: hash đầy đủ của bài đang xem, kết quả test của đúng bài đó.
- Nút "Release": hộp xác nhận nêu bài đang duyệt (hash rút gọn) và số tiền dev nhận (97,5%). Gửi `reviewedDeliveryHash` (B-3). Hiển thị mốc nhận tiền tối đa.
- Nếu có bài mới hơn trong lúc đang xem: banner "Dev vừa nộp bản mới. Xem lại trước khi release." Nút release bị khóa.
- Nút "Yêu cầu sửa": ghi chú rõ chỉ lưu trên hệ thống, không ghi lên chain.
- Không có nút tranh chấp trong MVP (B-28).

### 3.4 Màn nộp bài của dev (S-605, 4 pd)

Các bước có trạng thái rõ:
1. Tải patch: tiến trình tải, checksum đã kiểm.
2. Chạy test: `QUEUED`, `RUNNING`, `PASSED`, `FAILED` (tên test lỗi và log), `ERROR` (lý do).
3. Chuẩn bị ký: chỉ bật khi có `PASSED` cho đúng bản này. Hiện hạn ký (30 phút).
4. Ký bằng ví: cảnh báo "Sau khi ký, bạn không sửa được bản này. Bản mới chỉ nộp được trước hạn giao, và ghi đè bản này."

**Năm trạng thái giao dịch (A §15):** chờ ký, đã gửi, chờ safe head, đã xác nhận, thất bại.

### 3.5 Nhắn tin và gửi ảnh (S-305, S-306 dời)

- Inbox hiện có (`/messages`) giữ nguyên. Chưa nâng cấp menu chặn và báo cáo tin chữ (S-302, S-303, S-306 dời).
- **Gửi ảnh (C-5):**
  - Nút đính kèm. Chọn ảnh thì hiện thumbnail tạm ngay (blob URL), chip "Đang kiểm tra".
  - Người gửi có thể gõ tin trong lúc chờ.
  - Chip chuyển sang "Sẵn sàng" khi quét xong, hoặc "Bị từ chối: {lý do}" với mã lý do dịch sang tiếng Việt.
  - Nút gửi chỉ bật khi tất cả ảnh đính kèm đã "Sẵn sàng".
  - Người nhận chỉ thấy ảnh khi tin đã được gửi.
- **Báo cáo tệp (C-8):** nút "Báo cáo" trên ảnh đã duyệt, ghi vào `reports`.
- Tối đa 4 ảnh mỗi tin. Hiện số lượng và dung lượng còn lại.

### 3.6 Tranh chấp (dời)

Không hiển thị trong MVP. Mutation tranh chấp trả `DISPUTE_DISABLED` (B-28).

### 3.7 Trạng thái lỗi chung

- Lỗi backend có `code`. UI dịch các mã chính sang tiếng Việt. Mã chưa có bản dịch hiện nguyên văn.
- Mỗi màn có ba trạng thái: đang tải, trống (có lý do và việc tiếp theo), lỗi (nút thử lại).

### 3.8 Di động

Wizard và màn nộp bài dùng được ở 360 px. Phòng chat: danh sách và nội dung là hai màn hình. Ảnh trong chat co theo chiều rộng màn hình.

---

## 4. Logic phụ thuộc và chưa hoàn thiện

### 4.1 Đồ thị phụ thuộc (MVP)

```
D-1 (migration)        ─► S-107 ─► S-501 ─► (deploy worker mới)
D-6 (đã chốt)          ─► S-101 ─► S-102 ─► S-103 ─► S-604 (nút release có hash)
D-5 (đã chốt)          ─► S-201
S-108 (hạn duyệt, Kiên) ─► S-115 (đếm ngược UI) ─► S-603, S-605
S-206 (issueWorkflow)  ─► S-603, S-604, S-605, S-601
S-404 (fileTree)       ─► S-601 (wizard bước 2) ─► S-701 ─► S-702 ─► S-705
S-111 (Supabase Storage) ─► C-1 (staging và approved) ─► C-2 (worker quét) ─► C-5 (UI gửi ảnh)
S-113 (máy worker, ClamAV) ─► C-3 ─► C-2
C-4a (spike NSFW) ─► C-4 ─► C-2
C-1, C-2, C-6, C-7 ─► C-9 (bộ kiểm thử bảo mật)
S-109 (tắt relayer), S-110 (tắt tranh chấp) — không phụ thuộc, cần trước deploy
S-301 (kiểm quyền socket) — cần cho chat có quét
```

**Đường găng (luồng tiền và demo):** S-101 → S-102 → S-103 → S-206 → S-603/S-605 → S-601 → S-701 → S-702 → S-705 → S-901 (E2E) → S-904 (runbook demo).

**Đường găng thứ hai (chat có ảnh):** S-111 → C-1 → C-2 (cần C-3 từ S-113) → C-5 → C-9 → S-904.

**Đường găng thứ ba (contract):** S-108 (Kiên) → deploy Base Sepolia → S-113.

### 4.2 Logic chưa hoàn thiện và trạng thái

| # | Logic | Trạng thái trong MVP | Ghi chú |
|---|---|---|---|
| L-1 | Rút đơn khi đã được chọn | Đóng (S-101) | |
| L-2 | Release không ràng buộc hash đã duyệt | Đóng phía server (S-103). Contract vẫn latest-hash | |
| L-3 | Tranh chấp không có điều kiện | Đóng bằng cờ tắt (S-110) | Mở lại sau phát hành |
| L-4 | Bounty không có test | Đóng bằng cảnh báo (S-201) | D-5 đã chốt |
| L-5 | Deposit lệch để tiền ngoài hệ thống | **Rủi ro R-1**: không có công cụ admin | Runbook và thao tác thủ công (S-113) |
| L-6 | Socket giữ phòng sau khi mất quyền | Đóng (S-301) | |
| L-7 | Không có báo cáo tin chữ và chặn người dùng | Một phần: báo cáo tệp có (C-8). Chặn và báo cáo tin chữ dời | R-2 |
| L-8 | Không quét tệp chat | Đóng khi C-1 đến C-9 xong (ADR-0016) | Chặn bởi S-113 và S-111 |
| L-9 | Không có cảnh báo `QUEUED` lâu | Đóng (S-401) | |
| L-10 | Snapshot chỉ có 400 file đầu | Đóng (S-404) | |
| L-11 | Dev không đánh giá được client | Dời | |
| L-12 | Gate nộp bài chỉ ở server | Chấp nhận. Ghi rõ trong UI | |
| L-13 | Migration chưa áp lên DB thật | Chặn (S-107) | D-1 |
| L-14 | Mạng cài đặt sandbox còn mở | Đóng bằng runbook và luật egress (S-106, S-113) | Luật hạ tầng phải có khi deploy |
| L-15 | `command.ts` truyền toàn bộ env | Đóng (S-104) | |
| L-16 | Rate limit trong bộ nhớ | Chấp nhận cho một instance (ADR-0010) | Chuyển sang DB cho quota chat (C-7) |
| L-17 | Auto-claim chạy trùng khi nhiều worker | Không áp dụng (relayer tắt) | |
| L-18 | Hạn duyệt theo kiến trúc khác code | Đóng khi S-108 xong | Phụ thuộc Kiên |
| L-19 | Advisory trong gói production | Đóng (S-114) | |
| L-20 | Health check thiếu số job và projection lag | Dời (S-112) | |
| L-21 | Mốc đếm ngược UI theo `submittedAt` | Đóng khi S-115 xong | Phụ thuộc S-108 |
| L-22 | Dispute mutation truy cập được qua API | Đóng (S-110) | |
| L-23 | Ảnh đồi trụy trong chat | Đóng một phần bằng quét NSFW (C-4). Trẻ em: giới hạn kỹ thuật (xem CHAT_FILES mục 4.4) | Cần tư vấn pháp lý |

### 4.3 Quyết định

| Mã | Quyết định | Trạng thái | Ảnh hưởng |
|---|---|---|---|
| D-1 | Áp migration lên Supabase | Chờ bạn chạy lệnh deploy production | S-107 |
| D-5 | Bounty không có test chạy được | **Đã chốt: cảnh báo to, không chặn đăng.** Gate nộp bài không coi "không có test" là đã kiểm tra | S-201 |
| D-6 | Cấm rút đơn khi đã được chọn | **Đã chốt: có** | S-101 |
| D-13 | Lưu tệp chat đã duyệt | Đề xuất 90 ngày sau khi phòng đóng. Chờ xác nhận | C-2, C-8 |
| D-14 | Ngưỡng NSFW | Đề xuất từ chối ≥ 0,90, ghi log 0,60–0,90. Chốt sau C-4a | C-4 |
| D-15 | Tư vấn pháp lý về nội dung liên quan trẻ em | Cần làm trước khi mở tính năng ảnh cho người ngoài nhóm | C-2, C-8 |
| D-16 | Ngày phát hành: 15/12 hay 18/12 | Đề xuất 18/12. Chờ bạn chốt | Sức chứa |
| D-2 | Quy tắc tranh chấp | Dời (tranh chấp tắt) | S-203a/b |
| D-4 | Gate on-chain | Giữ ở server | L-12 |
| D-12 | Giới hạn phòng APPLICATION mới | Dời | S-304 |
| ADR-0004 | Hạn duyệt cố định | Bạn đồng ý. Chờ Kiên xác nhận | S-108, S-115 |
| ADR-0010 | Worker trên một máy có Docker | Bạn đồng ý. Chờ Kiên xác nhận | S-113 |
| ADR-0016 | Gửi ảnh có quét trong chat | Chấp nhận (bổ sung mới) | C-1 đến C-9 |

### 4.4 Rủi ro chấp nhận cho demo

| Mã | Rủi ro | Mức | Biện pháp |
|---|---|---|---|
| R-1 | Deposit lệch không có công cụ admin | Cao (nếu xảy ra) | Runbook. Không mời người ngoài nạp tiền thật trước khi có công cụ |
| R-2 | Chat chưa có báo cáo tin chữ và chặn người dùng | Trung | Đã giải quyết một phần: ảnh có quét và báo cáo tệp (C-8). Phần còn lại dời |
| R-3 | Model AI chọn không có số liệu đánh giá | Trung | Ghi rõ trong demo |
| R-4 | Reorg chưa có E2E | Trung | Test đơn vị đã có |
| R-5 | Wizard không lưu nháp trên server | Thấp | Ghi rõ cho người dùng |
| R-6 | Dự phòng phụ thuộc ngày phát hành: 5 pd nếu 18/12, 0 nếu 15/12 | Cao | Nếu 15/12: cắt tiếp S-105 (xuống 1 pd), S-115 và C-9 (xuống 0,5 pd) |
| R-7 | Bộ quét ngừng hoạt động (ClamAV, model) | Trung | Fail-closed: không duyệt ảnh. Người gửi thấy "đang chờ dịch vụ quét". Cảnh báo qua webhook |
| R-8 | Model NSFW nhận diện sai (cả âm tính và dương tính giả) | Trung | Ngưỡng bảo thủ. Ghi log để rà soát. Có nút báo cáo tệp. Không hứa tuyệt đối |
| R-9 | Nội dung liên quan trẻ em, nghĩa vụ pháp lý | **Cao** | Chính sách không khoan nhượng, báo cáo, gỡ ngay, lưu bằng chứng. Tư vấn pháp lý trước khi mở |
| R-10 | Số liên lạc viết trên ảnh không được phát hiện | Trung | Chấp nhận (không OCR). Ghi trong điều khoản |
| R-11 | Độ trễ thực tế cao hơn ước lượng | Trung | Đo trong C-4a. Nếu p95 > 3 s: dùng bản 224 px nhỏ hơn, hoặc bỏ bước NSFW cho ảnh đã dedupe |

---

## 5. Backlog Jira

### 5.1 Lịch sprint

Lịch đầy đủ trong `ROADMAP`. Sprint còn lại tính từ hôm nay (13/11). Sức chứa tính theo 2,5 pd mỗi ngày làm việc (5 người, 3 giờ/ngày).

| Sprint | Ngày | Ngày làm việc | Sức chứa | Nội dung MVP |
|---|---|---|---|---|
| S7 (còn lại) | 13/11 – 20/11 | 6 | 15 | Khóa rút đơn, effect, release, cờ tắt, migration, runner, cảnh báo, reorg |
| S8 | 21/11 – 4/12 | 10 | 25 | Contract hạn duyệt, socket, Supabase Storage, wizard, panel, màn duyệt, AI sinh test, spike quét |
| S9 | 7/12 – 18/12 | 10 | 25 | Màn nộp bài, chat có ảnh, E2E, runbook, máy worker, advisory |

Ghi chú: S7 còn 6 ngày làm việc (13 và 16–20/11), nên sức chứa là 15 pd, không phải 17,5 pd như bản trước. Điều này làm S7 thiếu. Xem mục 5.4.

Nếu chọn 15/12: S9 chỉ có 7 ngày làm việc, sức chứa 17,5 pd. Không đủ cho MVP v3.

### 5.2 EPIC

| Mã | EPIC | Sprint MVP |
|---|---|---|
| EP-1 (KAN-1) | Bảo mật tiền và trạng thái | S7, S8, S9 |
| EP-2 (KAN-2) | Vòng đời bounty dev và client | S7, S8 |
| EP-3 (KAN-3) | Chat và nhắn tin, gửi ảnh có quét | S8, S9 |
| EP-4 (KAN-4) | Test runner và snapshot | S7, S8 |
| EP-5 (KAN-5) | Indexer, reorg và vận hành | S7, S9 |
| EP-6 (KAN-6) | UI đăng bounty và trạng thái | S8, S9 |
| EP-7 (KAN-7) | AI sinh test | S8 |
| EP-8 (KAN-8) | AI báo cáo bài nộp | Dời |
| EP-9 (KAN-9) | QA, E2E và phát hành | S9 |
| EP-10 (KAN-10) | Quản lý dự án | S7–S9 |

### 5.3 Story

Cột "Trạng thái" theo phiên bản 3. Mã Jira ở mục 5.6 cho các story đã tạo.

| Mã | Story | EPIC | Sprint | Người | Pd | Trạng thái | Phụ thuộc |
|---|---|---|---|---|---|---|---|
| S-101 | Khóa rút đơn khi đã được chọn | EP-1 | S7 | Hiếu | 1 | MVP | D-6 (đã chốt) |
| S-102 | Effect deposit không ghi đè đơn | EP-1 | S7 | Khôi | 1,5 | MVP | S-101 |
| S-103 | Chặn release khi hash đã xem khác (backend) | EP-1 | S7 | Hiếu | 2 | MVP | — |
| S-104 | Whitelist env tiến trình con | EP-1 | S7 | Khôi | 0,5 | MVP | — |
| S-107 | Áp migration lên Supabase | EP-1 | S7 | Khôi | 0,5 | MVP, chặn | D-1 |
| S-108 | Hạn duyệt cố định trên contract (ADR-0004) | EP-1 | S8 | Kiên | 2 | MVP mới | Kiên xác nhận |
| S-109 | Tắt relayer, cờ `AUTO_CLAIM_ENABLED` (ADR-0005) | EP-1 | S7 | Khôi | 0,5 | MVP mới | — |
| S-110 | Cờ tắt tranh chấp `DISPUTE_ENABLED` (ADR-0015) | EP-1 | S7 | Khôi | 0,5 | MVP mới | — |
| S-114 | Xử lý advisory gói production (ADR-0012) | EP-1 | S9 | Hiếu | 1,5 | MVP mới | — |
| S-203a | Thiết kế quy tắc tranh chấp | EP-1 | — | Kiên | 2 | Dời | D-2 |
| S-203b | Triển khai quy tắc tranh chấp | EP-1 | — | Kiên | 3 | Dời | S-203a |
| S-202 | Dọn bản nháp cũ | EP-2 | S7 | Hiếu | 1 | MVP | — |
| S-206 | API `issueWorkflow` | EP-2 | S7 | Hiếu | 2 | MVP | — |
| S-201 | Cảnh báo bounty không có test (mức tối thiểu) | EP-2 | S7 | Hiếu | 1 | MVP | D-5 (đã chốt) |
| S-204 | Thông báo nhắc hạn | EP-2 | — | Hiếu | 1,5 | Cắt v3 | — |
| S-205 | Dev đánh giá client | EP-2 | — | Hiếu, Trâm | 3 | Dời | S-206 |
| S-111 | Supabase Storage qua API S3 (ADR-0007) | EP-4 | S8 | Hiếu | 1 | MVP mới | Tài khoản Supabase |
| S-301 | Kiểm quyền socket khi phát tin và rời phòng | EP-3 | S8 | Khôi | 2 | MVP | — |
| S-302 | Báo cáo tin chữ và người dùng | EP-3 | — | Hiếu | 3 | Dời | — |
| S-303 | Chặn người dùng | EP-3 | — | Hiếu | 1,5 | Dời | S-302 |
| S-304 | Giới hạn phòng APPLICATION mới | EP-3 | — | Hiếu | 1 | Dời | D-12 |
| S-305 | Gửi ảnh và tệp trong chat có quét (C-1 đến C-9 bên dưới) | EP-3 | S8–S9 | Khôi, Hiếu, Trâm, Hân | 10,5 | MVP mới | ADR-0007, ADR-0010 |
| &nbsp;&nbsp;C-1 | Staging và approved, trạng thái file, presigned PUT vào staging | EP-3 | S9 | Hiếu | 2 | MVP mới | S-111 |
| &nbsp;&nbsp;C-2 | Worker quét: dedupe, magic bytes, giới hạn, sharp tái mã hóa, ghi approved | EP-3 | S9 | Khôi | 2 | MVP mới | C-1, C-3 |
| &nbsp;&nbsp;C-3 | Tích hợp ClamAV (clamd INSTREAM), test EICAR | EP-3 | S8 | Khôi | 1 | MVP mới | S-113 |
| &nbsp;&nbsp;C-4a | Spike NSFW: so sánh nsfwjs và NudeNet trên bộ mẫu công khai, đo độ trễ | EP-3 | S8 | Khôi | 1 | MVP mới | — |
| &nbsp;&nbsp;C-4 | Tích hợp model đã chọn, ngưỡng, log rà soát | EP-3 | S9 | Khôi | 0,5 | MVP mới | C-4a |
| &nbsp;&nbsp;C-5 | UI gửi ảnh: nút đính kèm, thumbnail tạm, chip trạng thái, gửi khi sẵn sàng | EP-3 | S9 | Trâm | 1,5 | MVP mới | C-1, C-2 |
| &nbsp;&nbsp;C-6 | Tải có quyền: URL 60 giây, header an toàn, kiểm membership | EP-3 | S9 | Hiếu | 0,5 | MVP mới | C-2 |
| &nbsp;&nbsp;C-7 | Quota bằng DB, dọn file `SCANNING` quá hạn | EP-3 | S9 | Hiếu | 0,5 | MVP mới | C-1 |
| &nbsp;&nbsp;C-8 | Nút "Báo cáo tệp", bản ghi `reports`, truy vấn admin | EP-3 | S9 | Hiếu | 0,5 | MVP mới | C-6 |
| &nbsp;&nbsp;C-9 | Bộ kiểm thử bảo mật T-S1 đến T-S20 | EP-9 | S9 | Hân | 1 | MVP mới | C-1 đến C-8 |
| S-306 | Inbox nâng cấp (menu chặn, báo cáo tin chữ) | EP-3 | — | Trâm | 4 | Dời | S-302, S-303 |
| S-307 | Test ma trận quyền chat | EP-9 | — | Hân | 1,5 | Dời | S-301 |
| S-401 | Cảnh báo `QUEUED` lâu | EP-4 | S7 | Khôi | 1,5 | MVP | — |
| S-402 | Quét patch trước khi lưu và chạy | EP-4 | S7 | Khôi | 1 | MVP | — |
| S-403 | File lạ trong thư mục test không ảnh hưởng | EP-4 | S9 | Kiên | 0,5 | MVP | — |
| S-404 | Cây file đầy đủ của snapshot | EP-4 | S8 | Khôi | 2 | MVP | — |
| S-405 | Mã lỗi snapshot thân thiện | EP-4 | — | Khôi | 1 | Dời | — |
| S-106 | Runbook: egress, migration, cảnh báo | EP-5 | S9 | Khôi | 1 | MVP | — |
| S-501 | Migration hash checkpoint vào vận hành | EP-5 | S7 | Khôi | 1 | MVP | S-107 |
| S-502 | E2E reorg trên Hardhat | EP-5 | — | Khôi | 2 | Dời | S-501 |
| S-112 | Health check worker đủ trường (ADR-0013) | EP-5 | — | Khôi | 1 | Cắt v3 | — |
| S-113 | Máy worker có Docker, runbook khởi động và rollback (ADR-0010) | EP-5 | S9 | Khôi | 1,5 | MVP mới | Máy có Docker |
| S-601 | Wizard đăng bounty 3 bước | EP-6 | S8 | Trâm | 5 | MVP | S-404, S-701 |
| S-602 | Lưu nháp trên server | EP-6 | — | — | 3 | Cắt | — |
| S-603 | Panel trang issue theo vai trò, banner phòng chỉ đọc | EP-6 | S8 | Hân | 4 | MVP | S-206 |
| S-604 | Màn duyệt bài của client (hash đã xem, release) | EP-6 | S8 | Trâm | 2 | MVP | S-206, S-103 |
| S-605 | Màn nộp bài của dev, gồm năm trạng thái giao dịch | EP-6 | S9 | Hân | 4 | MVP | S-206 |
| S-115 | Đếm ngược mốc nhận tiền theo `deliveryDeadline` (ADR-0004) | EP-6 | S9 | Trâm | 0,5 | MVP mới | S-108 |
| S-606 | Đếm ngược tranh chấp | EP-6 | — | Trâm | 2 | Dời | S-203b |
| S-701 | `generateTestCases` nhận `focusFiles`, `hint` | EP-7 | S8 | Khôi | 2 | MVP | S-404 |
| S-702 | Context có file được chọn đầy đủ | EP-7 | S8 | Khôi | 1,5 | MVP | S-701 |
| S-703 | Vòng tự sửa tối đa hai lần | EP-7 | — | Khôi | 3 | Cắt v3 | S-701 |
| S-704 | Bộ đánh giá 8–10 repo mẫu | EP-7 | — | Khôi, Hân | 2 | Dời | — |
| S-705 | Chống tiêm lệnh từ repo (một repo mẫu) | EP-7 | S8 | Khôi | 1,5 | MVP | S-702 |
| S-706 | Schema đầu ra và chi phí AI | EP-7 | — | Khôi | 1 | Dời | S-701 |
| S-801 | Bảng `ai_reviews` và API đọc | EP-8 | — | Hiếu | 2 | Dời | — |
| S-802 | Diff phía worker, chạy sau PASSED | EP-8 | — | Khôi | 3 | Dời | S-801 |
| S-803 | Prompt không công cụ, schema, kiểm trích dẫn | EP-8 | — | Khôi | 2 | Dời | — |
| S-804 | Cache theo `deliveryHash` | EP-8 | — | Khôi | 1 | Dời | S-802 |
| S-805 | UI báo cáo phụ trợ | EP-8 | — | Trâm | 2 | Dời | S-801 |
| S-806 | Kiểm chống tiêm lệnh cho báo cáo | EP-8 | — | Hân | 1,5 | Dời | S-803 |
| S-105 | E2E: rút đơn, deposit muộn, release sau nộp lại | EP-9 | S9 | Hân | 2 | MVP | S-101 đến S-103 |
| S-901 | E2E tối thiểu, T-1 đến T-4 | EP-9 | S9 | Hân | 1,5 | MVP (rút) | Các story trên |
| S-902 | Kiểm UI bằng playwright-cli | EP-9 | — | Trâm | 2 | Dời | — |
| S-903 | Kịch bản demo | EP-9 | — | Hân | 1 | Cắt (gộp S-904) | — |
| S-904 | Checklist phát hành, runbook, kịch bản demo | EP-9 | S9 | Khôi | 1 | MVP | S-113 |
| S-905 | Chạy kiểm chứng trước phát hành | EP-9 | S9 | Khôi | 0,5 | MVP | — |
| S-1001 | Chốt phạm vi và ngày phát hành | EP-10 | — | Khôi | 0,5 | Đóng | — |
| S-1002 | Ghi giờ làm mỗi tuần | EP-10 | S7–S9 | Mọi người | 0,5 | MVP | — |
| S-1003 | Sửa corrections của sprint plan | EP-10 | — | Khôi | 2 | Dời | — |

### 5.4 Tổng pd theo sprint (MVP v3)

| Sprint | Story MVP | Tổng pd | Sức chứa | Dự phòng |
|---|---|---|---|---|
| S7 (còn lại, 13–20/11) | S-101, S-102, S-103, S-104, S-107, S-109, S-110, S-202, S-206, S-201, S-401, S-402, S-501, S-1002 | 14,5 | 15 | 0,5 |
| S8 (21/11–4/12) | S-301, S-404, S-601, S-603, S-604, S-701, S-702, S-705, S-108, S-111, C-3, C-4a | 25 | 25 | 0 |
| S9 (7–18/12) | S-605, S-105, S-901, S-904, S-905, S-106, S-403, S-113, S-114, S-115, C-1, C-2, C-4, C-5, C-6, C-7, C-8, C-9 | 22,5 | 25 | 2,5 |
| **Tổng MVP** | | **62** | **65** (từ 13/11 đến 18/12) | **3** |

Sức chứa từ 13/11 đến 18/12 là 15 + 25 + 25 = 65 pd. Tổng MVP 62 pd, dự phòng 3 pd, nằm chủ yếu ở S9.

**S7 đã cân lại.** Còn 6 ngày làm việc, tức 15 pd. Chuyển S-403 (0,5) và S-106 (1) sang S9, rút S-201 xuống 1 pd (chỉ cờ `noExecutableTests` và cảnh báo UI). S7 còn 14,5 pd, dự phòng 0,5.

### 5.5 Ghi chú để cập nhật Jira

- Trên Jira hiện có 54 story gắn nhãn `sprint-6` đến `sprint-10` theo lịch cũ. Cần gắn lại nhãn theo bảng 5.3.
- Story cắt (S-602, S-903, S-204, S-112, S-703) cần đóng với lý do.
- Story dời cần chuyển sang nhãn "sau phát hành".
- Tạo các story mới: S-108 đến S-115 (ADR), C-1 đến C-9 (chat). Gắn vào EPIC tương ứng.
- Story lịch sử KAN-66 đến KAN-79 vẫn ở To Do.

### 5.6 Ánh xạ sang Jira (project KAN)

Đã tạo 10 EPIC (KAN-1 đến KAN-10), 54 story (KAN-11 đến KAN-64), EP-0 (KAN-65) và 14 story lịch sử (KAN-66 đến KAN-79). Mã nội bộ của story cũ:

| EPIC | Story (mã nội bộ → khóa Jira) |
|---|---|
| EP-1 (KAN-1) | S-101→KAN-11, S-102→KAN-12, S-103→KAN-13, S-104→KAN-14, S-107→KAN-17, S-203a→KAN-29, S-203b→KAN-50 |
| EP-2 (KAN-2) | S-202→KAN-18, S-206→KAN-19, S-201→KAN-28, S-204→KAN-30, S-205→KAN-52 |
| EP-3 (KAN-3) | S-301→KAN-31, S-302→KAN-32, S-303→KAN-33, S-304→KAN-34, S-306→KAN-40, S-305→KAN-53 |
| EP-4 (KAN-4) | S-401→KAN-20, S-402→KAN-21, S-403→KAN-22, S-404→KAN-35, S-405→KAN-36 |
| EP-5 (KAN-5) | S-106→KAN-16, S-501→KAN-23, S-502→KAN-24 |
| EP-6 (KAN-6) | S-603→KAN-37, S-604→KAN-38, S-605→KAN-39, S-601→KAN-42, S-602→KAN-43, S-606→KAN-51 |
| EP-7 (KAN-7) | S-701→KAN-44, S-702→KAN-45, S-703→KAN-46, S-704→KAN-47, S-705→KAN-48, S-706→KAN-49 |
| EP-8 (KAN-8) | S-801→KAN-59, S-802→KAN-60, S-803→KAN-61, S-804→KAN-62, S-805→KAN-63, S-806→KAN-64 |
| EP-9 (KAN-9) | S-105→KAN-15, S-307→KAN-41, S-901→KAN-54, S-902→KAN-55, S-903→KAN-56, S-904→KAN-57, S-905→KAN-58 |
| EP-10 (KAN-10) | S-1001→KAN-25, S-1002→KAN-26, S-1003→KAN-27 |
| EP-0 (KAN-65) | H-S0→KAN-66, H-S1→KAN-67, H-S1b→KAN-68, H-S2→KAN-69, H-S3→KAN-70, H-S4→KAN-71, H-S6a→KAN-72, H-S6b→KAN-73, H-S6c→KAN-74, H-S6d→KAN-75, H-S6e→KAN-76, H-S7a→KAN-77, H-S7b→KAN-78, H-S7c→KAN-79 |

Chưa tạo trên Jira: S-108 đến S-115 và C-1 đến C-9.

### 5.7 Sprint trên Jira: lý do chưa tạo được

- Board `KAN board` (id 1) là **Kanban team-managed**. Jira không cho tạo sprint trên loại board này. Đây là giới hạn của Jira, không phải lỗi của workspace.
- Site `trongkhoidev` hiện có hai project: KAN (team-managed) và NTBT (product discovery). **Không có project company-managed nào**, nên không tạo được board Scrum để có sprint.
- Cách duy nhất để có sprint trong cùng site: **tạo một project company-managed (Scrum) mới** trong site này. Không tạo workspace mới. Sau đó tạo board Scrum với filter `project in (KAN, <key mới>)`, tạo 10 sprint, và gán story vào sprint. Issue ở KAN giữ nguyên khóa.

---

## 6. Quyết định cần bạn chốt

1. **Ngày phát hành:** 18/12 (đề xuất, có dự phòng 5 pd) hay 15/12 (thiếu 2,5 pd).
2. **Jira:** tạo project Scrum mới trong cùng site để có sprint (đề xuất). Bạn đồng ý?
3. **S-201 (D-5):** làm tối thiểu 1 pd trong S7, phần còn lại sang S9. Đồng ý?
4. **Lưu tệp đã duyệt (D-13):** 90 ngày sau khi phòng đóng. Đồng ý?
5. **Tư vấn pháp lý (D-15):** ai sẽ hỏi, và khi nào. Trước khi mở ảnh cho người ngoài nhóm.
6. **Kiên** xác nhận ADR-0004 (S-108) và ADR-0010 (S-113).

---

## Phụ lục: những việc chưa kiểm khi viết tài liệu này

- Độ trễ quét thực tế (C-4a). Các con số trong `CHAT_FILES_SECURITY` là ước lượng.
- Độ chính xác của model NSFW trên ảnh Việt Nam và ảnh đa dạng. Chỉ đo được trên bộ mẫu công khai, không dùng ảnh đồi trụy để test.
- Supabase Storage có API tương thích S3 dùng được với presigned URL và presigned PUT. Chưa kiểm trên Supabase thật (S-111).
- Railway có chạy Docker daemon hay không. Không dựa vào đó (ADR-0010).
- Nghĩa vụ pháp lý về nội dung liên quan trẻ em tại Việt Nam. Chưa tư vấn.
- Quyền đổi ví, cờ `HttpOnly` và CSRF cho `/api/graphql`. Chưa kiểm.
- Thời gian thực tế của team. Time log trống.
