# Đặc tả Kỹ thuật: Dịch vụ Tải và Lưu trữ Sách (Book Downloader Service)

## 1. Tổng quan dự án (Project Overview)

Dự án là một RESTful API Service được xây dựng bằng Node.js. Chức năng cốt lõi là nhận một hoặc nhiều đường dẫn (URL) của trang web đọc sách, trích xuất hình ảnh sách, tải về máy chủ, nén thành file ZIP và tự động tải lên Google Drive (hỗ trợ chỉ định thư mục lưu trữ cụ thể). Toàn bộ lịch sử, cấu trúc thư mục và đường dẫn lưu trữ được quản lý thông qua cơ sở dữ liệu SQLite.

## 2. Ngôn ngữ & Thư viện (Tech Stack)

- **Môi trường:** Node.js
- **Framework Web:** Express.js
- **Cơ sở dữ liệu:** SQLite3
- **HTTP Client:** Axios (dùng để fetch HTML và tải file stream)
- **Nén file:** Archiver
- **Cloud Storage:** Google APIs (Google Drive API v3)

## 3. Cấu trúc Cơ sở dữ liệu (Database Schema)

Sử dụng SQLite với 4 bảng chính có quan hệ mật thiết với nhau:

### 3.1 Bảng `book` (Thông tin sách)

- `id` (INTEGER, PK, AUTOINCREMENT)
- `title` (TEXT) - Trích xuất tự động từ phần cuối của URL.
- `description` (TEXT)
- `unsign_title` (TEXT)
- `url` (TEXT) - Đường dẫn nguồn của sách.
- `total_pages` (INTEGER) - Tổng số lượng ảnh thu thập được.
- `created_at`, `updated_at` (DATETIME)
- `deleted` (BOOLEAN) - Mặc định: 0.

### 3.2 Bảng `book_page` (Chi tiết từng trang sách)

- `id` (INTEGER, PK, AUTOINCREMENT)
- `book_id` (INTEGER, FK -> book.id)
- `page_number` (INTEGER)
- `image_url` (TEXT) - Đường dẫn ảnh gốc trên CDN.
- `download_url` (TEXT) - Đường dẫn lưu file cục bộ (tạm thời trên server).
- `created_at`, `updated_at` (DATETIME)
- `deleted` (BOOLEAN)

### 3.3 Bảng `gg_folder` (Quản lý thư mục Google Drive)

- `id` (INTEGER, PK, AUTOINCREMENT)
- `folder_id` (TEXT, UNIQUE) - ID gốc của thư mục trên Google Drive.
- `folder_name` (TEXT) - Tên gợi nhớ (VD: `Folder_1a2b3c`).
- `created_at`, `updated_at` (DATETIME)
- `deleted` (BOOLEAN)

### 3.4 Bảng `gg_drive` (Lưu trữ liên kết file ZIP)

- `id` (INTEGER, PK, AUTOINCREMENT)
- `book_id` (INTEGER, FK -> book.id)
- `gg_folder_id` (INTEGER, FK -> gg_folder.id) - Khóa ngoại liên kết với thư mục chứa file.
- `zip_file_url` (TEXT) - Web View Link để xem/tải file từ Google Drive.
- `created_at`, `updated_at` (DATETIME)
- `deleted` (BOOLEAN)

## 4. Quy trình hoạt động (Business Logic)

Hệ thống xử lý hàng loạt (Bulk Processing) tuần tự qua các bước sau đối với từng URL nhận được:

1. **Trích xuất tiêu đề (Extract Title):** Phân tích URL để lấy `book_title`.
2. **Kiểm tra trùng lặp (Duplicate Check):** Kiểm tra `title` trong DB. Bỏ qua và báo lỗi nếu sách đã tồn tại.
3. **Định danh Thư mục (Folder Resolution):** Kiểm tra `googleFolderId` gửi từ client. Nếu có, đối chiếu và lưu vào bảng `gg_folder` để lấy ID quản lý nội bộ.
4. **Cào dữ liệu (Scrape):** Fetch HTML và dùng Regex để tìm tất cả các link ảnh khớp định dạng yêu cầu (`https://cdn3.olm.vn*`).
5. **Khởi tạo dữ liệu (Init DB):** Lưu thông tin vào bảng `book` để sinh `book_id`.
6. **Cách ly thư mục (Isolation):** Tạo thư mục cục bộ độc lập `/downloads/book_{book_id}`.
7. **Tải ảnh (Download):** Tải toàn bộ ảnh vào thư mục cách ly và lưu log vào `book_page`.
8. **Nén file (Zip):** Nén thư mục thành `book_{book_id}.zip`.
9. **Tải lên Cloud (Upload):** Đẩy file ZIP lên Google Drive (vào đúng `googleFolderId` nếu được chỉ định) và lưu link vào `gg_drive`.
10. **Dọn dẹp (Cleanup):** Xóa toàn bộ thư mục ảnh và file ZIP cục bộ để tối ưu dung lượng máy chủ.

## 5. Đặc tả API (API Specification)

### 5.1 Endpoint: Tải và xử lý sách

- **URL:** `/api/books/download`
- **Method:** `POST`
- **Content-Type:** `application/json`

#### Request Payload

Hỗ trợ truyền một URL hoặc một mảng URLs, kèm theo ID thư mục đích tùy chọn.

```json
{
  "googleFolderId": "1a2b3c4d5e6f7g8h9i0j_ABCXYZ",
  "targetUrls": [
    "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-tieng-viet-5-tap-hai.4537689926",
    "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456"
  ]
}
```

_(Ghi chú: Có thể bỏ qua `googleFolderId` nếu muốn lưu ở Root. Có thể dùng `targetUrl` (chuỗi) thay cho `targetUrls` (mảng) nếu chỉ tải 1 sách)._

#### Response Payload

Trả về chi tiết trạng thái của từng URL mà không làm gián đoạn tiến trình chung.

```json
{
  "success": true,
  "message": "Đã xử lý xong. Thành công: 1/2",
  "results": {
    "success": [
      {
        "url": "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-toan-5-tap-mot.123456",
        "status": "Thành công",
        "bookId": 2,
        "bookTitle": "shs-toan-5-tap-mot",
        "totalPages": 120,
        "googleFolderId": "1a2b3c4d5e6f7g8h9i0j_ABCXYZ",
        "driveLink": "https://drive.google.com/file/d/.../view"
      }
    ],
    "failed": [
      {
        "url": "https://taphuan.nxbgd.vn/tap-huan/doc-sach/shs-tieng-viet-5-tap-hai.4537689926",
        "status": "Thất bại",
        "error": "Sách với title \"shs-tieng-viet-5-tap-hai\" đã tồn tại trong hệ thống (Trùng lặp)."
      }
    ]
  }
}
```

## 6. Biến môi trường & Phân quyền (Environment & Auth)

- **Xác thực Google API:** Yêu cầu file `credentials.json` (Google Service Account Key) đặt tại thư mục gốc.
- **Quyền truy cập Drive:** Tài khoản Service Account cần được cấp quyền (Share/Editor) vào thư mục đích trên Google Drive nếu người dùng truyền lên `googleFolderId`.
- **Cổng dịch vụ:** Cấu hình qua biến môi trường `PORT` (Mặc định: `3000`).
