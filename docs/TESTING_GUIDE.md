# Hướng Dẫn Test GraphQL API (Đầy đủ tất cả Modules)

Dưới đây là tổng hợp tất cả các queries và mutations hiện có của hệ thống (User, Issue, Application, Chat) để bạn có thể tự kiểm tra trên GraphiQL (`http://localhost:3000/api/graphql`).

> **Lưu ý quan trọng về Xác Thực (Authentication):**
> Đa số các thao tác cần phải đăng nhập (có `ctx.user`). Trong quá trình test, nếu chưa có hệ thống đăng nhập Frontend, bạn cần tạm thời tắt (comment) hàm `requireAuth` ở đầu mỗi module tương ứng và gán cứng một user ảo.
> Ví dụ: `const user = { id: "user_123", role: "CLIENT" };` (nhớ đổi role thành `DEVELOPER` khi test ứng tuyển).

---

## Phần 1: Module User (Người dùng)

*(Lưu ý: Schema `User` hiện không có trường `email`, tôi đã bỏ nó ra khỏi câu lệnh dưới đây để tránh lỗi)*

### 1.1 Lấy thông tin cá nhân (`me`)
```graphql
query GetMyProfile {
  me {
    id
    walletAddress
    role
    name
    bio
    skills
    reputationScore
    completedTaskCount
  }
}
```

### 1.2 Lấy thông tin một user bất kỳ (`user`)
```graphql
query GetUserProfile {
  user(id: "ĐIỀN_USER_ID_VÀO_ĐÂY") {
    id
    name
    bio
    reputationScore
  }
}
```

### 1.3 Cập nhật hồ sơ (`updateProfile`)
```graphql
mutation UpdateMyProfile {
  updateProfile(
    input: {
      name: "Tên Mới Của Tôi"
      bio: "Tôi là một Web3 Developer đam mê code."
    }
  ) {
    id
    name
    bio
  }
}
```

---

## Phần 2: Module Issue (Bounty / Nhiệm vụ)

### 2.1 Đăng Task mới (`createIssue`)
*(Yêu cầu role: CLIENT)*
```graphql
mutation CreateNewTask {
  createIssue(
    input: {
      title: "Cần fix bug Smart Contract"
      description: "Tôi có một lỗi reentrancy ở file Token.sol, cần cao thủ giúp!"
      category: SMART_CONTRACT
      bountyAmount: 500
      tokenId: "token_id_abc123" 
      requiredSkills: ["Solidity", "Hardhat", "Security"]
      difficulty: "Hard"
      timeEstimate: "3 days"
    }
  ) {
    id
    title
    status
    category
    createdAt
  }
}
```

### 2.2 Xem chi tiết 1 Task (`issue`)
```graphql
query GetIssueDetail {
  issue(id: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY") {
    id
    title
    description
    requiredSkills
    status
    bountyAmount
    client {
      id
      name
    }
  }
}
```

### 2.3 Xem danh sách Task (`issues`)
```graphql
query FilterIssues {
  issues(
    first: 10
    search: "bug"
    category: SMART_CONTRACT
    bountyMin: 100
    bountyMax: 1000
    status: OPEN
  ) {
    edges {
      node {
        id
        title
        bountyAmount
        category
        status
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### 2.4 Cập nhật Task (`updateIssue`)
*(Chỉ Chủ Task mới thực hiện được)*
```graphql
mutation UpdateMyTask {
  updateIssue(
    input: {
      id: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY"
      title: "Đã sửa tiêu đề: Cần fix bug Smart Contract gấp!"
      bountyAmount: 800
    }
  ) {
    id
    title
    bountyAmount
  }
}
```

### 2.5 Hủy Task (`cancelIssue`)
*(Chỉ Chủ Task mới thực hiện được và khi Task đang ở trạng thái OPEN)*
```graphql
mutation CancelMyTask {
  cancelIssue(id: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY") {
    id
    title
    status
  }
}
```

---

## Phần 3: Module Application (Ứng tuyển)

### 3.1 Nộp đơn ứng tuyển (`createApplication`)
*(Yêu cầu role: DEVELOPER)*
```graphql
mutation ApplyForTask {
  createApplication(
    input: {
      issueId: "ĐIỀN_ID_ISSUE_ĐANG_OPEN_VÀO_ĐÂY"
      message: "Tôi có 5 năm kinh nghiệm Solidity, có thể fix trong 1 ngày!"
    }
  ) {
    id
    status
    message
    createdAt
  }
}
```

### 3.2 Lấy danh sách ứng tuyển của mình (`myApplications`)
*(Dành cho Developer để xem mình đã nộp những đơn nào)*
```graphql
query GetMyApplications {
  myApplications {
    id
    status
    message
    issue {
      id
      title
      status
    }
  }
}
```

### 3.3 Xem danh sách đơn ứng tuyển của một Task (`applications`)
*(Dành cho Client xem có ai nộp đơn vào Task của mình)*
```graphql
query ViewApplicants {
  applications(issueId: "ĐIỀN_ID_ISSUE_CỦA_CLIENT") {
    id
    status
    message
    developer {
      id
      name
    }
  }
}
```

### 3.4 Chấp nhận ứng viên (`acceptApplication`)
*(Dành cho Client)*
```graphql
mutation AcceptDev {
  acceptApplication(applicationId: "ĐIỀN_ID_CỦA_APPLICATION_VÀO_ĐÂY") {
    id
    status
    issue {
      status
      developer {
        id
      }
    }
  }
}
```
*(Kết quả: Application thành `ACCEPTED`, Issue thành `IN_PROGRESS`, các Application khác bị `REJECTED`)*

### 3.5 Từ chối ứng viên (`rejectApplication`)
*(Dành cho Client)*
```graphql
mutation RejectDev {
  rejectApplication(applicationId: "ĐIỀN_ID_CỦA_APPLICATION_VÀO_ĐÂY") {
    id
    status
  }
}
```

---

## Phần 4: Module Chat (Tin nhắn)

### 4.1 Lấy danh sách tin nhắn của một Task (`messages`)
*(Yêu cầu user gọi lệnh này phải là Client hoặc Developer được phân công cho Task đó)*
```graphql
query GetChatMessages {
  messages(issueId: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY", first: 50) {
    edges {
      node {
        id
        content
        type
        createdAt
        sender {
          id
          name
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

---

## Phần 5: Module Escrow (Ký quỹ) & Dispute (Tranh chấp)

*(Lưu ý: Phần này đang trong quá trình phát triển (Phase 2). Nếu Smart Contract chưa được triển khai hoàn chỉnh, các API dưới đây sẽ thay đổi state trực tiếp trên Database để Frontend test UI (gọi là Mocking SC).*

### 5.1 Nạp tiền ký quỹ (`fundEscrow`)
*(Yêu cầu role: CLIENT. Client nạp tiền sau khi đã assign Developer)*
```graphql
mutation FundTaskEscrow {
  fundEscrow(
    issueId: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY"
    txHash: "0x1234567890abcdef..." # Hash giao dịch trên blockchain (nếu có)
  ) {
    id
    amount
    status # Sẽ chuyển thành FUNDED
    issue {
      status # Sẽ chuyển thành IN_PROGRESS
    }
  }
}
```

### 5.2 Giải ngân / Nghiệm thu (`releaseEscrow`)
*(Yêu cầu role: CLIENT. Client đồng ý trả tiền cho Developer sau khi nghiệm thu)*
```graphql
mutation ReleaseTaskEscrow {
  releaseEscrow(issueId: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY") {
    id
    status # Sẽ chuyển thành RELEASED
    issue {
      status # Sẽ chuyển thành COMPLETED
    }
  }
}
```

### 5.3 Báo cáo tranh chấp (`raiseDispute`)
*(Yêu cầu role: CLIENT hoặc DEVELOPER. Khi hai bên không thống nhất được kết quả)*
```graphql
mutation RaiseTaskDispute {
  raiseDispute(
    issueId: "ĐIỀN_ID_ISSUE_VÀO_ĐÂY"
    reason: "Developer nộp code không đúng yêu cầu ban đầu."
  ) {
    id
    status # Sẽ chuyển thành DISPUTED
    dispute {
      id
      reason
      status
    }
  }
}
```


## Test runner và inbox — xác minh 2026-11-10

Build image bằng lệnh trong `docs/RUNBOOK.md` trước khi chạy Docker tests.
Đặt `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` cùng trỏ tới database
Postgres **riêng có tên chứa `test`**, đã migrate. Không dùng database đang dùng
cho các lệnh test: integration/E2E/seed test có reset dữ liệu fixture.

```bash
bun run typecheck
bun run lint
bun run build
DOCKER_TESTS=1 bun run --cwd apps/web test
DOCKER_TESTS=1 GITHUB_TESTS=1 bun run --cwd apps/worker test
bun run --cwd packages/database test
bun run --cwd apps/web test:integration
bun run contracts:test
bun run --cwd apps/contracts test:fuzz
bun run --cwd apps/contracts test:fork
bun run test:e2e:backend
```

Mỗi suite DB dùng database test riêng nếu chạy song song. E2E harness dùng
Hardhat 18545, web 4012, worker 4011 và `.next-e2e` để không ghi vào cache dev;
Chrome headless chạy từ CLI qua Playwright, không cần điều khiển cửa sổ browser.

Đã kiểm chứng:

- `test-runner-flow.db.test.ts`: source ZIP → snapshot → sinh 3 executable cases
  từ AI fixture → BASE_CHECK đỏ đúng case bug, regression cases xanh → không
  approve trước xác minh → approve → draft patch → test PASSED → prepare được.
  FAILED, đổi bundle, đổi SHA256 patch, hoặc chưa chạy đều chặn prepare.
- `public-source.test.ts`: clone GitHub `unjs/pathe` tại tag `v2.0.3`, pin SHA,
  tạo test metadata yêu cầu tên package mới; base fail bằng assertion thật,
  patch đúng pass trong Docker. Không xem báo cáo rỗng là base failure hợp lệ.
- `sandbox.test.ts`: Vitest và pytest thật, base đỏ/patch đúng xanh, patch sai
  đỏ, path traversal bị chặn, skipped/missing test không được tính pass.
- `conversations.db.test.ts`: 2 ứng viên có phòng riêng, outsider/admin không
  đọc application room, AI masking, idempotency, attachment không qua phòng
  khác, unread theo participant, khóa ghi sau lựa chọn, admin chỉ đọc work
  room khi DISPUTED. Badge vẫn đúng khi đang chờ funding.
- `source-download.test.ts`: chỉ task parties được tải; admin chỉ khi dispute;
  chặn đường dẫn ngoài snapshot root và symlink, response không cache public.
- `e33-auto-claim.test.ts`: fund → submit → release → auto-claim, event/indexer
  và token balance khớp trong dưới một phút.

Scenario UI `apps/web/ui-e2e/e34-inbox.test.ts` kiểm desktop/mobile: client đổi
qua lại hai phòng, nút quay lại trên mobile, ứng viên B không nhìn thấy tin hay
phòng của A. `e32-ui-flow.test.ts` giữ kiểm hồi quy luồng ví/issue/chat hiện có.
Kết quả cuối của harness ghi vào `tests/e2e/.run/last-run.txt`.

AI trong integration test là fixture xác định để kiểm prompt/context, thay ID,
queue và approval gate. Chất lượng model thật phụ thuộc endpoint/model do chủ
môi trường cấu hình; không thay model hay gửi source thật tới dịch vụ khác khi
chạy test.

Kết quả chốt: web 661/661; worker 88/88; database 4/4; integration 2/2;
Hardhat 36/36; Foundry 13/13; Base Sepolia fork 1/1; backend E2E 43/43;
UI 3/3. Typecheck, lint, production build và `git diff --check` đều pass.
UI đã chạy lại bằng `E2E_UI_ONLY=1 bun run test:e2e:local` sau lượt backend
đầy đủ; default harness vẫn chạy cả backend lẫn UI.
