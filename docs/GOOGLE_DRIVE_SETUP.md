# Hướng dẫn Cấu hình Xác thực Google Drive (Môi trường Thật)

Tài liệu này hướng dẫn cách lấy và cấu hình thông tin xác thực Google Service Account để kích hoạt chế độ tải lên Google Drive thực tế thay vì chế độ Mock.

---

## 1. Tạo Google Service Account & Tải `credentials.json`

1. Truy cập vào **[Google Cloud Console](https://console.cloud.google.com/)**.
2. Tạo một dự án mới hoặc chọn dự án hiện có.
3. Vào phần **APIs & Services** > **Library**, tìm kiếm **Google Drive API** và nhấp **Enable**.
4. Vào phần **IAM & Admin** > **Service Accounts**.
5. Nhấp **Create Service Account**:
   - Nhập tên và mô tả gợi nhớ.
   - Nhấp **Create and Continue**.
   - Bỏ qua bước gán Role (nhấp **Continue** rồi **Done**).
6. Tại danh sách Service Accounts, nhấp vào tài khoản vừa tạo.
7. Chuyển sang tab **Keys** > chọn **Add Key** > **Create new key**.
8. Chọn định dạng **JSON** và nhấp **Create**.
9. File khóa JSON sẽ được tải xuống máy tính của bạn. Hãy đổi tên file này thành `credentials.json`.

---

## 2. Phân quyền truy cập Google Drive

Vì Service Account hoạt động như một thực thể độc lập (không có giao diện Drive riêng), bạn cần chia sẻ thư mục trên tài khoản Drive cá nhân của bạn với Service Account:

1. Mở file `credentials.json` vừa tải xuống, tìm trường `client_email` (ví dụ: `your-service-account@project-id.iam.gserviceaccount.com`).
2. Mở thư mục bạn muốn lưu sách trên Google Drive cá nhân của bạn.
3. Nhấp vào nút **Share** (Chia sẻ) thư mục đó.
4. Dán địa chỉ email `client_email` của Service Account vào ô mời.
5. Gán vai trò **Editor** (Người chỉnh sửa) và tắt tùy chọn gửi thông báo email (Notify people).
6. Nhấp **Share** (Chia sẻ).

---

## 3. Cấu hình Biến môi trường (Environment Variables)

Hệ thống hỗ trợ 3 cách để nạp cấu hình khóa này:

### Cách 1: Đặt file trực tiếp (Khuyên dùng khi chạy local)
Đặt trực tiếp file `credentials.json` vừa tải vào thư mục gốc của dự án:
```text
gg-drive/
├── credentials.json  <-- Đặt ở đây
├── src/
├── package.json
```

### Cách 2: Sử dụng đường dẫn file tùy chỉnh qua ENV
Thiết lập đường dẫn file thông qua biến môi trường `GOOGLE_CREDENTIALS_PATH`:
```bash
GOOGLE_CREDENTIALS_PATH=./config/my-google-key.json
```

### Cách 3: Nạp chuỗi JSON trực tiếp qua ENV (Khuyên dùng khi Deploy Docker/Cloud)
Thiết lập toàn bộ nội dung JSON (hoặc mã hóa Base64) trực tiếp vào biến `GOOGLE_CREDENTIALS_JSON`:
```bash
# Dạng chuỗi JSON phẳng
GOOGLE_CREDENTIALS_JSON='{"type": "service_account", "project_id": "...", ...}'

# Hoặc dạng chuỗi đã mã hóa Base64 (Tránh lỗi xuống dòng hoặc ký tự đặc biệt)
GOOGLE_CREDENTIALS_JSON=eyJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsICJwcm9qZWN0X2lkIjogIi4uLiJ9
```

---

## 4. Kiểm tra kết nối (Smoke Check)

Để kiểm tra xem cấu hình thực tế đã thành công chưa:

1. Khởi động máy chủ phát triển:
   ```bash
   pnpm run start:dev
   ```
2. Quan sát log console khi khởi động:
   - **Thành công**: Hiển thị log `[GoogleDriveService] Google Drive API client initialized successfully.`
   - **Thất bại/Mock**: Hiển thị log cảnh báo `[GoogleDriveService] Google credentials not found (...) Starting Google Drive in Mock Mode.`
