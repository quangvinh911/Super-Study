# Certificate Practice

Ứng dụng Angular 22 để luyện tập và thi thử nhiều chứng chỉ. Hiện có CTFL v4.0.1 và không gian TOEIC Listening & Reading đang chờ bộ đề. Giao diện tiếng Việt, câu hỏi tiếng Anh; tiến độ của mỗi chứng chỉ lưu riêng trong IndexedDB, không tài khoản/backend/analytics.

Trang chủ chọn chứng chỉ; mọi luồng dùng chung tại `/certificates/<id>/practice`, `/mock-exam`, `/progress` và `/methodology`. Link CTFL cũ và dữ liệu đã lưu vẫn hoạt động. TOEIC có bộ lọc Part, audio/bài đọc chung, cấu trúc 200 câu với 45/75 phút và kết quả raw theo Part; chưa mở bài làm khi ngân hàng rỗng.

Xem [kiến trúc, cách bổ sung bộ đề TOEIC và chứng chỉ mới](docs/adding-certificates.md). IELTS/AWS chưa có bộ đề hoặc adapter chuyên biệt.

Ngân hàng v1 gồm 80 câu viết mới đã gắn chapter, Learning Objective, K-level và 40 blueprint bucket. Site riêng tư còn có mode PDF với 278 câu trích xuất từ tài liệu người dùng cung cấp, kèm 278 ảnh câu hỏi và 278 ảnh đáp án theo trang. Không chuyển mode PDF sang phát hành công khai nếu chưa có quyền tái xuất bản.

## Yêu cầu

- Node.js `24.19.0` (xem `.node-version`)
- pnpm `11.19.0`

```bash
pnpm install --frozen-lockfile
pnpm run content:check
pnpm start
```

Mở `http://localhost:4200`.

## Nội dung

Nguồn soạn thảo nằm trong `content/chapter-*.yaml`. Lệnh build dùng JSON Schema + Ajv để kiểm tra quyền sử dụng, trạng thái kiểm định, ID, đáp án, nguồn và quota trước khi tạo:

- `public/data/manifest.json`
- `public/data/questions.json`
- `public/data/solutions.json`

Bộ PDF riêng tư được tạo bởi `scripts/extract-pdf-bank.py` thành `public/data/pdf-*.json` và `public/pdf-evidence/*.webp`; file PDF gốc không được đưa vào repository.

```bash
pnpm run content:build
pnpm run test:content
```

## Kiểm thử

```bash
pnpm run test:ci
pnpm run test:e2e
```

## Build Cloudflare Pages

```bash
pnpm run build:cf
```

- Build command: `pnpm run build:cf`
- Output directory: `dist/cloudflare/browser`
- Production branch: `main`
- Node version: `24.19.0`
- Environment variable: `PNPM_VERSION=11.19.0`

`public/_headers` cung cấp CSP/security headers và `public/_redirects` cung cấp SPA fallback cho deep link.

## Tuyên bố

Đây là công cụ học tập độc lập, phi thương mại. Dự án không liên kết hoặc được chứng thực bởi ISTQB® hay CertyIQ.
