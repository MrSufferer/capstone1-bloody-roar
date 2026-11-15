# Thiết kế bảo mật phòng chat và gửi ảnh/tệp

Ngày: 2026-11-13. Quyết định liên quan: ADR-0016 trong `ADR_2026-11-12.md`.
Đọc cùng: `WORK_BREAKDOWN_2026-11-12.md` (mục 1.3, S-305, C-1 đến C-9), `ADR_2026-11-12.md` (ADR-0007, ADR-0010), `NEXT_STEPS_CLIENT_DEV_2026-11-12.md` (M-1 đến M-10).

Các con số về độ trễ là **ước lượng, cần đo** trong bước spike (C-3, C-4a). Không có số đo nào trong tài liệu này được lấy từ môi trường thật.

---

## 0. Yêu cầu và nguyên tắc

Yêu cầu của bạn:
1. Cho phép gửi ảnh và tệp trong phòng chat.
2. Quét để chặn mã độc và nội dung đồi trụy, bằng code hoặc thư viện.
3. Không dùng OCR, vì tốn token và chậm.
4. Tốc độ phải đủ tốt để không làm người dùng khó chịu.

Nguyên tắc thiết kế:
- **Người nhận không bao giờ thấy file chưa qua quét.** Chỉ tin nhắn được tạo sau khi file có kết quả `ALLOWED` mới gửi tới người nhận.
- **Fail-closed.** Nếu bộ quét không chạy được (ClamAV tắt, model lỗi, hàng đợi nghẽn), file ở trạng thái `PENDING_SCAN`, không bao giờ thành `ALLOWED` tự động.
- **Không gọi LLM hay OCR cho việc quét.** Chỉ dùng thư viện xác định (deterministic) và model phân loại nhỏ chạy trên CPU. Chi phí token bằng 0.
- **Không tin client.** Kiểm tra phía client chỉ để nhanh. Mọi kiểm tra thật nằm trên server và worker.
- **Lưu ít nhất có thể.** File bị từ chối bị xóa ngay. File được duyệt được tái mã hóa, bỏ metadata.

---

## 1. Phạm vi MVP

### 1.1 Loại file được phép

| Loại | MVP | Ghi chú |
|---|---|---|
| JPEG, PNG, WebP (ảnh tĩnh) | Có | Đường chính. Tái mã hóa bằng sharp trước khi lưu |
| GIF | Không | Ảnh động, dễ che giấu nội dung. Chuyển sau 15/12 nếu cần |
| PDF, DOC, XLS, TXT | Không | Cần quét sâu hơn (JavaScript trong PDF, macro). Sau 15/12 |
| ZIP, RAR, 7z, tar | **Không bao giờ** | Zip bomb, lồng file. Không có trường hợp dùng hợp lý trong chat |
| SVG | **Không bao giờ** | Có thể chứa script (XSS) |
| HTML, JS, EXE, SH, BAT, JAR, APK, Office macro | **Không bao giờ** | Mã thực thi |
| Video, âm thanh | Không | Sau 15/12 |

### 1.2 Giới hạn

| Mục | Giá trị | Lý do |
|---|---|---|
| Kích thước file | 10 MB | Đủ cho ảnh điện thoại chụp, không đủ để giấu nội dung lớn |
| Cạnh dài nhất | 6000 px | Chặn ảnh giải nén quá lớn |
| Tổng số điểm ảnh | 25 MP | Chặn "decompression bomb" của ảnh |
| File mỗi tin | 4 | Giảm tải và spam |
| File mỗi người mỗi giờ | 30 | Chống spam, đếm bằng DB (không bộ nhớ) |
| File mỗi phòng mỗi ngày | 50 | Chống lạm dụng một phòng |
| Tin nhắn mỗi 10 giây | 10 (đã có) | Giữ nguyên |

---

## 2. Luồng gửi file (sequence)

```
Client                    Web (Next.js)              Supabase Storage        Worker (cùng máy với ClamAV)
  │                            │                            │                          │
  │ 1. chọn file               │                            │                          │
  │ kiểm loại + kích thước     │                            │                          │
  │ (chỉ để nhanh, không tin)  │                            │                          │
  │ hiện thumbnail từ blob     │                            │                          │
  │ chip "Đang kiểm tra"       │                            │                          │
  │ 2. POST /api/uploads ─────►│ kiểm quyền phòng, quota    │                          │
  │    purpose=CHAT            │ tạo attachment PENDING     │                          │
  │ ◄───── uploadUrl (staging/)│ presigned PUT, TTL 300 s   │                          │
  │ 3. PUT trực tiếp ──────────────────────────────────────►│ staging/<key ngẫu nhiên> │
  │ 4. POST complete ─────────►│ kiểm size thật, đặt        │                          │
  │                            │ status=SCANNING, xếp hàng  │                          │
  │ ◄───── 202 SCANNING        │                            │                          │
  │                            │                            │  5. worker lấy job ─────►│
  │                            │                            │     đọc staging/         │
  │                            │                            │     sha256 → dedupe      │
  │                            │                            │     magic bytes          │
  │                            │                            │     metadata + limit     │
  │                            │                            │     ClamAV ║ NSFW (song song)
  │                            │                            │     sharp: decode, re-encode, bỏ EXIF
  │                            │                            │  6. ALLOWED:             │
  │                            │                            │     ghi approved/<key>   │
  │                            │                            │     xóa staging/         │
  │                            │                            │     REJECTED: xóa staging│
  │ ◄── socket attachment:scanned ◄────────────────────────────────────────────────────│
  │ 7. chip "Sẵn sàng" → gửi tin (sendMessage với fileUrl)                             │
  │    server kiểm: status=ALLOWED, thuộc người gửi, đúng phòng, chưa gắn tin nào      │
  │ 8. message:new tới người nhận (chỉ lúc này họ mới thấy file)                       │
```

### 2.1 Ngân sách độ trễ (ước lượng)

| Bước | Ước lượng cho ảnh 3–5 MB | Ghi chú |
|---|---|---|
| Kiểm tra phía client và hiện thumbnail | < 50 ms | Tức thì, người dùng thấy ngay |
| Tạo presigned URL | 50–100 ms | Một lần gọi API |
| Upload trực tiếp lên Supabase | 0,3–1,5 s | Phụ thuộc mạng. Không đi qua web server |
| Complete và xếp hàng | 50–100 ms | |
| Worker lấy job và đọc staging | 50–150 ms | |
| Dedupe theo sha256 (file đã quét) | < 10 ms | Ảnh gửi lại, forward, gửi cùng ảnh |
| ClamAV INSTREAM (song song) | 50–200 ms | Daemon trên cùng máy, qua socket |
| NSFW trên bản 224 px (song song) | 30–100 ms | CPU, chưa đo |
| sharp decode và re-encode | 30–120 ms | libvips, phụ thuộc kích thước |
| Ghi approved, xóa staging, thông báo socket | 50–100 ms | |
| **Tổng sau khi upload xong** | **~0,3–0,7 s** | Mục tiêu p95 ≤ 1,5 s. Đo trong C-4a |
| **Tổng từ lúc chọn file đến lúc gửi được** | **~1–2,5 s** | Mục tiêu p95 ≤ 3 s |

Các cách giữ tốc độ:
- **Upload trực tiếp** lên Supabase bằng presigned URL. Web server không chuyển byte.
- **Hiện thumbnail từ blob ngay** trên client. Người dùng vẫn có thể gõ tin trong lúc chờ.
- **Quét song song** ClamAV và NSFW. Hai bước này độc lập.
- **Dedupe theo sha256.** File đã có kết quả thì trả về ngay.
- **Phân loại trên ảnh 224 px.** Không cần decode ảnh gốc cho bước NSFW.
- **Worker đặt cùng máy với ClamAV** (ADR-0010). Không có độ trễ mạng khi quét.
- **Gửi tin ngay khi có `ALLOWED`.** Không chờ thêm vòng polling. Dùng socket.

---

## 3. Các lớp kiểm soát

Mỗi lớp chặn một loại tấn công. Một file phải qua tất cả các lớp mới được gửi.

| # | Lớp | Kiểm tra | Chặn gì | Thư viện / cách làm |
|---|---|---|---|---|
| L1 | Quyền | Người gửi là thành viên phòng, phòng đang ghi được, quota chưa hết | Người ngoài gửi file, spam | Logic có sẵn (`chat-access.ts`), quota đếm bằng DB |
| L2 | Khai báo | Loại và kích thước khai báo, tên file được làm sạch | File quá lớn, tên độc | `scanAndMask` có sẵn; kiểm `MAX_FILE_SIZE` của chat |
| L3 | Chữ ký file | Magic bytes khớp loại cho phép | Đổi đuôi (zip thành png), file lạ | `file-type` (npm), đọc vài byte đầu |
| L4 | Giới hạn | Kích thước thật, cạnh, số điểm ảnh | Decompression bomb, ảnh quá lớn | `sharp` đọc metadata, `limitInputPixels` |
| L5 | Mã độc | Quét toàn bộ byte | Virus, file EICAR | ClamAV qua clamd INSTREAM. Cập nhật DB mỗi ngày bằng freshclam |
| L6 | Cấu trúc | Decode thành công, tái mã hóa lại | Polyglot (file vừa là ảnh vừa là script), dữ liệu thừa sau ảnh | `sharp`: decode rồi encode lại từ đầu |
| L7 | Metadata | Bỏ EXIF, GPS, thông tin máy | Lộ vị trí và thiết bị của người gửi | `sharp` không giữ metadata nếu không gọi `withMetadata()` |
| L8 | Nội dung | Phân loại nhạy cảm | Ảnh đồi trụy | Model NSFW (xem mục 4) chạy trên bản 224 px |
| L9 | Lưu trữ | Ngẫu nhiên hóa key, tách staging và approved | Đoán URL, lộ file bị từ chối | Key UUID, bucket riêng tư |
| L10 | Tải | Kiểm quyền mỗi lần, URL ký hết hạn 60 giây, header an toàn | Người ngoài tải, cache sai, MIME sniffing | Route `/api/uploads` (đã có) sửa lại: `X-Content-Type-Options: nosniff`, `Content-Type` cố định theo verdict, `Cache-Control: private, no-store` |

### 3.1 Vì sao tái mã hóa (L6) và bỏ metadata (L7) quan trọng

- Một file JPEG có thể chứa dữ liệu thừa sau phần ảnh hợp lệ. Có thể đó là một script hoặc một file khác. Các bộ quét chỉ kiểm tra phần đầu sẽ bỏ sót. Decode rồi encode lại tạo ra file mới, chỉ giữ pixel.
- EXIF thường chứa GPS. Nếu người nhận tải về, họ biết nơi chụp. Bỏ metadata là bảo vệ quyền riêng tư của người gửi.

---

## 4. Nội dung đồi trụy (L8)

### 4.1 Cách làm

- **Thư viện phân loại** chạy trên CPU. Hai lựa chọn, chọn sau spike C-4a:
  - **nsfwjs** (TensorFlow.js, mô hình MobileNet): dễ tích hợp trong Node, trả về 5 lớp (Drawing, Hentai, Neutral, Porn, Sexy).
  - **NudeNet** (mô hình ONNX, chạy bằng onnxruntime-node): phát hiện vùng cơ thể cụ thể. Thường chính xác hơn với ảnh khỏa thân.
- Chạy trên bản 224 px để giữ tốc độ.
- Không dùng LLM vision hay OCR. Lý do: tốn token, chậm, gửi ảnh riêng tư tới bên thứ ba.

### 4.2 Ngưỡng (đề xuất ban đầu, phải kiểm chứng)

| Điểm "nội dung người lớn" | Hành động | Ghi chú |
|---|---|---|
| ≥ 0,90 | `REJECTED` với mã `NSFW_EXPLICIT`. Xóa file ngay | Người gửi nhận thông báo lý do |
| 0,60 – 0,90 | `ALLOWED`, ghi vào log `REVIEW_FLAG` để admin xem sau | MVP chưa có hàng đợi admin đầy đủ. Ghi log, xem bằng truy vấn DB |
| < 0,60 | `ALLOWED` | |

Ngưỡng này chỉ là điểm xuất phát. Chọn lại sau khi đo trên bộ mẫu.

### 4.3 Dữ liệu để kiểm chứng

- **Không thu thập ảnh đồi trụy để thử nghiệm.** Việc lưu và xử lý loại ảnh này có rủi ro pháp lý và đạo đức.
- Kiểm chứng ngưỡng bằng bộ dữ liệu công khai đã được cấp phép, hoặc dùng số liệu benchmark của thư viện. Ghi nguồn.
- Kiểm chứng pipeline (không phải chất lượng model) bằng ảnh bình thường và mock model trả về điểm cố định. Test ở mục 7.

### 4.4 Trẻ em: giới hạn kỹ thuật

Không có bộ phân loại nào đáng tin cậy để phát hiện nội dung tình dục liên quan đến trẻ em. Đây là giới hạn đã biết của mọi bộ lọc ảnh. Vì vậy:
- Chính sách không khoan nhượng, ghi trong điều khoản sử dụng.
- Có nút **"Báo cáo tệp"** trong phòng chat (C-8). Báo cáo ghi lại file đã approved (đã bỏ metadata), người báo cáo, người gửi và thời điểm.
- Admin có thể gỡ file ngay (đổi trạng thái `REMOVED`, không tải được nữa). Giữ bản ghi làm bằng chứng.
- **Cần tư vấn pháp lý** về nghĩa vụ báo cáo và lưu trữ bằng chứng tại Việt Nam trước khi mở tính năng này cho người ngoài nhóm. Tài liệu này không khẳng định nghĩa vụ cụ thể nào.

### 4.5 Liên lạc ngoài nền tảng qua ảnh

Ảnh có thể chứa số điện thoại, mã QR, tên Telegram. Trong MVP:
- Không quét QR. Ghi là rủi ro M-2 (chấp nhận).
- Nếu cần sau này: giải mã QR bằng **jsQR** (thư viện JavaScript thuần, giải mã mã vạch, không phải OCR). Thêm như một lớp tùy chọn, ước lượng 0,5 pd.
- Số điện thoại viết trên ảnh không được phát hiện. Đây là giới hạn của việc không dùng OCR. Chấp nhận trong MVP.

---

## 5. Quyền tải và hiển thị (L10)

Khi người dùng mở ảnh trong phòng chat:
1. Server kiểm tra người yêu cầu là thành viên của phòng chứa tin nhắn.
2. Kiểm tra attachment có `status = ALLOWED`, không bị `REMOVED`.
3. Ký một URL mới, TTL 60 giây, trỏ vào `approved/`.
4. Trả về với header: `Content-Type` cố định theo verdict (không lấy từ tên file), `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` chỉ với ảnh, `Cache-Control: private, no-store`.

Không bao giờ cho URL vĩnh viễn. Không cho tải theo key mà không qua bước 1.

Hiển thị ảnh trong UI:
- Thumbnail tải lười (lazy).
- Không render SVG. Không render HTML. Ảnh đã tái mã hóa nên chỉ là bitmap.
- Tên file hiển thị đã qua `scanAndMask`.

---

## 6. Quota, giới hạn và chống lạm dụng

| Kiểm soát | Cách làm | Ghi chú |
|---|---|---|
| Upload mỗi người mỗi giờ | Đếm bảng `attachments` theo `uploaderId`, `createdAt` | Không dùng bộ nhớ process, vì nhiều instance sẽ sai |
| Upload mỗi phòng mỗi ngày | Đếm theo `conversationId` | |
| Tin nhắn mỗi 10 giây | Giữ nguyên (đang trong bộ nhớ). Ghi rõ là giới hạn một instance (ADR-0010) | Chuyển sang DB khi scale |
| Lỗi quét lặp lại | Sau 3 lần `ERROR`, file bị đưa về `FAILED` và không thử lại tự động | Tránh vòng lặp tốn tài nguyên |
| Spam file không gửi | File `SCANNING` quá 5 phút bị dọn | |
| Người bị cấm (`isBanned`) | Không upload, không gửi tin | Kiểm tra ở L1 |

---

## 7. Kiểm thử bảo mật (bắt buộc trước khi mở)

Mỗi test đỏ trước khi viết code.

| # | Tình huống | Kết quả mong đợi | Cách kiểm |
|---|---|---|---|
| T-S1 | Chuỗi EICAR trong file `.png` | `REJECTED` với `MALWARE` | ClamAV thật trên máy worker |
| T-S2 | File `.zip` đổi tên thành `.png` | `REJECTED` với `TYPE_NOT_ALLOWED` | `file-type` |
| T-S3 | SVG có `<script>` | `REJECTED` với `TYPE_NOT_ALLOWED` | `file-type` |
| T-S4 | JPEG hợp lệ có script nối sau dữ liệu ảnh | Bản approved không chứa script | So sánh byte sau tái mã hóa |
| T-S5 | Ảnh có GPS trong EXIF | Bản approved không có EXIF | Đọc metadata bản approved |
| T-S6 | Ảnh 12 MB | `REJECTED` với `SIZE_LIMIT` | Khi `complete`, kiểm size thật |
| T-S7 | Ảnh 50000 × 50000 px | `REJECTED` với `PIXEL_LIMIT`, không decode | `limitInputPixels` |
| T-S8 | Ảnh bình thường | `ALLOWED`, tái mã hóa, dedupe ở lần gửi lại | Test tích hợp |
| T-S9 | Ảnh đã được duyệt, gửi lại | Lần hai dùng kết quả cũ, không gọi ClamAV | Đếm số lần gọi |
| T-S10 | Người ngoài phòng gọi URL tải | 403 | Test tích hợp |
| T-S11 | URL ký đã hết 60 giây | 403 | Test tích hợp |
| T-S12 | Gửi tin khi attachment còn `SCANNING` | Lỗi `ATTACHMENT_NOT_READY` | Test tích hợp |
| T-S13 | Gửi tin với attachment đã gắn tin khác | Lỗi `INVALID_ATTACHMENT` (đã có) | Test tích hợp |
| T-S14 | ClamAV tắt | Trạng thái `PENDING_SCAN`, không `ALLOWED` | Dừng clamd trong test |
| T-S15 | Model NSFW trả điểm 0,95 (mock) | `REJECTED` với `NSFW_EXPLICIT` | Mock model |
| T-S16 | Model NSFW trả điểm 0,7 (mock) | `ALLOWED`, có log `REVIEW_FLAG` | Mock model |
| T-S17 | Hai tin gửi cùng lúc với cùng `clientMessageId` | Chỉ một tin (đã có) | Test đồng thời |
| T-S18 | Quota vượt ngưỡng | `RATE_LIMITED` | Test tích hợp |
| T-S19 | Người bị cấm gửi file | Bị từ chối | Test tích hợp |
| T-S20 | Báo cáo file | Bản ghi `reports` với bản approved, admin thấy trong truy vấn | Test tích hợp |

Không dùng ảnh đồi trụy để test. Với T-S15 và T-S16, mock model.

---

## 8. Triển khai và vận hành

- **ClamAV** cài trên máy worker (ADR-0010). Chạy `clamd` và `freshclam` như dịch vụ. Cập nhật DB mỗi ngày.
- **Giám sát:** số file `PENDING_SCAN` và `SCANNING` quá lâu, độ trễ quét p95, số lần `ERROR`, trạng thái clamd. Cảnh báo qua `ALERT_WEBHOOK_URL`.
- **Fail-closed:** khi clamd không trả lời, worker không đánh dấu `ALLOWED`. File chờ, người gửi thấy "đang chờ dịch vụ quét". Không tự động duyệt.
- **Lưu trữ:** file `REJECTED` xóa ngay sau khi có kết quả. File `ALLOWED` giữ theo quyết định D-13 (đề xuất 90 ngày sau khi phòng đóng). Bản ghi kết quả quét (sha256, verdict, mã lý do, phiên bản model, thời gian) giữ không thời hạn, không chứa nội dung.
- **Log:** không ghi nội dung file, chỉ ghi sha256 và mã kết quả.

---

## 9. Phạm vi và công việc

| Mã | Việc | Pd | Người | Sprint | Phụ thuộc |
|---|---|---|---|---|---|
| C-1 | Staging và approved, trạng thái `PENDING_SCAN`, `SCANNING`, `ALLOWED`, `REJECTED`, `REMOVED`. Presigned PUT vào staging | 2 | Hiếu | S9 | ADR-0007 (S-111) |
| C-2 | Worker quét: đọc staging, dedupe sha256, magic bytes, giới hạn, sharp tái mã hóa, ghi approved, xóa staging, hàng đợi trong DB | 2 | Khôi | S9 | C-1 |
| C-3 | Tích hợp ClamAV (clamd INSTREAM) và test EICAR | 1 | Khôi | S8 | ADR-0010 (S-113) |
| C-4a | Spike NSFW: so sánh nsfwjs và NudeNet trên bộ mẫu công khai, đo độ trễ trên CPU máy worker | 1 | Khôi | S8 | — |
| C-4 | Tích hợp model đã chọn, ngưỡng, log `REVIEW_FLAG` | 0,5 | Khôi | S9 | C-4a |
| C-5 | UI: nút đính kèm, thumbnail từ blob, chip trạng thái (đang kiểm tra, sẵn sàng, bị từ chối kèm lý do), gửi khi `ALLOWED` | 1,5 | Trâm | S9 | C-1, C-2 |
| C-6 | Tải có quyền: URL ký 60 giây, header an toàn, kiểm membership | 0,5 | Hiếu | S9 | C-2 |
| C-7 | Quota bằng DB: người, phòng, dọn file `SCANNING` quá hạn | 0,5 | Hiếu | S9 | C-1 |
| C-8 | Nút "Báo cáo tệp": bản ghi `reports`, truy vấn admin | 0,5 | Hiếu | S9 | C-6 |
| C-9 | Bộ kiểm thử bảo mật T-S1 đến T-S20 | 1 | Hân | S9 | C-1 đến C-8 |
| | **Tổng** | **10,5** | | | |

Ngoài MVP: quét QR (jsQR), GIF, PDF và tài liệu, video, hàng đợi admin đầy đủ, kiểm duyệt ảnh bằng nhiều lớp.

---

## 10. Tác động lên lịch

- Chat file thêm **10,5 pd**. Trước đó, S-305 (quét tệp chat) là 3 pd và dời sau 15/12. Nay là MVP, với đầy đủ C-1 đến C-9.
- Để giữ trong sức chứa, cắt thêm: S-703 (vòng tự sửa AI, 3 pd), S-204 (nhắc hạn, 1,5 pd), S-112 (health đủ trường, 1 pd). Rút S-901 từ 3 xuống 1,5 pd (1,5 pd) và S-201 xuống 1 pd (0,5 pd). Tổng cắt và rút 7,5 pd.
- MVP mới: 59 + 10,5 − 7,5 = **62 pd**.
- Sức chứa theo ngày kết thúc (tính từ 13/11):
  - Kết thúc **15/12**: 57,5 pd. Thiếu **4,5 pd** nếu giữ gửi ảnh. Không đủ.
  - Kết thúc **18/12**: 65 pd. Dự phòng **3 pd**.

Khuyến nghị: kết thúc **18/12/2026** (thứ Sáu). Đây là thay đổi lịch. Cần bạn quyết định.

---

## 11. Các quyết định cần bạn chốt

1. **Ngày phát hành:** 15/12 (phải cắt thêm 2,5 pd) hay 18/12 (đề xuất).
2. **Báo cáo tệp trong MVP (C-8):** giữ. Không có báo cáo, người dùng không có cách xử lý nội dung xấu.
3. **Ngưỡng NSFW:** 0,90 để từ chối, đúng như đề xuất. Chốt sau C-4a.
4. **Lưu file được duyệt:** 90 ngày sau khi phòng đóng (D-13), hay theo quy định khác.
5. **Tư vấn pháp lý** về nghĩa vụ báo cáo nội dung liên quan trẻ em tại Việt Nam, trước khi mở tính năng cho người ngoài nhóm.
