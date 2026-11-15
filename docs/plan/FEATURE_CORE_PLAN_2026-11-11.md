# Plan tính năng lõi: AI sinh test, AI đánh giá bài nộp, luồng nhắn tin và nộp bài

Ngày: 2026-11-11. Đọc cùng `REVIEW_2026-11-11.md` (các lỗi cần sửa trước khi mở rộng).

---

## 1. Hiện trạng: client đăng bounty và AI sinh test

### 1.1 Luồng thật trong code

1. Client tạo issue (`createIssue`). Issue ở trạng thái `OPEN`.
2. Client gắn nguồn code, hai cách:
   - GitHub public: URL repo và `ref` (branch, tag hoặc SHA).
   - Upload file `.zip`: `POST /api/uploads` với `purpose=SOURCE`, chỉ khi issue còn `OPEN`.
   Hệ thống tạo `SourceSnapshot` ở trạng thái `PENDING`.
3. Worker job `source-snapshot` (`apps/worker/src/jobs/source-snapshot.ts`) làm:
   - Clone hoặc giải nén nguồn, đóng gói thành `.tar.gz`, tính sha256.
   - Tự nhận framework: `package.json` có `vitest` thì VITEST, có `requirements.txt` hoặc `pyproject.toml` thì PYTEST.
   - Tạo `context`: danh sách file (400 đầu) và nội dung một số file khớp từ khóa trong mô tả.
   - Đặt `READY` hoặc `FAILED`.
4. Client bấm sinh test: `generateTestCases` (`apps/web/src/graphql/modules/ai/ai.module.ts`).
   - Nếu snapshot `READY`, model nhận `framework` và `context`, và được yêu cầu trả về `testFilePath` cùng `testCode`.
   - Output tối đa 8000 token (có source), 2200 token (không có source).
   - Mỗi test phải có marker `[TC:{{ID}}]`, được thay bằng id thật sau khi tạo.
   - Các test được tạo ở trạng thái chưa approve.
5. Worker chạy `BASE_CHECK` trên snapshot gốc (không có patch). Kết quả ghi vào `TestCase.baseStatus`.
6. Client approve từng test. Approve bị từ chối nếu chưa có `baseStatus` khớp với `expectBaseFail` (`TEST_NOT_VERIFIED`).
7. Khi có dev được chọn và deposit, hash điều khoản (`termsHash`) khóa bộ test đã approve.

### 1.2 Vấn đề UX hiện tại

- Client phải điền form dài, rồi tự nghĩ ra điều kiện Given/When/Then. Nhiều bước, mỗi bước là một trang.
- Không có chỗ để client chỉ điểm lỗi. AI chỉ đoán từ tiêu đề và mô tả, rồi tự chọn file theo từ khóa.
- Kiểm chứng trên base mất vài phút (sandbox). Client không biết tiến độ, chỉ thấy trạng thái đổi sau đó.
- Không có "lưu nháp". Client phải đăng xong mới thấy lỗi.

### 1.3 Thiết kế UX đề xuất: đăng bounty trong 3 bước

**Bước 1: Việc cần làm.** Tiêu đề, mô tả, loại, kỹ năng, số tiền, token. Đây là form hiện có, giữ nguyên.

**Bước 2: Nguồn code và điểm lỗi.**
- Chọn một trong hai: dán URL GitHub public + ref, hoặc kéo thả file zip.
- Sau khi snapshot `READY`, hệ thống hiện cây thư mục (lấy từ `context`) và framework đã nhận diện.
- Client chọn tối đa 3 file nghi ngờ bằng checkbox trên cây. Có ô tùy chọn "Ghi chú lỗi" (một đến hai câu, ví dụ "hàm formatDate sai múi giờ khi UTC+7").
- Nút chính: **"AI soạn tiêu chí và test"**. Không yêu cầu client viết gì thêm.

**Bước 3: Duyệt.**
- Danh sách test, mỗi test có BDD (Given/When/Then) và trạng thái kiểm chứng: "Đỏ trên base" (đúng) hoặc "Xanh trên base" (sai, cần sửa).
- Client có ba thao tác: approve, sửa BDD, xóa. Sửa code test nằm trong mục "Nâng cao", đóng mặc định.
- Nút "Kiểm chứng lại" chạy `rerunBaseCheck`.
- Khi mọi test đã approve và kiểm chứng, nút "Đăng bounty" sáng lên.

**Yêu cầu chung của UX:**
- Lưu nháp ở mọi bước. Nháp là issue có `isDraft = true`. Enum `IssueStatus` không có trạng thái DRAFT. Marketplace chỉ hiện issue có `isDraft = false` (`issue.module.ts:277`).
- Tiến độ snapshot và base check hiện trên thanh trạng thái. Dùng thông báo `TEST_RUN_FINISHED` đã có để cập nhật, không cần làm polling dày.
- Nếu snapshot `FAILED`, hiện lý do (`error`) và cho đổi nguồn ngay trên bước 2.

### 1.4 Thay đổi kỹ thuật cho AI sinh test

- Thêm đầu vào `focusFiles: string[]` (tối đa 3) và `hint: string` (tối đa 500 ký tự) cho `generateTestCases`. Validate bằng zod. Đường dẫn phải nằm trong danh sách file của snapshot.
- Khi có `focusFiles`, đưa nội dung đầy đủ của các file đó lên đầu context (giới hạn 20 KB mỗi file), trước phần khớp từ khóa. Đây là thay đổi nhỏ trong `sourceContext`.
- Giữ nguyên quy tắc `[TC:{{ID}}]`, `validTestPath` và khóa `termsHash`. Không đổi.

### 1.5 Bảo mật cho tính năng 1

| Rủi ro | Biện pháp |
|---|---|
| Secret trong repo gửi cho AI | Loại `.env*`, khóa, và file có dòng giống khóa khỏi context (mục 4 của review). |
| Nội dung repo chứa lệnh giả (prompt injection) | Đặt code trong khối có ranh giới rõ, system prompt ghi rõ đó là dữ liệu. Chỉ chấp nhận output đúng schema JSON. Test sinh ra vẫn chạy trong sandbox không mạng. |
| Test sinh ra chạy vô hạn hoặc tốn tài nguyên | Sandbox có timeout 600 giây, 2 GB RAM, 256 tiến trình. Đã có. |
| Client dùng AI để tốn tiền model | `aiRateLimit` đã có. Thêm giới hạn số lần sinh test cho mỗi issue (ví dụ 5). |
| Client lấy source của người khác | Chỉ chấp nhận GitHub public hoặc zip do chính client upload. Repo private không làm (quyết định D6). |
| Lưu prompt chứa dữ liệu nhạy cảm | `aiLogs` lưu hash, không lưu nội dung đầy đủ. Giữ nguyên cách này. |

### 1.6 Câu hỏi cần bạn quyết định

1. Có cho client chọn file (`focusFiles`) hay chỉ dùng mô tả? Khuyến nghị: cho chọn, vì kết quả chính xác hơn và rẻ hơn.
2. Giới hạn số lần AI sinh test mỗi issue: 5 có đủ không?

---

## 2. AI đánh giá code của dev dựa trên bài nộp

### 2.1 Hiện trạng

- Dev đã có đường nộp bằng file `.patch` hoặc `.diff` (`DELIVERY`). Đường nộp này đã có kiểm tra sha256 phía server.
- `runSubmissionTests` chạy bộ test đã khóa trên `snapshot + patch`. Kết quả là `PASSED`, `FAILED`, `ERROR` hoặc `TIMEOUT`.
- Chưa có AI đánh giá chất lượng code. AI chỉ có ở hai nơi: sinh test (TESTGEN) và tranh chấp (DEBATE, dành cho arbiter).

### 2.2 Lựa chọn giải pháp

| Phương án | Mô tả | Ưu | Nhược |
|---|---|---|---|
| A. Chỉ test | Test pass là đủ. Không có AI đánh giá. | Đơn giản, tái lập được, khó bị đánh lừa. | Client không biết code có tốt hay không, chỉ biết có qua test hay không. |
| B. AI làm trọng tài | AI đọc diff và test, cho điểm pass hoặc fail. | Nhanh, đọc được cả code không có test. | Không tái lập được. Dễ bị prompt injection từ code dev. Tiền có thể đi theo quyết định của model. |
| C. Lai (khuyến nghị) | Test quyết định pass hoặc fail. AI viết báo cáo cho client: tóm tắt, rủi ro, dòng cần xem, kèm trích dẫn. Client quyết định release. | Tiền không phụ thuộc AI. Client có thêm thông tin để quyết định. | Phải làm thêm bước báo cáo. Chi phí model cao hơn. |

**Khuyến nghị: phương án C.** Lý do: tiền chỉ đi theo kết quả test và chữ ký client. AI không được quyền quyết định tiền. Đây cũng là cách an toàn nhất trước prompt injection.

### 2.3 Dev nộp code ở đâu, như thế nào

Có hai đường. Đường 1 đã có. Đường 2 là phần cần làm.

**Đường 1 (đã có): upload patch.**
- Dev tạo nhánh trên máy, commit, rồi chạy `git diff <base>..HEAD > fix.patch`.
- Upload `fix.patch` với `purpose=DELIVERY` qua `/api/uploads`, rồi gọi `/api/uploads/complete`. Server tự tính sha256 và kiểm tra kích thước thật.
- Tạo draft (`createSubmissionDraft`), chạy test (`runSubmissionTests`), chờ `PASSED`, rồi `prepareSubmitWork`.

**Đường 2 (đề xuất): nộp một commit trên nhánh public.**
- Dev đẩy nhánh lên GitHub public, rồi nhập URL và SHA commit vào draft (`commitSha` đã có trong manifest).
- Worker resolve SHA bằng `git ls-remote`, rồi clone đúng commit đó. Tạo snapshot của commit, không chạy code của dev ngoài sandbox.
- Kiểm tra: commit phải có `base` là snapshot gốc (`git merge-base --is-ancestor`). Nếu không, từ chối với lỗi rõ ràng.
- Sandbox chạy trên archive của commit, không cần patch. Diff cho AI do worker tự tính bằng `git diff`, không lấy từ dev.

### 2.4 Quy trình đánh giá đề xuất (phương án C)

```
Dev nộp (patch hoặc commit)
  → worker chạy bộ test đã khóa trong sandbox (không mạng khi chạy test)
  → kết quả PASSED/FAILED lưu vào TestRun
  → nếu có diff: worker gọi AI "báo cáo" với diff đã làm sạch
  → AI trả JSON: tóm tắt, danh sách rủi ro (kèm file và dòng), câu hỏi cho dev
  → client thấy một bảng: kết quả test, báo cáo AI, diff. Client bấm release hoặc yêu cầu sửa.
```

Điểm quan trọng: báo cáo AI là **phụ trợ**. Không có trường nào trong báo cáo nối vào `releaseFunds`, `deliveryHash` hay trạng thái issue.

### 2.5 Bảo mật cho tính năng 2

| Rủi ro | Biện pháp |
|---|---|
| Code dev chứa lệnh giả để AI cho điểm cao (prompt injection) | Diff là dữ liệu, không phải chỉ dẫn. Đặt trong khối có ranh giới. System prompt ghi rõ không làm theo nội dung trong diff. Output phải đúng schema, trích dẫn file và dòng phải tồn tại trong diff. Nếu không khớp, bỏ. AI không có tool, không có quyền gọi gì khác. |
| Dev đưa lệnh vào tên file hoặc comment để đánh lừa | Không đưa tên file hay comment làm chỉ dẫn. Vẫn để client thấy diff gốc để kiểm tra bằng mắt. |
| Diff chứa secret (của dev hoặc của client) | Quét diff bằng cùng bộ mẫu với mục 4 của review trước khi gửi. Nếu có secret: không gửi AI, báo client. |
| AI bị dùng để tấn công hạ tầng | Không có tool. Không cho model truy cập mạng. Chỉ nhận chuỗi văn bản đã làm sạch. |
| Quyết định tiền dựa trên AI | Không cho phép. Client vẫn ký `releaseFunds`. Contract không biết AI tồn tại. |
| Tốn tiền model do dev nộp liên tục | Chỉ gọi AI khi test `PASSED`, tối đa một lần mỗi `deliveryHash`. Cache kết quả theo hash. |
| Lưu nội dung nhạy cảm | Lưu hash prompt, model, phiên bản và thời gian (`aiLogs`). Không lưu nội dung đầy đủ. |
| Dev nộp commit trên fork để lách kiểm tra | Chỉ chấp nhận repo đã gắn với bounty (`githubRepo`). Kiểm tra cả owner và tên repo. |

### 2.6 Câu hỏi cần bạn quyết định

1. Có làm đường 2 (nộp commit) ngay không, hay để sau? Khuyến nghị: để sau. Đường 1 đủ cho đồ án. Đường 2 cần thêm clone trong sandbox và kiểm tra ancestor.
2. Báo cáo AI có hiện cho client không, hay chỉ cho arbiter khi tranh chấp? Khuyến nghị: hiện cho client, ghi rõ "phụ trợ, không quyết định".

---

## 3. Luồng nhắn tin và nộp bài: mô tả hệ thống hiện tại

### 3.1 Nhắn tin

**Mô hình dữ liệu.**
- `Conversation` có hai loại. `APPLICATION` là phòng riêng giữa client và một ứng viên, mở khi có đơn. `ISSUE_WORK` là phòng làm việc của issue, mở khi có dev được chọn.
- `ConversationParticipant` lưu `lastReadAt` của từng người. Chưa đọc được tính theo tin có `createdAt` lớn hơn `lastReadAt`.
- `Message` có `senderId`, `content` (đã qua AI guard), `type` (`TEXT` hoặc `FILE`), `clientMessageId` để chống gửi trùng.

**Gửi tin (`saveConversationMessage`, `apps/web/src/lib/chat-messages.ts`).**
1. Kiểm tra quyền ghi phòng (`accessibleConversation`).
2. Chạy AI guard trên nội dung. Guard có thể che thông tin liên hệ hoặc cảnh báo trao đổi ngoài nền tảng.
3. Mở transaction `Serializable`. Lấy advisory lock theo người nhận và issue, rồi khóa dòng conversation.
4. Nếu là `FILE`, kiểm tra attachment thuộc về người gửi, cùng issue, chưa gắn tin nào, và đúng `purpose`.
5. Tạo tin, cập nhật `lastMessageAt`, tạo thông báo `MESSAGE_RECEIVED` cho người nhận (không cho admin).
6. Sau khi commit, phát `message:new` qua socket tới room `conv:<id>`.

**Realtime.** Client join room bằng `conversation:join` hoặc `task:join`. Server kiểm tra quyền trước khi cho join. Gửi qua socket `message:send` cũng đi qua cùng hàm lưu tin.

**Tệp đính kèm trong chat.** Dùng `/api/uploads` với `purpose=CHAT`. Server tính sha256 khi hoàn tất. Tải về kiểm tra quyền theo `purpose` (`canDownload`, `apps/web/src/app/api/uploads/route.ts`).

**Giới hạn.** Rate limit 10 tin mỗi 10 giây, nhưng lưu trong bộ nhớ của từng process (xem mục 12 của review).

### 3.2 Nộp bài

**Ai làm gì, theo thứ tự.**

| Bước | Người làm | Việc | Nơi xử lý |
|---|---|---|---|
| 1 | Client | Đăng bounty, gắn nguồn, approve test | Web + worker (snapshot, base check) |
| 2 | Client | Chọn dev, deposit tiền vào escrow | Web + chain |
| 3 | Dev | Tạo draft: mô tả, PR (tùy chọn), file DELIVERY | `createSubmissionDraft` |
| 4 | Dev | Chạy test trên bản nộp | `runSubmissionTests` → worker |
| 5 | Worker | Chạy sandbox, ghi kết quả, báo dev | `testRunsJob` |
| 6 | Dev | Khi `PASSED`, chuẩn bị giao dịch nộp | `prepareSubmitWork` (kiểm tra gate) |
| 7 | Dev | Ký `submitWork(escrowId, deliveryHash)` bằng ví | Chain |
| 8 | Worker | Đọc event `WorkSubmitted`, chuyển submission sang `SUBMITTED` | Indexer |
| 9 | Client | Xem bài, rồi chọn: release, yêu cầu sửa, hoặc tranh chấp | Web + chain |
| 10 | Client | Ký `releaseFunds`. Dev nhận 97.5%, platform 2.5% vào `claimable` | Chain |
| 11 | Dev | Claim về ví (hoặc worker tự claim, nếu có relayer) | Chain + auto-claim |

Nếu client không duyệt trong 7 ngày kể từ lúc nộp (`submittedAt`), dev gọi `claimReviewTimeout` và nhận tiền.

**Chạy test trong sandbox (`apps/worker/src/runner/sandbox.ts`).**
1. Kiểm tra checksum của snapshot và của patch. Kiểm tra `bundleSha256` khớp bộ test đã khóa. Nếu tiêu chí đã đổi, dừng với lỗi `Criteria changed`.
2. Giải nén snapshot vào thư mục tạm. Lỗi nếu có symlink, `..` hoặc file `.git`.
3. Áp patch bằng `git apply --check` rồi `git apply`. Git không chạy code của dev.
4. Ghi các file test vào `__bloodyroar__/`. Từ chối symlink trên đường dẫn.
5. Cài dependency. VITEST: `bun install --ignore-scripts`. PYTEST: `pip install` (sẽ sửa theo mục 3 của review). Bước này có mạng.
6. Chạy test không mạng (`--network none`), không capability, FS chỉ đọc trừ `/work` và `/tmp`, 2 GB RAM, 2 CPU, 256 tiến trình, timeout 600 giây.
7. Đọc kết quả: vitest JSON hoặc pytest JUnit XML. Chỉ tính các test có marker `[TC:<id>]` trong tên. Test không có kết quả là `failed`.
8. Ghi `TestRun` và thông báo. Log tối đa 20 KB.

**Gate nộp bài (`assertSubmissionTestsPassed`).** Chỉ cho chuẩn bị `submitWork` nếu có một `TestRun` `PASSED` cùng `submissionId`, cùng `bundleSha256` và cùng `patchSha256` với bản nộp hiện tại. Nếu dev sửa file đính kèm, hash đổi, gate yêu cầu chạy lại.

**Điểm yếu đã biết.** Gate chỉ nằm ở server. Contract nhận mọi `submitWork`, và `deliveryHash` không chứa kết quả test (mục 7 của review). Đây là quyết định cần chốt.

### 3.3 Chuẩn bị tiêu chí và test (tóm tắt để đối chiếu)

- Test có hai phần: BDD để client đọc (`given`, `when`, `then`) và code thực thi (`testCode`, `testFilePath`). Chỉ phần code mới chạy trong sandbox.
- `BASE_CHECK` chạy trên snapshot gốc, không có patch. Test đúng là test bắt được lỗi (`expectBaseFail = true` và kết quả `failed`) hoặc test hồi quy (`expectBaseFail = false` và kết quả `passed`).
- Test chỉ approve được sau khi kiểm chứng. Thay đổi code test sẽ xóa `baseStatus` và chạy lại kiểm chứng.

---

## 4. Thứ tự làm đề xuất

| Đợt | Việc | Lý do |
|---|---|---|
| 1 | Sửa must-fix 1–5 của review | Đây là lỗ hổng thật, làm trước khi mở rộng |
| 2 | Tính năng 1: UX 3 bước và `focusFiles` | Giảm ma sát cho client, dùng lại hạ tầng có sẵn |
| 3 | Tính năng 2, phương án C: báo cáo AI phụ trợ cho bài nộp patch | Chỉ thêm một bước sau `PASSED`, không đổi tiền |
| 4 | Gate on-chain (mục 7 của review) | Cần quyết định và có thể cần audit contract |
| 5 | Đường 2: nộp commit | Chỉ làm khi đã có đường 1 ổn định |

## 5. Các quyết định cần bạn chốt

1. Client có chọn file (`focusFiles`) khi đăng bounty không? (Khuyến nghị: có.)
2. Giới hạn sinh test mỗi issue: 5 có được không?
3. Báo cáo AI hiện cho client hay chỉ cho arbiter? (Khuyến nghị: client, ghi rõ là phụ trợ.)
4. Đường nộp commit (đường 2) làm ngay hay để sau? (Khuyến nghị: sau.)
5. Gate nộp bài: chỉ ở server (hiện tại) hay đưa bằng chứng test lên chain? Đưa lên chain cần thay contract và audit, nên khuyến nghị giữ ở server, ghi rõ trong UI, và client phải xem kết quả trước khi release.
