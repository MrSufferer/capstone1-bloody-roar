# Giải ngân, test case tự chạy, chat nhiều người: kiểm tra và kế hoạch

Ngày: 2026-11-09. Nhánh kiểm tra: `chore/demo-data-local`.

## 0. Tóm tắt

| Câu hỏi | Trạng thái hiện tại |
|---|---|
| Dev submit → hệ thống kiểm tra → OK → giải ngân | **Chưa có bước "hệ thống kiểm tra".** Dev ghi `deliveryHash` lên chain, client tự bấm Release. Không có test nào chạy trên code của dev. |
| Phần tiền on-chain có đúng không | **Đúng.** Contract `BloodyRoarEscrow` chia tiền đúng, 35/35 test Hardhat pass. Worker ghi `ClaimableBalance` đúng theo event. |
| Tiền tự về ví dev chưa | **Chưa.** Contract dùng pull-payment: sau khi resolve, tiền nằm ở `claimable[dev]`, dev phải tự vào Dashboard bấm Claim và trả gas. |
| Acceptance criteria | AI đã sinh được (task `TESTGEN`), nhưng chỉ là **văn bản BDD** (given/when/then), không chạy được. AI chỉ đọc title/description, không đọc source. |
| Chat | 1 phòng / 1 issue, chỉ mở sau khi đã chọn dev. Không có inbox, không chat với ứng viên trước khi chọn. |

---

## 1. Kiểm tra luồng giải ngân hiện tại

### 1.1 Luồng thật trong code

```
Client tạo issue ─► AI/thủ công tạo TestCase (văn bản) ─► client approve
      │                                    (termsHash = hash(issue + criteria + deadline))
      ▼
Client chọn dev ─► deposit() on-chain        phase = FUNDED
      ▼
Dev: createSubmissionDraft (PR url, commit, file) ─► manifest ─► deliveryHash
Dev: prepareSubmitWork ─► ví ký submitWork(escrowId, deliveryHash)
      ▼
Worker bắt WorkSubmitted ─► Submission = SUBMITTED, báo client
      ▼
Client xem bài giao (bằng mắt) ─┬─► prepareReleaseFunds ─► ví client ký releaseFunds()
                                ├─► requestChanges (chỉ DB + notification)
                                └─► raiseDispute
      ▼
Contract _resolve(): dev nhận 97.5%, platform 2.5%  ─► claimable[...]
Worker bắt EscrowResolved ─► ClaimableBalance += , Issue = COMPLETED, báo FUNDS_CLAIMABLE
      ▼
Dev vào Dashboard ─► prepareClaim ─► ví dev ký claim(dev) ─► USDC về ví
```

File liên quan:
- `apps/contracts/contracts/BloodyRoarEscrow.sol` (`submitWork`, `releaseFunds`, `claimReviewTimeout`, `_resolve`, `claim`)
- `apps/web/src/graphql/modules/submission/draft.module.ts`
- `apps/web/src/graphql/modules/escrow/release.module.ts`
- `apps/worker/src/effects/work.ts`, `resolved.ts`, `claimed.ts`
- `apps/web/src/components/marketplace/issue-detail-view.tsx` (`reviewDelivery`), `dashboard/dashboard-view.tsx` (Claim)

### 1.2 Phần đúng

- Contract: kiểm tra phase, quyền, solvency sau mỗi lần đổi số dư; chia phí bằng `Math.mulDiv`; pull-payment nên một người bị chặn nhận tiền không kẹt người khác. `bun run contracts:test`: **35 passing**.
- Server chỉ "prepare" calldata, không tự giữ khóa, không tự chuyển tiền. Tiền chỉ đổi trạng thái khi worker thấy event trên chain.
- Worker idempotent theo `chainEventId`, có xử lý reorg.

### 1.3 Lỗ hổng về nghiệp vụ (không phải bug tiền)

1. **Không có bước kiểm tra tự động.** "Hệ thống xác nhận OK" hiện là client bấm nút. TestCase không gắn với submission nào, không có kết quả pass/fail.
2. **`requestChanges` sau deadline vô nghĩa.** Contract chặn `submitWork` khi `block.timestamp > deliveryDeadline`. Nếu client yêu cầu sửa sát hoặc sau deadline, dev không nộp lại được. Lối ra duy nhất là đợi review timeout hoặc dispute.
3. **Review window tính từ `deliveryDeadline`, không tính từ lúc nộp.** Dev nộp ngày 1 của deadline 30 ngày thì client có tới 37 ngày mới bị timeout. Dev bị giam tiền lâu dù đã xong.
4. **PR merged không ảnh hưởng tiền.** Webhook GitHub chỉ cập nhật `prState` và gửi notification.

### 1.4 Chưa kiểm được

- Test DB của worker (`effects-resolved`, `effects-claimed`) cần `TEST_DATABASE_URL` trỏ tới DB có hậu tố `_test`. Máy này chưa cấu hình nên chưa chạy.

---

## 2. Tiền tự về ví dev

Contract **đã cho phép** làm việc này mà không cần sửa: `claim(address recipient)` ai gọi cũng được, tiền luôn chuyển cho `recipient`, không chuyển cho người gọi. Vậy chỉ cần một relayer.

### Giải pháp: worker auto-claim

- Thêm job `apps/worker/src/jobs/auto-claim.ts`. Khi `applyResolved` chạy xong, đưa địa chỉ dev vào hàng đợi (bảng `AutoClaimJob` hoặc cột `autoClaimAt` trên `ClaimableBalance`).
- Job dùng ví relayer của platform (khóa trong env `RELAYER_PRIVATE_KEY`, chỉ nạp ETH gas, **không giữ USDC**) gọi `claim(devAddress)`.
- Event `Claimed` đi vào `applyClaimed` như hiện tại, dev nhận thông báo "Đã nhận tiền". Không cần đổi logic indexer.
- Chỉ auto-claim cho developer (và tùy chọn cho client khi được refund). Không auto-claim cho `feeRecipient` (Safe tự rút).
- Giữ nút Claim thủ công làm đường dự phòng khi relayer hết gas.

Rủi ro: relayer hết ETH thì job dừng. Thêm alert vào `apps/worker/src/alerts.ts` khi số dư gas thấp. Chi phí gas do platform chịu, có thể bù bằng 2.5% phí.

Không đổi contract sang push-payment: push trong `_resolve` làm một ví bị blacklist USDC kẹt luôn cả escrow.

---

## 3. Test case do AI tạo và tự chạy

### 3.1 Mục tiêu

AC phải là **test chạy được**, chạy trên **code dev nộp**, kết quả gắn vào submission. Client vẫn đọc được bản BDD để duyệt.

### 3.2 Quy trình đề xuất

```
[1] Client tạo issue
    - Mô tả lỗi + nguồn code: repo GitHub + branch/commit lỗi
      HOẶC upload file .zip source
    - Nếu repo private: client cài GitHub App của platform (quyền read contents) cho repo đó
      → không phải mời ai làm collaborator

[2] Platform chụp snapshot "base"
    - Worker clone đúng commit (hoặc giải nén zip) → lưu tarball vào S3 (S3Storage đã có)
    - base_sha256 = hash tarball

[3] AI phân tích + sinh test
    - Input: mô tả lỗi + cây thư mục + file liên quan (repomix --compress) + framework phát hiện được
      (package.json → vitest/jest/playwright; pyproject → pytest; go.mod → go test)
    - Output 2 phần:
        a) BDD (given/when/then) như hiện tại → để client đọc
        b) File test thực thi, mỗi file map tới 1 TestCase.id
    - AI cũng sinh lệnh chạy: install + test command

[4] Kiểm chứng "đỏ" trên base (bắt buộc)
    - Chạy test mới trên snapshot base trong sandbox
    - Test cho bug PHẢI FAIL trên base, test regression có sẵn PHẢI PASS
    - Test nào pass ngay trên base = test vô dụng → loại hoặc cho AI sửa (tối đa 2 vòng)

[5] Client duyệt
    - Xem BDD + code test + kết quả đỏ trên base, sửa/xóa/approve
    - Khi approve: test_bundle_sha256 đưa vào termsHash (mở rộng reservationTermsHash)
    → dev biết trước chính xác bộ test sẽ chấm mình; không ai đổi được sau khi deposit

[6] Dev làm việc
    - Tải snapshot base (link S3 ký sẵn) hoặc clone repo nếu public
    - Dev thấy bộ test công khai. (Tùy chọn: client giữ 1-2 test ẩn, chỉ hiện hash)

[7] Dev nộp
    - Cách A (khuyến nghị, không cần quyền repo): nộp patch `git diff base..HEAD`
      hoặc `git bundle`, upload qua /api/uploads (purpose DELIVERY, đã có sha256)
    - Cách B: PR trên GitHub + commitSha (giữ luồng hiện tại, cần repo public hoặc GitHub App)

[8] Hệ thống chạy test (worker)
    - Tạo TestRun: base snapshot + patch → container sandbox → chạy bộ test đã khóa
    - Lưu kết quả từng TestCase, log (S3), hash kết quả
    - Gắn testRunHash vào manifest → deliveryHash (bằng chứng on-chain dev nộp bản đã chạy)

[9] Gate
    - prepareSubmitWork chỉ cho phép khi TestRun mới nhất của draft = PASSED
      (hoặc cho nộp khi FAILED nhưng hiển thị rõ, tùy chính sách)
    - Client thấy "12/12 pass" cạnh nút Release
    - Dispute: TestRun là bằng chứng cho arbiter và AI DEBATE
```

### 3.3 Sandbox chạy test

| Phương án | Ưu | Nhược | Dùng khi |
|---|---|---|---|
| **Docker trên máy worker** (khuyến nghị cho capstone) | Đơn giản, miễn phí, chạy local được | Phải tự cô lập: `--network none` sau bước install, `--memory 2g --cpus 2 --pids-limit 256`, timeout 10 phút, user không root, FS read-only trừ `/work` | Demo, MVP |
| Vercel Sandbox / e2b (microVM) | Cô lập mạnh, không lo container escape | Tốn phí, phụ thuộc dịch vụ ngoài | Production |
| GitHub Actions trên repo của platform | Có sẵn runner | Phải push code vào repo platform, chậm, quản lý quyền rườm rà | Không khuyến nghị |

Code dev nộp là **code không tin cậy**. Không bao giờ chạy trực tiếp trên host worker, không mount secret, không cho mạng khi chạy test.

Image theo ngôn ngữ: `node:20`, `python:3.12`, `golang:1.22`. Bước install chạy có mạng, bước test chạy không mạng.

### 3.4 Thay đổi schema (Prisma)

```prisma
model Issue {
  // thêm
  sourceKind     SourceKind?   // GITHUB | UPLOAD
  sourceRef      String?       // branch hoặc tên file
  baseCommitSha  String?
  baseSnapshotKey    String?   // key S3
  baseSnapshotSha256 String?
}

model TestCase {
  // thêm
  testFilePath String?   // đường dẫn file test trong bundle
  testCode     String?   // nội dung test
  isHidden     Boolean @default(false)
  baseResult   TestResultStatus?  // phải là FAILED với test bug
}

model TestRun {
  id            String @id @default(cuid())
  issueId       String
  submissionId  String?      // null = run trên base
  kind          TestRunKind  // BASE_CHECK | SUBMISSION
  status        TestRunStatus // QUEUED | RUNNING | PASSED | FAILED | ERROR | TIMEOUT
  bundleSha256  String       // hash bộ test đã khóa
  patchSha256   String?
  resultsJson   Json?        // [{ testCaseId, status, durationMs, message }]
  logKey        String?      // S3
  resultHash    String?
  startedAt     DateTime?
  finishedAt    DateTime?
  createdAt     DateTime @default(now())
  @@index([issueId, createdAt])
}
```

### 3.5 Về model AI ("luna", "terra")

`apps/web/src/ai/model-router.ts` đã hỗ trợ endpoint tương thích OpenAI qua `AI_BASE_URL`, `AI_API_KEY` và đổi model theo task bằng `AI_MODEL_TESTGEN`. Muốn dùng model nào của OpenAI chỉ cần set env, không sửa code. Tôi không xác minh được tên chính xác "luna"/"terra" phía OpenAI. Cần lấy model id đúng từ trang model của OpenAI rồi điền vào env.

Lưu ý: sinh test từ source cần context lớn hơn hiện tại (`maxTokens: 2200`). Prompt mới gửi kèm repomix của các file liên quan, nên chọn model có context dài và tăng `maxTokens`.

---

## 4. Chat: thiết kế lại cho 1 người nhắn nhiều người

### 4.1 Hiện tại

- `Message.issueId`: mỗi issue là 1 phòng, chỉ client + dev đã được chọn.
- `canReadIssueChat` chặn chat khi chưa có `developerId` → client không hỏi ứng viên được trước khi chọn.
- `readAt` nằm trên từng message: đúng với 2 người, sai khi có người thứ 3 (admin lúc dispute).
- Không có trang inbox liệt kê mọi cuộc trò chuyện.

### 4.2 Mô hình mới

```prisma
model Conversation {
  id            String @id @default(cuid())
  kind          ConversationKind  // ISSUE_WORK | APPLICATION | DIRECT
  issueId       String?
  applicationId String?  @unique
  lastMessageAt DateTime?
  createdAt     DateTime @default(now())
  participants  ConversationParticipant[]
  messages      Message[]
  @@unique([issueId, kind])   // 1 phòng làm việc / issue
  @@index([lastMessageAt])
}

model ConversationParticipant {
  conversationId String
  userId         String
  role           ParticipantRole  // CLIENT | DEVELOPER | APPLICANT | ADMIN
  lastReadAt     DateTime?
  mutedAt        DateTime?
  leftAt         DateTime?
  @@id([conversationId, userId])
  @@index([userId])
}

model Message {
  // thay issueId bằng conversationId; giữ issueId tạm thời để migrate
  conversationId String
}
```

- **Unread** = số message có `createdAt > participant.lastReadAt` và `senderId != me`. Bỏ `readAt` trên message.
- **APPLICATION**: mỗi đơn ứng tuyển có 1 phòng client ↔ ứng viên. Khi client chọn dev khác, phòng chuyển read-only. Khi chọn chính ứng viên đó, lịch sử vẫn còn, phòng ISSUE_WORK mở tiếp.
- **ISSUE_WORK**: giữ quy tắc hiện tại (mở từ AWAITING_FUNDING, read-only sau COMPLETED). Admin được thêm làm participant khi DISPUTED.
- **DIRECT** (tùy chọn, làm sau): nhắn trực tiếp ngoài issue. Bỏ qua ở bản đầu nếu không cần.
- Giữ AI guard (`guardMessage`) cho mọi tin, nhất là phòng APPLICATION (chặn trao đổi liên lạc ngoài nền tảng).

### 4.3 API và realtime

- `myConversations(first, after)`: danh sách theo `lastMessageAt desc`, kèm tin cuối, đối phương, số chưa đọc.
- `messages(conversationId, ...)`, `sendMessage(conversationId, ...)`, `markConversationRead(conversationId)`.
- Socket: room `conv:<id>` cho tin nhắn, room `user:<id>` để đẩy cập nhật inbox và badge tổng.
- Quyền đọc/ghi chuyển từ `chat-access.ts` sang kiểm tra participant + trạng thái issue.

### 4.4 UI

- Trang `/messages`: cột trái danh sách hội thoại (lọc theo issue, chưa đọc), cột phải `ChatRoom` hiện có (đổi prop sang `conversationId`). Mobile: 2 màn hình.
- Badge tổng chưa đọc trên Navbar.
- Tab Bounty Chat trong trang issue vẫn giữ, mở thẳng hội thoại tương ứng.
- Trang ứng viên: nút "Nhắn tin" cạnh mỗi đơn.

### 4.5 Migration

1. Tạo bảng mới, thêm `Message.conversationId` nullable.
2. Script backfill: mỗi issue có message → 1 Conversation ISSUE_WORK + 2 participant, `lastReadAt` = `max(readAt)` theo người nhận.
3. Đổi code đọc/ghi sang `conversationId`, sau đó đặt NOT NULL, bỏ `Message.readAt`.

---

## 5. Thứ tự làm

| Đợt | Việc | Ước lượng | Lý do thứ tự |
|---|---|---|---|
| 1 | Auto-claim relayer (mục 2) | 1-2 ngày | Nhỏ, không đổi contract, trả lời ngay câu "tiền tự về ví" |
| 1 | Sửa review window: client có X ngày kể từ lúc nộp. **Cần đổi contract** (`submittedAt` + `REVIEW_PERIOD`), deploy lại | 1 ngày + test | Bảo vệ dev, nên làm trước khi demo thật |
| 2 | Chat: schema + backfill + API + inbox (mục 4) | 4-5 ngày | Độc lập với test runner, chia người làm song song được |
| 3 | Snapshot source + TestRun + sandbox Docker (mục 3.2 bước 2, 7, 8) | 5-7 ngày | Hạ tầng cần có trước khi AI sinh test chạy được |
| 3 | AI sinh test thực thi + kiểm chứng đỏ trên base (bước 3, 4, 5) | 4-5 ngày | Phụ thuộc runner |
| 4 | Gate submit theo TestRun, hiển thị kết quả, đưa vào dispute (bước 9) | 2-3 ngày | Cuối cùng |
| sau | Contract có vai trò `verifier` để tự release khi pass | cần audit | Chỉ làm khi chấp nhận tin platform; hiện client vẫn ký release |

## 6. Cần anh/chị quyết định

1. **Tự release khi test pass?** Hiện contract bắt client ký. Muốn tự động hoàn toàn thì phải thêm vai trò verifier (platform) vào contract. Khuyến nghị: giữ client ký, cộng review window tính từ lúc nộp (ví dụ 3 ngày) để client không ngâm tiền được.
2. **Cách dev nộp code**: patch/bundle upload (không cần quyền repo, khuyến nghị) hay bắt buộc PR GitHub?
3. **Test ẩn**: có cho client giữ test ẩn không? Có thì chống được dev viết code chỉ để qua test, nhưng dev dễ phản đối là "luật không rõ".
4. **Chat trước khi chọn dev**: có mở cho ứng viên không? Có thì phải giữ AI guard chặn trao đổi liên lạc ngoài.
5. **Ai trả gas auto-claim**: platform (lấy từ 2.5%) hay trừ vào tiền dev?
