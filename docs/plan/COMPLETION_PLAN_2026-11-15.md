
# Kế hoạch hoàn thiện dự án (đối chiếu code và Jira ngày 15/11/2026)

Nhánh: `feat/payout-testrunner-chat`. Bản sửa lần 4.

Tài liệu này là nguồn chính cho việc còn lại. Khi nó khác với `WORK_BREAKDOWN_2026-11-12.md` hoặc `ADR_2026-11-12.md`, tài liệu này đúng. Các chỗ khác nhau được liệt kê ở mục 7.

Không có phần chia người và không có hạn. Việc được xếp theo thứ tự phụ thuộc (mục 6). Bạn chia người sau.

Cách kiểm: đọc code bằng CodeGraph và grep, đọc và sửa project KAN qua Jira API, chạy `bun run typecheck`, `bun run lint`, test đơn vị web và worker.

## 1. Kết luận

1. Nền tảng S0 đến S6 đã xong và nằm trên `main`. Ba khối của S7 (auto-claim, test runner, inbox chat) đã có code và test nhưng nằm trong 245 file chưa commit.
2. Còn 44 story phải làm trước khi phát hành, chia 7 giai đoạn (0 đến 6), và 27 story mở rộng ở giai đoạn 7. Mỗi story có giải pháp kỹ thuật ở mục 6 và có issue trên Jira với tiền tố `[FE]`, `[BE]`, `[Smartcontract]`, `[QA]`, `[Ops]` hoặc `[Enhance]`.
3. Hai lỗ hổng tiền cần đóng trước mọi việc khác: dev đã được chọn vẫn rút đơn được (G-14), và release không gắn với bài client đã xem (G-5).
4. Quyết định đã chốt ngày 15/11: hạn duyệt giữ 7 ngày kể từ lần nộp gần nhất (S-108 đóng), tranh chấp giữ bật (S-110 cắt), giao diện tiếng Anh toàn bộ, test và demo trên Hardhat local (Base Sepolia để sau), sửa contract để release nhận hash (S-117), tệp chat quét nhanh rồi gửi ngay.
5. Dự án không dùng dịch vụ trả tiền nào của thirdweb. Chi tiết ở mục 4.3.
6. File `.env` đang trỏ `DATABASE_URL` tới Supabase (DB production) trong khi `CHAIN_ID=31337` (Hardhat local). DB này còn thiếu 3 migration. Xem G-17 và S-107.

Sức khỏe code: typecheck sạch, lint sạch, web 638 test đạt và 29 bỏ qua, worker 45 đạt và 96 bỏ qua. Các test bị bỏ qua là test cần database.

## 2. Jira (project KAN)

Quy ước tiền tố trong tên issue:

| Tiền tố | Nghĩa |
|---|---|
| `[BE]` | Backend: GraphQL, worker, database |
| `[FE]` | Giao diện |
| `[BE][FE]` | Cần cả hai |
| `[Smartcontract]` | Sửa contract Solidity, ABI |
| `[QA]` | Viết và chạy kiểm thử |
| `[Ops]` | Vận hành, hạ tầng, runbook, quản lý |
| `[Enhance]` | Mở rộng, làm sau khi các giai đoạn 0 đến 6 xong. Đi kèm tiền tố khu vực, ví dụ `[Enhance][BE]` |

Trạng thái sau khi cập nhật ngày 15/11:

| Nhóm | Issue | Trạng thái Jira |
|---|---|---|
| Lịch sử S0 đến S6, S-1001 | KAN-66 đến KAN-76, KAN-25 | Done |
| Ba khối S7 đã có code | KAN-77, KAN-78, KAN-79 | In Progress, đóng khi PR ở giai đoạn 0 được merge |
| Đã cắt (nhãn `cut`) | KAN-43 (S-602), KAN-56 (S-903), KAN-30 (S-204), KAN-46 (S-703), KAN-81 (S-110) | Done |
| Việc phải làm (nhãn `mvp`) | 44 story, xem bảng mục 6 | To Do |
| Mở rộng (nhãn `post-release`, tiền tố `[Enhance]`) | 27 story, xem mục 6.8 | To Do |
| EPIC | KAN-1 đến KAN-10, KAN-65 | Không đổi |

Thành viên có thể được gán việc trong project KAN (kiểm ngày 15/11): `trongkhoidev`, `dovanhieu2305`, `dtngochan0406`, `Bảo Trâm`, và hai tài khoản cùng tên `Kien Nguyen`. Cần xác định tài khoản nào của Kiên là tài khoản đang dùng trước khi gán.

Chưa làm trên Jira:
- Người được giao và story point. Mọi issue vẫn gán cho tài khoản của bạn, bạn chia sau.
- Sprint thật. Board KAN là Kanban team-managed, không tạo được sprint. Nhãn `sprint-7`, `sprint-8`, `sprint-9` trên các story là gợi ý cũ, không còn ràng buộc. Thứ tự đúng là giai đoạn ở mục 6.
- Mô tả của nhiều issue còn dòng "Người gợi ý" và ước lượng pd cũ. Phạm vi kỹ thuật đúng là mục 6 của tài liệu này. Các issue đã được viết lại mô tả cho khớp tài liệu: KAN-13, 17, 19, 28, 53, 54, 57, 88, 89, 94 đến 98, 100.

## 3. Tiến độ theo tính năng

| Tính năng | Tình trạng | Còn thiếu |
|---|---|---|
| Đăng nhập ví, hồ sơ, marketplace, ứng tuyển | Xong | |
| Escrow: chọn dev, nạp tiền, nộp bài, release, hoàn tiền, timeout | Xong luồng chính | Khóa rút đơn, guard effect deposit, ràng buộc hash khi release (giai đoạn 1) |
| Tranh chấp, bằng chứng, phán quyết | Xong luồng chính | Quy tắc phí và điều kiện mở, đếm ngược (giai đoạn 7) |
| Indexer, projection, đối soát, reorg | Xong | Áp migration production (giai đoạn 0) |
| Auto-claim | Xong code, tắt khi không có khóa relayer | Ghi runbook |
| Test runner: snapshot nguồn, sandbox, base check, gate nộp bài | Xong code, chưa commit | Cảnh báo, quét secret trong patch, cây file, file lạ (giai đoạn 2) |
| Trang issue, form đăng bounty, màn nộp và duyệt | Có, một file 1365 dòng, chưa theo vai trò | Wizard, panel theo vai trò, màn duyệt có hash, màn nộp có trạng thái giao dịch (giai đoạn 3) |
| AI sinh tiêu chí và test | Có | Chọn file, chống tiêm lệnh, "Check my scope", "Catch up" (giai đoạn 4) |
| Chat: hai loại phòng, inbox, che secret | Xong code, chưa commit | Kiểm quyền socket, dòng sự kiện, gửi ảnh có quét (giai đoạn 5) |
| E2E, runbook, demo trên Hardhat local | E2E backend 43/43 ngày 3/11, trước các thay đổi S7 | Giai đoạn 6. Deploy Base Sepolia ở giai đoạn 7 |

## 4. Lỗ hổng trong code hiện tại

### 4.1 Logic và tiền

| Mã | Lỗ hổng | Hậu quả | Mức | Sửa ở |
|---|---|---|---|---|
| G-14 | Dev được chọn vẫn rút đơn được, sau đó deposit đến và effect đổi đơn `WITHDRAWN` thành `ACCEPTED` | Tiền bị khóa cho một dev đã rút. Client phải chờ quá hạn giao mới lấy lại | Cao | S-101, S-102 |
| G-5 | Release không gắn với bài client đã xem. Dev nộp bản mới ngay trước khi client bấm thì tiền vẫn đi theo bản mới | Client trả tiền cho bản chưa duyệt | Cao | S-103, S-604 |
| G-7 | Đã chốt 15/11: giữ hạn duyệt là 7 ngày kể từ lần nộp gần nhất, như contract. Còn một dòng lệch: projection lúc deposit ghi `deliveryDeadline + 7 ngày` (`effects/escrow.ts:152`). Thiết kế `14_Workroom` cũng đang vẽ "Review closes" theo hạn giao | Đếm ngược sai cho tới khi dev nộp bài | Thấp | S-115, sửa chữ trên UI theo contract |
| G-6 | Đã chốt 15/11: tranh chấp giữ bật (thay ADR-0015). Luồng tranh chấp có từ S6, quy tắc về phí và điều kiện mở chưa thiết kế | Ai trong hai bên cũng mở được tranh chấp, không mất phí | Trung, chấp nhận | S-203a, S-203b ở giai đoạn 7. E2E có một kịch bản tranh chấp (S-901) |
| G-12 | Patch của dev chạy trong cùng thư mục với test và file kết quả `.br-results.json`. Patch có thể thêm `vitest.config`, file setup hoặc sửa `package.json` để làm test luôn đạt | Kết quả `PASSED` không phải bằng chứng chắc chắn. Kế hoạch đã chấp nhận (L-12) nhưng UI chưa nói cho client | Trung | S-403 (file lạ), thêm một dòng ghi chú ở màn duyệt (S-604) |
| G-9 | Trong phòng chat, hai người đang gửi được cho nhau nhiều loại tệp, gồm HTML, SVG, JS và file nén, và hệ thống chỉ kiểm loại khai báo và kích thước (`uploads/route.ts:95`, `chat-room.tsx:309`) | Tệp giả loại, tệp chứa secret, tệp chạy được script tới thẳng người nhận | Trung | C-1: quét nhanh trong bước hoàn tất tải lên rồi gửi ngay (chốt 15/11). Quét sâu ở nền là việc mở rộng |
| G-13 | Tiến trình con trên máy worker (`git`, `python3`, `docker`) nhận toàn bộ env, gồm `DATABASE_URL` và khóa relayer. Container chạy code của dev thì không nhận (chỉ `HOME`, `PYTHONPATH`) | Thấp hơn mô tả trong kế hoạch, vẫn nên đóng | Thấp | S-104 |
| G-11 | Snapshot nguồn đọc từ đĩa cục bộ của worker (`.data/snapshots`, `jobs/test-runs.ts`). Tôi chưa kiểm web phục vụ link tải snapshot từ đâu | Nếu web và worker ở hai máy, link tải có thể hỏng | Chưa rõ | Kiểm trong S-113 |
| G-15 | 96 test worker và 29 test web bị bỏ qua khi không có DB | "Xanh" ở máy cá nhân chưa nói gì về đường đi qua DB | Trung | Chạy có DB trong S-905, và trước mỗi lần merge |
| G-16 | 245 file thay đổi chưa commit, trong đó có toàn bộ test runner và inbox | Mất việc nếu hỏng máy. Không ai review được | Cao | Việc đầu tiên, giai đoạn 0 |
| G-17 | `.env` trỏ tới DB Supabase production trong khi chain là Hardhat local (`CHAIN_ID=31337`). Lệnh `db:migrate` (`prisma migrate dev`) không có chốt `assert-local-db` như `db:push`, `db:reset`, `db:seed` | Dữ liệu escrow của chain local nằm lẫn trong DB production, và thành rác mỗi lần reset Hardhat. Gõ nhầm `db:migrate` có thể bị đòi reset DB production | Cao | S-107 thêm chốt cho `db:migrate`. Test cần DB chạy trên Postgres local. Đề xuất: dùng Postgres local (`localhost:5433`, `docs/LOCAL_DEV.md`) cho việc test với Hardhat, giữ Supabase cho bản triển khai |

### 4.2 UI và UX

| Mã | Lỗ hổng | Người dùng thấy gì | Sửa ở |
|---|---|---|---|
| U-1 | `source-panel.tsx:21` chỉ tự tải lại khi trạng thái là `PENDING` | Trạng thái dừng ở `PROCESSING` cho tới khi tải lại trang | Sửa một dòng: poll khi `PENDING` hoặc `PROCESSING` |
| U-2 | `test-run-panel.tsx` hiện `testCaseId` thô (chuỗi id) và trạng thái thô `SUBMISSION: PASSED` | Dev không biết test nào hỏng | Hiện tiêu đề tiêu chí, làm trong S-605 |
| U-3 | Mỗi `TestRunPanel` gọi API 5 giây một lần và không bao giờ dừng. Trang issue tạo một panel cho mỗi bài nộp | Trang nặng dần theo số bài nộp | Chỉ poll khi run mới nhất là `QUEUED` hoặc `RUNNING` |
| U-4 | Nút "Submit for review" sáng theo run mới nhất của bản nháp, còn server so cả hash patch và bộ test. Sửa bản nháp sau khi đạt thì nút vẫn sáng (suy từ code panel, chưa chạy thử) | Bấm nộp rồi nhận lỗi `TESTS_NOT_PASSED` | Đặt lại `testsPassed` khi lưu nháp, kiểm trong S-605 |
| U-5 | Nút release không có hộp xác nhận, không hiện hash bài, không hiện số tiền dev nhận (`issue-detail-view.tsx:344`) | Một lần bấm là ký giao dịch trả tiền | S-604 |
| U-6 | Không có đếm ngược hạn giao, hạn duyệt, hạn reservation 24 giờ. Chỉ có dòng chữ tĩnh "7 days after the latest submission" | Hai bên không biết còn bao lâu | S-603, S-115 |
| U-7 | Đã chốt 15/11: tiếng Anh toàn bộ. Hiện ngôn ngữ lẫn lộn: giao diện tiếng Anh (`lang="en"`), thông báo escrow tiếng Việt ("Đã nạp ký quỹ"), thông báo test tiếng Anh thô ("Test run finished", "SUBMISSION: passed") | Cảm giác sản phẩm chắp vá | Đổi các chuỗi thông báo tiếng Việt trong `apps/worker/src/effects/*.ts` sang tiếng Anh, làm cùng S-102 |
| U-8 | Lỗi backend hiện nguyên văn tiếng Anh (`error.message`), không dịch theo `code` | Thông báo khó hiểu ở các bước tiền | Bảng thông báo tiếng Anh dễ hiểu theo `code`, làm cùng S-603 |
| U-9 | Inbox: mỗi `inbox:update` tải lại trang đầu và bỏ các trang đã "Load more". Hội thoại ở trang sau hiện "unavailable or on a later page" | Danh sách nhảy khi có tin mới | S-306, giai đoạn 7 |
| U-10 | Bounty không có test chạy được không có cảnh báo nào | Dev tưởng có kiểm tự động | S-201 |
| U-11 | Tạo bounty xong mới chọn nguồn và sinh test ở trang issue | Client phải tự tìm bước tiếp theo | S-601 |


### 4.3 Web3 và thirdweb

Đã đọc: `BloodyRoarEscrow.sol` (deposit, submitWork, releaseFunds, hai hàm timeout, claim, `_resolve`), `lib/web3/send-prepared.ts`, `lib/web3/client.ts`, `release.module.ts`, `draft.module.ts`, `effects/escrow.ts`, `jobs/auto-claim.ts`.

Phần làm đúng trong contract: tiền ra theo kiểu người nhận tự rút (`claimable` rồi `claim`), kiểm số token thực nhận khi deposit, kiểm khả năng thanh toán sau mỗi lần đổi số dư, phí 2,5% tính trên phần của dev, chặn nộp bài sau hạn giao, không ai rút được một mình khi escrow đang `FUNDED`.

| Mã | Vấn đề | Hậu quả | Mức | Đề xuất |
|---|---|---|---|---|
| W-1 | Nếu tắt tranh chấp, client chỉ còn release hoặc chờ. Sau 7 ngày bất kỳ ai cũng gọi được `claimReviewTimeout` và dev nhận tiền. Dev còn gọi thẳng `submitWork` trên contract với hash bất kỳ, bỏ qua cổng test của server | Dev nộp bài rác vẫn nhận đủ tiền | Đã xử lý | Chốt 15/11: tranh chấp giữ bật. S-110 cắt |
| W-2 | Cờ ở server không tắt được contract: một bên vẫn gọi `raiseDispute` trực tiếp | Bounty kẹt ở trạng thái không có giao diện nếu UI ẩn tranh chấp | Đã xử lý | Giữ nguyên UI tranh chấp |
| W-3 | `releaseFunds(escrowId)` không nhận hash. S-103 chỉ chặn ở server lúc chuẩn bị giao dịch. Dev vẫn có thể nộp bản mới trong khoảng từ lúc client ký tới lúc giao dịch vào block | Client trả tiền cho bản chưa xem | Trung | Chốt 15/11: làm S-117 (KAN-100), contract nhận `expectedDeliveryHash`. Đang chạy Hardhat local nên deploy lại không tốn gì |
| W-4 | Giao dịch chỉ gửi qua ví cài trong trình duyệt (`window.ethereum`, `send-prepared.ts:13`), trong khi màn đăng nhập có tab "social" | Người đăng nhập kiểu social hoặc dùng điện thoại không ký được giao dịch nạp tiền, nộp bài, release. Tôi chưa chạy thử tab social | Trung, cần kiểm | Kiểm trong S-607. Nếu tab social không ký được thì ẩn tab này |
| W-5 | Sau khi ví gửi giao dịch, UI tự tải lại 4 giây một lần, tối đa 2 phút, rồi dừng không báo gì. Worker chờ block "safe" nên có thể lâu hơn 2 phút trên Base Sepolia | Người dùng thấy trạng thái cũ và không biết giao dịch đã vào hay chưa | Trung | Năm trạng thái giao dịch trong S-605, áp dụng cho cả nạp tiền và release |
| W-6 | Mã giao dịch được ghi về server sau khi ví gửi (`send-prepared.ts:31`). Đóng tab giữa hai bước thì intent không có `txHash` | Trạng thái tiền vẫn đúng vì indexer đọc event. Chỉ bản ghi intent treo rồi hết hạn | Thấp | Không làm |
| W-7 | `client.ts` ghi cứng RPC công khai `https://sepolia.base.org` cho ví | Chỉ ảnh hưởng khi chạy trên Base Sepolia | Thấp lúc này | S-118 (giai đoạn 7): RPC riêng có khóa cho worker |
| W-8 | Bước approve token trước deposit và các module settlement, dispute, ruling | Chưa đọc | Chưa rõ | Rà trong S-105 khi viết E2E |

**thirdweb có miễn phí không.** Với cách dự án đang dùng thì không tốn tiền thirdweb:

- Code chỉ import hai thứ: `ThirdwebAuth` và `buildJWT` từ `@thirdweb-dev/auth`, `PrivateKeyWallet` từ `@thirdweb-dev/wallets` (`lib/auth.ts`, `lib/auth/siwe.ts`). Chúng kiểm chữ ký đăng nhập và ký JWT bằng khóa `AUTH_PRIVATE_KEY` của bạn, chạy ngay trên server của bạn.
- Không có file nào đọc `THIRDWEB_SECRET_KEY` hay `THIRDWEB_CLIENT_ID`. Biến `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` được khai trong `next.config.mjs` nhưng không nơi nào dùng. Có thể bỏ ba biến này khỏi `.env.example`.
- Kết nối ví và gửi giao dịch dùng `ethers` với ví của người dùng. RPC là của bạn. Không qua hạ tầng thirdweb.
- `@thirdweb-dev/sdk` có trong `package.json` nhưng không file nào import. Gỡ trong S-114. Ba biến `THIRDWEB_*` bỏ trong S-607.

Về bảng giá của thirdweb (chỉ liên quan nếu sau này dùng RPC, in-app wallet, gas sponsorship của họ): tôi không mở được trang giá chính thức. Các trang bên thứ ba mâu thuẫn nhau: trang mới nhất nói không còn gói miễn phí, trang khác ghi Starter 5 USD mỗi tháng, gói Growth 99 USD mỗi tháng thì các nguồn thống nhất. Hãy xem thirdweb.com/pricing trước khi quyết định dùng dịch vụ của họ.

Rủi ro thật với thirdweb là phiên bản: dự án dùng bộ v4 (`@thirdweb-dev/*`). Tài liệu chuyển đổi của thirdweb nói họ không có kế hoạch cập nhật dependency của v4 và khuyên chuyển sang gói `thirdweb` v5. Với hai hàm đang dùng, cách rẻ nhất sau phát hành là thay bằng `siwe` và `jose`, không cần v5. Trước phát hành chỉ rà advisory (S-114). Việc thay thư viện nằm ở giai đoạn 7.

Nguồn: [thirdweb React v5 migration](https://portal.thirdweb.com/react/v5/migrate), [thirdweb TypeScript v5 migration](https://portal.thirdweb.com/typescript/v5/migrate), [CostBench thirdweb plans](https://costbench.com/software/web3-wallet-sdk/thirdweb/), [CostBench free plan](https://costbench.com/software/web3-wallet-sdk/thirdweb/free-plan/), [Toolradar thirdweb pricing](https://toolradar.com/tools/thirdweb/pricing).

## 5. AI và phòng chat: làm gì, dựa trên tài liệu nào

Mọi mục dưới đây lấy từ tài liệu của bạn. Tôi không thêm tính năng ngoài tài liệu.

Ranh giới giữ nguyên (`AI_STRATEGY_V1_V2.md` mục 0, Proposal mục 5.2): AI chỉ gợi ý, không quyết định tiền, không chặn release, mọi tính năng AI có trạng thái "AI unavailable".

### 5.1 AI

| Tính năng | Tài liệu | Hiện có | Giai đoạn (mục 6) | Story |
|---|---|---|---|---|
| AI Guard che secret và thông tin liên lạc trong chat | AI_STRATEGY 3.1 | Có. Tin bị che hiện dòng "Sensitive…" (`chat-room.tsx:297`) | Đã có | |
| Sinh tiêu chí và test chạy được | AI_STRATEGY 3.2 | Có (`generateTestCases`), chưa chọn được file | Giai đoạn 4: chọn tối đa 3 file và ghi chú lỗi, file được chọn vào đầu context, kiểm chống tiêm lệnh từ repo | S-701, S-702, S-705 |
| "Check my scope": chỉ ra mô tả mơ hồ, câu hỏi mở, gợi ý độ khó khi đăng bounty | AI_STRATEGY 3.5 (mức v1, "rẻ, giá trị cao") | Chưa | Giai đoạn 4, một nút trong wizard | S-116 (KAN-86) |
| "Catch up": tóm tắt phòng chat từ lần đọc cuối | AI_STRATEGY 3.5 (mức v1.5) | Chưa | Giai đoạn 4 | S-310 (KAN-88) |
| Đánh giá bài nộp theo từng tiêu chí ("AI: likely met", "Completion estimate") | AI_STRATEGY 3.3, thiết kế `14_Workroom` | Chưa | Giai đoạn 7 (EP-8). Trước đó, kết quả test runner đóng vai trò bằng chứng | S-801 đến S-806 |
| Vòng AI tự sửa test, bộ đánh giá model | AI_STRATEGY 3.2 | Chưa | Giai đoạn 7 | S-703, S-704, S-706 |
| Bản tóm tắt bằng chứng cho trọng tài | AI_STRATEGY 3.4 | Có một phần (có test `dispute-analysis`) | Đã có, không mở rộng | |

Trong giai đoạn 7, việc AI đáng làm đầu tiên là đánh giá bài nộp theo tiêu chí (S-801 đến S-806), vì thiết kế `14_Workroom` đã vẽ sẵn chỗ hiển thị.

### 5.2 Phòng chat giữa client và dev

| Tính năng hỗ trợ hai người | Tài liệu | Hiện có | Giai đoạn (mục 6) | Story |
|---|---|---|---|---|
| Hai loại phòng: trao đổi trước khi chọn (APPLICATION) và phòng làm việc (ISSUE_WORK), quyền đọc ghi theo trạng thái | NEXT_STEPS 4.1 | Có | Đã có | |
| Inbox, số tin chưa đọc, trả lời tin, chống gửi trùng | NEXT_STEPS 4.2 (M6) | Có | Đã có | |
| Che secret trước khi tin tới người nhận, kèm nhãn | Thiết kế `14_Workroom` ("edited by AI Guard") | Có | Đã có | |
| Người mất quyền không nhận tin mới | NEXT_STEPS 4.2 (M5) | Chưa | Giai đoạn 5 | S-301 |
| Dòng sự kiện trong phòng: "Escrow funded", "Delivery v2 submitted", "Changes requested" | Thiết kế `14_Workroom` | Chưa. Schema đã có loại tin `SYSTEM` | Giai đoạn 5 | S-309 (KAN-87) |
| Thanh ngữ cảnh trong phòng: trạng thái bounty, hạn giao, hạn duyệt, câu "If you do nothing, the developer can claim … from …" | Thiết kế `14_Workroom` | Chưa | Giai đoạn 3, nằm trong panel theo vai trò và đếm ngược | S-603, S-115 |
| Banner lý do phòng chỉ đọc | WORK_BREAKDOWN 3.2 | Có một dòng chung | Giai đoạn 3, nêu đúng lý do | S-603 |
| Gửi tệp và ảnh, quét nhanh rồi gửi ngay, báo cáo tệp | ADR-0016 và CHAT_FILES_SECURITY (đã đổi cách quét, xem mục 7 dòng 16) | Chưa (đang gửi tệp gần như không kiểm, G-9) | Giai đoạn 5 | C-1, C-5 đến C-9 |
| Báo cáo tin chữ, chặn người dùng, giới hạn số phòng mới mỗi ngày | NEXT_STEPS 4.2 (M1, M4) | Chưa | Giai đoạn 7, S-302 làm đầu | S-302, S-303, S-304 |
| Quét sâu ở nền sau khi gửi: ClamAV, ảnh nhạy cảm | CHAT_FILES_SECURITY | Chưa | Giai đoạn 7 | C-2, C-3, C-4a, C-4 |
| Xóa tệp chat 90 ngày sau khi phòng đóng | NEXT_STEPS 4.2 (M9), D-13 | Chưa | Giai đoạn 7 | |

## 6. Việc còn lại và giải pháp kỹ thuật

Xếp theo thứ tự phụ thuộc. Trong một giai đoạn, các story không ghi "Cần" có thể làm song song. Mỗi story: viết test đỏ trước, rồi chạy `bun run typecheck` và `bun run lint`.

### 6.0 Giai đoạn 0: nền

| Story | Jira | Giải pháp | Xong khi |
|---|---|---|---|
| `[Ops]` Commit working tree | KAN-77, 78, 79 | Tách 245 file thành các commit theo nhóm: test runner, inbox chat, sửa theo review, tài liệu. Mở PR vào `main`. Chạy test có DB trước khi merge | PR merge, ba issue chuyển Done |
| `[Ops]` S-107 Migration lên Supabase | KAN-17 | DB đang thiếu 3 migration: `checkpoint_block_hashes`, `snapshot_processing`, `snapshot_attempts` (kiểm bằng `prisma migrate status` ngày 15/11). Thời điểm: ngay sau khi PR trên được merge, trước khi chạy worker mới trên DB này. Bước: sao lưu bằng `pg_dump` hoặc backup của Supabase, chạy `bun run --cwd packages/database db:migrate:prod`, kiểm status. Thêm `scripts/assert-local-db.ts` vào đầu lệnh `db:migrate`. Từ nay mỗi story có migration áp bằng `db:migrate:prod` khi merge | Status báo up to date; `db:migrate` từ chối chạy trên DB không phải local |
| `[Ops]` S-501 Hash checkpoint | KAN-23 | Sau S-107, khởi động worker mới, kiểm cold start khi map `canonicalBlockHashes` trống, ghi vào `docs/RUNBOOK.md` | Worker chạy qua một vòng index trên DB đã migrate |
| `[Ops]` S-109 Relayer tắt | KAN-80 | Không thêm cờ. `jobs/auto-claim.ts` đã tắt khi thiếu `RELAYER_PRIVATE_KEY`. Ghi vào runbook và `.env.example` | Runbook có mục này |

### 6.1 Giai đoạn 1: an toàn tiền

| Story | Jira | Giải pháp | Xong khi |
|---|---|---|---|
| `[BE]` S-101 Khóa rút đơn khi đã được chọn | KAN-11 | `application.module.ts`, `withdrawApplication`: chạy trong transaction, khóa dòng issue bằng `SELECT … FOR UPDATE` như các module escrow, rồi tìm `fundingReservation` có `applicationId` này và status `AWAITING_FUNDING` hoặc `FUNDED`. Có thì trả `APPLICATION_NOT_WITHDRAWABLE` | Test DB: dev được chọn rút đơn lúc chờ tiền bị chặn; đơn chưa được chọn vẫn rút được |
| `[BE]` S-102 Effect deposit không ghi đè đơn | KAN-12 | `apps/worker/src/effects/escrow.ts`, `applyFunded`: đọc status của đơn trước khi gọi `acceptDeposit`. Khác `PENDING` thì thêm lý do `application` và đi nhánh `markMismatch`. `undoDeposit` đã xử lý trạng thái `MISMATCHED` nên reorg không vỡ. Đổi các chuỗi thông báo trong file này sang tiếng Anh | Test: đơn `WITHDRAWN` không thành `ACCEPTED`, reservation thành `MISMATCHED`; deposit khớp vẫn chạy đúng |
| `[BE]` S-103 Release theo hash đã xem | KAN-13 | `escrow/release.module.ts`, `prepareReleaseFunds`: thêm tham số bắt buộc `reviewedDeliveryHash`, so không phân biệt hoa thường với `projection.deliveryHash`, khác thì trả `DELIVERY_CHANGED`. Sửa cùng lúc mọi nơi gọi: `issue-detail-view.tsx`, `apps/web/scripts/e2e-role-flows.ts`, `tests/e2e/harness/payout.ts` | Test: duyệt bản A, dev nộp bản B, release với hash A bị chặn |
| `[Smartcontract]` S-117 `releaseFunds` nhận hash | KAN-100 | `BloodyRoarEscrow.releaseFunds(escrowId, expectedDeliveryHash)`, revert `DeliveryChanged` nếu khác `escrow.deliveryHash`. Cập nhật test Hardhat, fuzz, `packages/shared/src/escrow/abi.ts`, `release.module.ts` truyền `reviewedDeliveryHash` vào args của `createPreparedCall`, harness E2E, deploy lại contract local. Cần: S-103 | Test contract: release với hash cũ bị revert; E2E local xanh |
| `[BE]` S-104 Whitelist env | KAN-14 | `apps/worker/src/runner/command.ts`: thay `...process.env` bằng các biến `PATH`, `HOME`, `TMPDIR`, `LANG`, `DOCKER_HOST` và mọi biến bắt đầu bằng `GIT_`, cộng ba biến git đang đặt sẵn | Test: tiến trình con in env, không có `DATABASE_URL` và `RELAYER_PRIVATE_KEY`; `docker` và `git` vẫn chạy |

### 6.2 Giai đoạn 2: test runner

| Story | Jira | Giải pháp | Xong khi |
|---|---|---|---|
| `[BE][FE]` S-201 Cảnh báo không có test | KAN-28 | BE: field `noExecutableTests` trên type Issue, tính từ `executableCases(issueId)` rỗng, không thêm cột. FE: banner "This bounty has no automated checks." cho cả client và dev trên trang issue. Không chặn đăng (D-5) | Test: đăng bounty không có test thành công, field trả `true`, banner hiện |
| `[BE]` S-401 Cảnh báo `QUEUED` lâu | KAN-20 | `apps/worker/src/alerts.ts`: đếm `testRun` status `QUEUED` có `createdAt` cũ hơn 15 phút, gửi cảnh báo qua webhook đang có, khóa chống lặp theo id của run. Thêm số run đang chờ vào endpoint health của worker | Test: một run quá hạn tạo đúng một cảnh báo qua nhiều lần chạy job |
| `[BE]` S-402 Quét secret trong patch | KAN-21 | `apps/worker/src/jobs/test-runs.ts`: sau khi đọc bytes của patch và kiểm checksum, quét bằng bộ mẫu `packages/shared/src/source-privacy.ts`. Có secret thì run thành `ERROR`, log ghi `PATCH_CONTAINS_SECRET` và loại secret, không ghi giá trị, không chạy sandbox. Tệp đã nằm trong storage từ lúc tải lên, nên chặn ở bước chạy là đủ vì cổng nộp bài đòi `PASSED` | Test: patch có `API_KEY=…` cho run `ERROR`, log không chứa giá trị |
| `[BE]` S-403 File lạ không ảnh hưởng kết quả | KAN-22 | `apps/worker/src/runner/sandbox.ts`: sau khi áp patch, xóa thư mục `__bloodyroar__` rồi mới ghi các file test đã khóa. Gọi vitest và pytest với danh sách đường dẫn file cụ thể thay cho tên thư mục | Test sandbox: patch thêm file vào `__bloodyroar__/` không đổi kết quả |
| `[BE]` S-404 Cây file của snapshot | KAN-35 | Migration: cột `fileTree Json?` trên `SourceSnapshot`. `jobs/source-snapshot.ts` ghi danh sách `{path, size}` sau khi lọc bằng `source-privacy`, không ghi nội dung. `issueSource` trả `fileTree` cho chủ bounty | Test: repo trên 400 file có đủ cây; tệp nhạy cảm không có trong cây |
| `[BE]` S-202 Dọn bản nháp cũ | KAN-18 | `submission/draft.module.ts`: khi tạo bản nháp mới vì bản cũ đã có intent, đặt bản cũ thành `SUPERSEDED` trong cùng transaction. `effects/work.ts` phải vẫn nhận bài nếu hash của bản cũ lên chain (dev ký intent cũ sau khi tạo nháp mới): tìm theo `deliveryHash`, không lọc theo status `DRAFT` | Test: không còn hai bản `DRAFT`; test effect: hash của bản đã `SUPERSEDED` lên chain vẫn thành `SUBMITTED` |

### 6.3 Giai đoạn 3: luồng giao diện

Toàn bộ chuỗi hiển thị bằng tiếng Anh.

| Story | Jira | Giải pháp | Xong khi |
|---|---|---|---|
| `[BE]` S-206 Hành động ngoài escrow | KAN-19 | Không viết module mới. `issue/issue-availability.module.ts` đã có `availableActions { action, enabledAt, reasonDisabled }`. Thêm `withdrawApplication`, `editCriteria`, `setSource`, `publish`, lý do lấy từ đúng điều kiện mà mutation tương ứng kiểm | Test: với mỗi status của issue, `reasonDisabled` trùng mã lỗi mutation trả về |
| `[BE]` S-608 Bounty nháp và `publishIssue` | KAN-99 | `issue/issue.module.ts`: `createIssue` nhận `isDraft` (mặc định `false`). Mutation `publishIssue(id)` cho chủ bounty đặt `isDraft = false`. `applyToIssue` từ chối bounty nháp. Marketplace, comment, source đã lọc `isDraft` sẵn | Test: nháp không hiện ở marketplace, không ứng tuyển được; publish xong thì hiện |
| `[FE]` S-601 Wizard 3 bước | KAN-42 | Sửa `issues/create-issue-form.tsx`. Bước 1: form hiện có, cuối bước gọi `createIssue(isDraft: true)`. Bước 2: `SourcePanel`, cây file từ `fileTree`, chọn tối đa 3 file, ô ghi chú, nút "Draft criteria with AI" gọi `generateTestCases(focusFiles, hint)`, nút "Check my scope". Bước 3: `TestCasePanel` với trạng thái base check, nút "Re-run check" (`rerunBaseCheck`), nút "Publish bounty" (`publishIssue`) kèm lý do khi bị khóa. Lưu form bước 1 vào `localStorage` trong try/catch. Cần: S-608, S-404, S-701 | Test UI đi hết ba bước ở 360 px và màn rộng |
| `[FE]` S-603 Panel theo vai trò | KAN-37 | Tách `marketplace/issue-detail-view.tsx` thành các panel: Source and checks, Criteria, Applicants, Deliveries, Escrow. Nút và lý do đọc từ `availableActions`. Thêm thanh ngữ cảnh trong phòng chat: status, hạn giao, hạn duyệt, câu "If you do nothing, the developer can claim … from …". Banner phòng chỉ đọc nêu đúng lý do. Một file `lib/error-messages.ts` đổi `code` của lỗi backend thành câu tiếng Anh dễ hiểu. Giữ nguyên UI tranh chấp. Cần: S-206 | Test UI theo ba vai: client, dev được chọn, người ngoài |
| `[BE][FE]` S-115 Đếm ngược | KAN-85 | Đọc `deliveryDeadline`, `reviewDeadline` từ projection và `expiresAt` của reservation. Chỉ hiện đếm ngược hạn duyệt khi escrow đã có `deliveryHash`, vì trước đó projection ghi `deliveryDeadline + 7 ngày` (`effects/escrow.ts:152`) còn contract tính từ lần nộp. Chữ trên UI: "7 days after the latest submission" | Test: trước khi nộp không hiện hạn duyệt; sau khi nộp hiện đúng mốc |
| `[FE]` S-604 Màn duyệt bài | KAN-38 | Thêm `deliveryHash` vào truy vấn submissions. Hiện hash đầy đủ và kết quả test của đúng bài. Nút "Release" mở hộp xác nhận: hash rút gọn, số tiền dev nhận, phí. Gửi `reviewedDeliveryHash`. Khi nhận `DELIVERY_CHANGED` hoặc có bài mới qua `escrow:invalidate`: banner "The developer submitted a new version. Review it before releasing." và khóa nút. Ghi chú dưới kết quả test: "Automated checks are a signal, not a guarantee." (G-12). "Request changes" ghi rõ chỉ lưu trên hệ thống. Cần: S-103 | Test UI: release gửi đúng hash; bài mới khóa nút |
| `[FE]` S-605 Màn nộp bài | KAN-39 | Bốn bước: tải patch, chạy test, chuẩn bị ký, ký. `TestRunPanel` hiện tiêu đề tiêu chí thay cho id, chỉ poll khi run mới nhất là `QUEUED` hoặc `RUNNING`. Đặt lại `testsPassed` mỗi lần lưu nháp. Năm trạng thái giao dịch lấy từ `IntentStatus`: chờ ký, đã gửi, chờ safe head, đã xác nhận, thất bại. Dùng chung thành phần này cho nạp tiền và release (W-5) | Test UI đi hết luồng; sửa nháp sau khi đạt thì nút nộp khóa lại |
| `[FE]` S-607 Lỗi UI nhỏ | KAN-101 | `source-panel.tsx:21` poll khi `PENDING` hoặc `PROCESSING`. Chuỗi thô trong `jobs/test-runs.ts` thành câu tiếng Anh. Kiểm tab đăng nhập "social" có ký được giao dịch không, không được thì ẩn. Bỏ `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` khỏi `next.config.mjs` và ba biến `THIRDWEB_*` khỏi `.env.example` | Test cho poll; không còn chuỗi tiếng Việt hiển thị cho người dùng |

### 6.4 Giai đoạn 4: AI

Ranh giới: AI không quyết định tiền, không chặn release, luôn có trạng thái "AI unavailable". Mọi lời gọi đi qua `scanAndMask`, `aiRateLimit` và `ai/model-router.ts`. `AILog` chỉ lưu HMAC.

| Story | Jira | Giải pháp | Xong khi |
|---|---|---|---|
| `[BE]` S-701 `focusFiles` và `hint` | KAN-44 | `ai/ai.module.ts`, `generateTestCases`: thêm `focusFiles` (tối đa 3) và `hint` (tối đa 500 ký tự), kiểm bằng zod. Mỗi đường dẫn phải có trong `fileTree`. Cần: S-404 | Test: đường dẫn ngoài `fileTree` bị từ chối |
| `[BE]` S-702 File được chọn vào đầu context | KAN-45 | Thứ tự context: nội dung đầy đủ của `focusFiles` (tối đa 20 KB mỗi file), rồi `package.json` hoặc `pyproject.toml`, rồi phần còn lại. Vẫn qua `sanitizeSourceContext`. Cần: S-701 | Test: file chọn nằm đầu; file chứa secret vẫn bị loại |
| `[BE]` S-705 Chống tiêm lệnh từ repo | KAN-48 | Đặt nội dung repo trong khối có ranh giới, system prompt nói rõ đó là dữ liệu. Thêm một repo mẫu có câu lệnh giả trong comment. Cần: S-702 | Test: với repo mẫu, test sinh ra vẫn đỏ trên base vì lỗi thật |
| `[BE][FE]` S-116 "Check my scope" | KAN-86 | BE: mutation `checkIssueScope(issueId)` cho chủ bounty, trả `{ ambiguities[], openQuestions[], difficulty }`, kiểm bằng zod, không lưu DB. FE: nút ở bước 1 của wizard, hiện kết quả dưới form, không chặn bước tiếp. Cần: S-608 | Test schema đầu ra, test fallback khi model lỗi |
| `[BE][FE]` S-310 "Catch up" | KAN-88 | BE: mutation `summarizeConversation(conversationId)`, kiểm quyền bằng `accessibleConversation`, chỉ phòng `ISSUE_WORK`, lấy tối đa 200 tin sau lần đọc cuối của người gọi, không lưu bản tóm tắt. FE: nút trong `ChatRoom`, kết quả là một khối riêng, không phải tin nhắn | Test: người ngoài phòng bị từ chối; test fallback |

### 6.5 Giai đoạn 5: phòng chat

| Story | Jira | Giải pháp | Xong khi |
|---|---|---|---|
| `[BE]` S-301 Kiểm quyền khi phát tin | KAN-31 | `socket/handlers.ts`, `broadcastConversationMessage`: trước khi phát, lấy các socket trong phòng bằng `io.in(room).fetchSockets()`, gọi `accessibleConversation` cho từng người, ai không còn quyền thì `socket.leave`. Phòng chỉ có hai người nên chi phí nhỏ. Không cần móc vào từng lần đổi status. Lịch sử phòng đã xong vẫn đọc được qua GraphQL như bảng quyền hiện tại | Test: ứng viên bị từ chối không nhận `message:new` |
| `[BE][FE]` S-309 Dòng sự kiện trong phòng | KAN-87 | BE: effect deposit, nộp bài, release trong worker và mutation `requestChanges` ghi một `Message` loại `SYSTEM` vào phòng `ISSUE_WORK`. `senderId` là người thực hiện hành động vì cột này bắt buộc. `clientMessageId` là `<chainEventId>:sys`, kiểm tồn tại trước khi ghi để chạy lại không ghi trùng. Khi reorg, xóa tin theo tiền tố id sự kiện, giống cách xóa notification trong `undo.ts`. Không qua AI guard. Thêm `SYSTEM` vào kiểu `ChatMessagePayload`. FE: hiện dạng dòng giữa, tải lại khi nhận `escrow:invalidate` | Test effect: mỗi sự kiện đúng một tin, chạy lại không trùng, undo xóa tin |
| `[BE][FE]` S-305 Gửi tệp và ảnh, quét nhanh rồi gửi ngay | KAN-53 | Gồm C-1, C-5 đến C-9 dưới đây. Người gửi không phải chờ: quét chạy trong chính bước hoàn tất tải lên, mục tiêu dưới 1 giây, đạt thì tin được gửi như hiện tại | C-9 xanh |
| `[BE]` C-1 Quét nhanh | KAN-89 | `api/uploads/complete/route.ts` đã đọc bytes để tính sha256, thêm bước quét cho purpose `CHAT`, dừng ở lỗi đầu tiên. (1) Loại tệp cho chat: JPEG, PNG, GIF, WebP, PDF, text, markdown, diff, patch, JSON. Không nhận SVG, HTML, JS, TS, CSS, zip, tar, gzip trong chat; các purpose khác không đổi. (2) Tối đa 10 MB. (3) Magic bytes khớp loại khai báo, dùng bảng chữ ký viết tay cho ảnh và PDF, không thêm thư viện; tệp văn bản phải là UTF-8 hợp lệ và không có byte NUL. (4) Tệp văn bản: quét secret bằng `scanAndMask`, có thì từ chối. (5) Tên tệp đi qua guard. Không đạt: status `REJECTED` (giá trị mới của `AttachmentStatus`, cần migration), xóa object, trả 422 kèm `code`: `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `FILE_CONTENT_MISMATCH`, `FILE_CONTAINS_SECRET` | Test từng mã lỗi; file `.exe` đổi đuôi thành `.png` bị từ chối; tệp 10 MB quét dưới 1 giây |
| `[BE]` C-6 Tải có quyền | KAN-95 | GET trong `api/uploads/route.ts`: với tệp chat luôn gửi `X-Content-Type-Options: nosniff`, ảnh hiện inline, loại khác gửi `Content-Disposition: attachment`, URL ký hết hạn sau 60 giây, kiểm thành viên phòng bằng `accessibleConversation`. Cần: C-1 | Test: người ngoài phòng nhận 403; PDF trả về dạng attachment |
| `[BE]` C-7 Quota | KAN-96 | POST trong `api/uploads/route.ts`: đếm `Attachment` purpose `CHAT` của người gửi trong 24 giờ bằng truy vấn DB, tối đa 50 tệp và 200 MB mỗi ngày, vượt thì 429 `RATE_LIMITED`. Tệp `REJECTED` vẫn tính | Test vượt số tệp và vượt dung lượng |
| `[BE][FE]` C-8 Báo cáo tệp | KAN-97 | Model `Report` mới (`reporterId`, `attachmentId`, `messageId`, `reason`, `status`), migration. Mutation `reportAttachment` cho thành viên phòng, mỗi người một lần mỗi tệp. Truy vấn cho admin trong `admin.module.ts`, danh sách trong `admin-view.tsx`. Nút "Report file" trong `chat-room.tsx`. Vì tệp được gửi ngay, đây là đường xử lý chính cho nội dung xấu lọt qua quét nhanh. Cần: C-6 | Test: báo cáo vào danh sách admin; người ngoài phòng không báo cáo được |
| `[FE]` C-5 UI gửi tệp và ảnh | KAN-94 | `chat-room.tsx`: giữ luồng chọn tệp, tải lên, gửi. Thêm thumbnail ảnh trong tin, tên và dung lượng cho tệp khác, lý do từ chối bằng tiếng Anh theo `code` và giữ lại nội dung đang gõ, thuộc tính `accept` theo danh sách loại của chat. Cần: C-1 | Test UI: ảnh gửi xong hiện thumbnail; tệp bị từ chối hiện lý do |
| `[QA]` C-9 Kiểm thử bảo mật tệp chat | KAN-98 | Các kịch bản còn áp dụng trong `CHAT_FILES_SECURITY`: quyền, khai báo sai loại, magic bytes, giới hạn, tải có quyền, quota. Thêm: tệp văn bản chứa secret, tệp đổi đuôi, thời gian quét | Tất cả xanh |

### 6.6 Giai đoạn 6: kiểm thử và phát hành

| Story | Jira | Giải pháp | Xong khi |
|---|---|---|---|
| `[QA]` S-105 E2E an toàn tiền | KAN-15 | Thêm vào `apps/web/scripts/e2e-role-flows.ts`: rút đơn khi đã được chọn, deposit sau khi đơn đổi trạng thái, release sau khi dev nộp lại. Rà bước approve token (W-8) | Xanh trên Hardhat local |
| `[QA]` S-901 E2E tối thiểu | KAN-54 | T-1 đến T-4 trong `NEXT_STEPS` mục 8, thêm một kịch bản tranh chấp cơ bản | Xanh trên Hardhat local |
| `[Ops]` S-113 Máy chạy demo | KAN-83 | Máy có Docker cho test runner, chạy Hardhat, worker và web. Kiểm link tải snapshot hoạt động trên máy này (G-11). Phần máy chủ riêng, luật egress và RPC có khóa chuyển sang S-118 | Runbook khởi động và khôi phục được thử một lần trên máy đó |
| `[Ops]` S-106 Runbook | KAN-16 | `docs/RUNBOOK.md`: egress, thứ tự deploy migration, danh sách cảnh báo | Runbook đủ ba mục |
| `[BE]` S-114 Advisory | KAN-84 | Gỡ `@thirdweb-dev/sdk`, chạy build và test đăng nhập sau khi gỡ. Rà advisory của `@thirdweb-dev/auth`, `@thirdweb-dev/wallets`, `ethers` 5 | Không còn advisory high hoặc critical trong gói production |
| `[Ops]` S-904 Checklist phát hành | KAN-57 | Cho bản demo trên Hardhat local: migration đã áp đủ (gồm các migration mới của S-404, C-1, C-8), biến môi trường, thứ tự khởi động Hardhat, deploy contract local, worker, web, cách khôi phục sau khi reset Hardhat, kịch bản demo. Không gồm deploy Base Sepolia | Checklist được chạy một lần từ đầu trên máy demo |
| `[QA]` S-905 Kiểm chứng trước phát hành | KAN-58 | Typecheck, lint, build, mọi bộ test với `TEST_DATABASE_URL` và Docker, test contract | Mọi bộ xanh, số liệu ghi vào `docs/` |
| `[Ops]` S-1002 Ghi giờ | KAN-26 | `docs/management/time-log.csv` | Có dòng cho mỗi tuần |

### 6.7 Đồ thị phụ thuộc

```
Giai đoạn 0 ─► mọi giai đoạn sau
S-101 ─► S-102 ─► S-105
S-103 ─► S-604, S-117 ─► S-105
S-404 ─► S-701 ─► S-702 ─► S-705
S-608 ─► S-601, S-116        S-404, S-701 ─► S-601
S-206 ─► S-603 ─► S-115
C-1 ─► C-5, C-6, C-7        C-6 ─► C-8        C-1, C-5 đến C-8 ─► C-9
mọi story ─► S-901, S-905 ─► S-904
```

### 6.8 Giai đoạn 7: mở rộng `[Enhance]`

Làm sau khi giai đoạn 0 đến 6 xong. Thứ tự đề xuất theo hướng bạn nêu: AI trước, phòng chat sau.

| Nhóm | Story | Jira | Ghi chú kỹ thuật |
|---|---|---|---|
| AI đánh giá bài nộp | S-801, S-802, S-803, S-804, S-805, S-806 | KAN-59 đến KAN-64 | Bảng `ai_reviews` khóa theo `(submissionId, deliveryHash)`. Worker tính diff từ patch đã kiểm checksum, chỉ chạy sau `PASSED`. Mỗi trích dẫn phải có thật trong diff. Hiển thị ở S-604 với nhãn "advisory" |
| AI sinh test tốt hơn | S-704, S-706 | KAN-47, KAN-49 | Bộ đánh giá 8 đến 10 repo mẫu, schema đầu ra, ghi token. S-703 (vòng tự sửa) đã cắt, mở lại sau khi có S-704 để đo |
| Phòng chat | S-302, S-303, S-304, S-306, S-307 | KAN-32, 33, 34, 40, 41 | S-302 dùng chung model `Report` của C-8. S-303 thêm bảng `user_blocks`, kiểm trong `openApplicationChat`. S-304 đếm phòng mới trong DB |
| Quét sâu tệp chat | C-2, C-3, C-4a, C-4 | KAN-90 đến KAN-93 | Chạy ở nền sau khi tệp đã gửi: ClamAV qua `clamd`, phân loại ảnh nhạy cảm, tái mã hóa ảnh. Bị gắn cờ thì ẩn tệp trong tin và báo hai bên cùng admin. Không chặn việc gửi |
| Triển khai testnet | S-118, S-111 | KAN-102, KAN-82 | Deploy contract lên Base Sepolia, RPC riêng cho worker, Supabase Storage, luật egress, DB riêng cho testnet |
| Tranh chấp | S-203a, S-203b, S-606 | KAN-29, KAN-50, KAN-51 | Quy tắc phí và điều kiện mở cần sửa contract, nên chỉ áp dụng cho bản deploy sau |
| Khác | S-205, S-405, S-502, S-902, S-1003 | KAN-52, 36, 24, 55, 27 | |
| Chưa có issue | Thay `@thirdweb-dev/auth` và `wallets` bằng `siwe` và `jose` | | Bộ v4 không còn được cập nhật dependency |

## 7. Kiểm xung đột giữa các tính năng và tài liệu

| # | Việc | Chạm vào | Kết luận |
|---|---|---|---|
| 1 | Tranh chấp giữ bật | ADR-0015, WORK_BREAKDOWN B-28, mục 3.3 và 3.6 ("không có nút tranh chấp") | Tài liệu này thay các mục đó. S-110 cắt. S-603 và S-604 giữ nút tranh chấp. E2E có kịch bản tranh chấp |
| 2 | Hạn duyệt tính từ lần nộp | ADR-0004, B-26, S-108, thiết kế `14_Workroom` ("Review closes" theo hạn giao) | Contract không đổi. UI theo contract. S-115 chỉ hiện hạn duyệt khi đã có bài nộp |
| 3 | Giao diện tiếng Anh | Chuỗi tiếng Việt trong WORK_BREAKDOWN mục 3 và trong `apps/worker/src/effects` | Dịch sang tiếng Anh trong S-102, S-607, S-603 |
| 4 | S-206 dùng lại `availableActions` | B-7 mô tả module `workflow.module.ts` mới | Không tạo module mới. S-603, S-604, S-605 đọc `availableActions` |
| 5 | Wizard cần bounty nháp | S-602 đã cắt; `createIssue` đang đặt `isDraft = false` | S-608 làm phần tối thiểu: cờ nháp và `publishIssue`. Không làm quản lý nháp của S-602. `applyToIssue` phải chặn bounty nháp |
| 6 | S-103 thêm tham số bắt buộc | Trang issue, hai bộ E2E | Sửa trong cùng PR, nếu không E2E hỏng |
| 7 | S-117 đổi chữ ký `releaseFunds` | ABI, `fold`, `release.module.ts`, E2E, "latest-hash release" trong tài liệu kiến trúc | Chốt làm. Tài liệu này thay mục "latest-hash release". Mọi nơi tạo calldata release và mọi test gọi `releaseFunds` phải đổi cùng PR. Contract trên Base Sepolia (nếu có bản cũ) không tương thích, S-118 deploy bản mới |
| 8 | S-102 đẩy sang `MISMATCHED` | `undoDeposit` khi reorg; S-101 | Tương thích: undo đã có nhánh `MISMATCHED`. Sau S-101 nhánh này chỉ chạy khi có tranh chấp thời điểm, vì `rejectApplication` đã đòi issue `OPEN` |
| 9 | S-202 đặt nháp cũ `SUPERSEDED` | Intent cũ của bản nháp đó vẫn có thể được ký và lên chain | `effects/work.ts` phải nhận bài theo `deliveryHash` bất kể status nháp. Có test riêng |
| 10 | S-301 cho rời phòng | Bảng quyền: phòng `COMPLETED` vẫn đọc được | Không đuổi theo status. Chỉ kiểm quyền lúc phát tin, nên người còn quyền đọc vẫn nhận dòng sự kiện cuối của S-309 |
| 11 | S-309 ghi tin `SYSTEM` | Số tin chưa đọc, AI guard, reorg, admin chỉ đọc, S-310 | Người kia thấy +1 chưa đọc, đúng ý. Không qua guard. Undo xóa tin. Worker ghi thẳng DB nên không vướng quyền ghi của phòng. S-310 tóm tắt cả dòng sự kiện |
| 12 | S-116 và S-310 | Ranh giới AI, giới hạn tần suất, `AILog` | Dùng `aiRateLimit`, `scanAndMask`, không lưu prompt thô, không lưu kết quả, không ảnh hưởng nút tiền |
| 13 | S-402 chặn ở bước chạy test | Bounty không có test chạy được bỏ qua cổng test | Patch có secret vẫn nộp được ở bounty loại này. Chấp nhận, ghi trong banner S-201 |
| 14 | S-403 xóa `__bloodyroar__` sau patch | G-12: patch vẫn sửa được config và `package.json` | Đóng được file lạ, không đóng hết G-12. S-604 ghi rõ giới hạn |
| 15 | S-104 whitelist env | `docker` cần `DOCKER_HOST`, `git` cần `PATH` | Giữ các biến đó. Test chạy cả hai lệnh |
| 16 | Tệp chat quét nhanh rồi gửi ngay | ADR-0016 và CHAT_FILES_SECURITY: staging và approved, fail-closed, ClamAV, NSFW, chỉ ảnh | Tài liệu này thay phần đó cho bản phát hành: quét đồng bộ bằng logic xác định, nhận ảnh và tệp văn bản, PDF. Hệ quả phải chấp nhận: không quét virus và không quét ảnh nhạy cảm trước khi gửi (R-8, R-9 của WORK_BREAKDOWN vẫn mở). Bù lại có C-8 báo cáo tệp và C-6 tải dạng attachment. Tệp chat cũ thuộc loại không còn được nhận vẫn tải được theo quyền hiện tại |
| 17 | Migration mới: `fileTree` (S-404), `REJECTED` (C-1), `Report` (C-8) | S-107 chỉ áp 3 migration hiện có; DB đang dùng là DB production | Mỗi migration áp bằng `db:migrate:prod` khi story merge, sau khi sao lưu. Không dùng `db:migrate` trên DB này |
| 18 | S-114 gỡ `@thirdweb-dev/sdk` | Có thể là peer dependency của `auth` và `wallets` | Build và test đăng nhập sau khi gỡ. Nếu vỡ thì giữ lại và chỉ rà advisory |
| 19 | S-601 lưu `localStorage` | R-5: đóng trình duyệt là mất | Sau S-608, bounty nháp đã nằm trên server từ cuối bước 1. `localStorage` chỉ giữ form bước 1 |
| 20 | S-605 trạng thái giao dịch | UI hiện dừng tải lại sau 2 phút (W-5) | Thành phần mới thay vòng tải lại đó ở cả ba chỗ: nạp tiền, nộp bài, release |
| 21 | Test cần DB (S-905, test của từng story) | DB trong `.env` là production | Chạy trên Postgres local qua `TEST_DATABASE_URL`. Các test đã có `assertTestDatabase` và tự bỏ qua khi thiếu biến này |
| 22 | Chạy Hardhat local với DB Supabase | Projection, intent, reservation của chain 31337 ghi vào DB production; reset Hardhat để lại dữ liệu mồ côi | Dùng Postgres local khi test với Hardhat. Nếu vẫn dùng Supabase, S-118 phải tạo DB riêng trước khi lên testnet |
| 23 | C-1 thu hẹp loại tệp của chat | `ALLOWED_FILE_TYPES` dùng chung cho mọi purpose | Thêm danh sách riêng cho chat, không sửa danh sách chung, để nộp bài (`DELIVERY`) và nguồn (`SOURCE`) vẫn nhận zip và patch |

## 8. Quyết định

Đã chốt ngày 15/11:
1. Hạn duyệt giữ `submittedAt + 7 ngày`. S-108 đóng.
2. Tranh chấp giữ bật. S-110 cắt.
3. Giao diện tiếng Anh toàn bộ.
4. Không lập lịch theo ngày và không chia người trong tài liệu này.
5. Test và demo trên Hardhat local. Deploy Base Sepolia để sau (S-118).
6. Làm S-117: `releaseFunds` nhận hash.
7. Tệp chat: quét nhanh rồi gửi ngay, nhận cả ảnh và tệp. Quét sâu ở nền là việc mở rộng.

Tôi tự xác định theo ý bạn:
1. Migration: áp 3 migration còn thiếu ngay sau khi PR của working tree được merge, có sao lưu trước. Các migration sau áp khi story tương ứng merge (S-107).
2. Giữ tệp chat: 90 ngày sau khi phòng đóng, làm ở giai đoạn 7.

Còn mở:
1. Tư vấn pháp lý về nội dung liên quan trẻ em (D-15). Với cách gửi ngay, ảnh không được quét nội dung trước khi tới người nhận. Nên giải quyết trước khi mở cho người ngoài nhóm.
2. Có chuyển việc test với Hardhat sang Postgres local hay không (mục 7 dòng 22). Tôi đề xuất có.
3. Tài khoản `Kien Nguyen` nào trên Jira là tài khoản đang dùng.

## 9. Những gì tôi chưa kiểm

- Không chạy ứng dụng, không chạy E2E, không chạy test cần database, không chạy test contract.
- Không đọc hết `issue-detail-view.tsx`, `create-issue-form.tsx`, `chat-room.tsx`, `connect-modal.tsx`. U-4 và W-4 là suy luận từ code.
- Không đọc các module settlement, dispute, ruling, bước approve token, `effects/work.ts` ngoài dòng ghi `reviewDeadline`, và `jobs/source-snapshot.ts`. Giải pháp của S-202, S-309, S-404 cần người làm đối chiếu lại với các file này trước khi viết.
- Không mở được trang giá chính thức của thirdweb.
- Với DB Supabase, tôi chỉ chạy `prisma migrate status` (chỉ đọc). Không kiểm dữ liệu, Railway, hay contract trên Base Sepolia.
- Chưa đo thời gian quét nhanh. Mục tiêu dưới 1 giây cho tệp 10 MB là ước lượng, C-1 phải đo.
- Bảng xung đột ở mục 7 dựa trên code và tài liệu tôi đã đọc. Nó không thay cho việc chạy E2E sau mỗi giai đoạn.
