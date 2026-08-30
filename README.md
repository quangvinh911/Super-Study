# CTFL Practice

Ứng dụng Angular 22 để luyện tập và thi thử CTFL v4.0.1. Giao diện tiếng Việt, câu hỏi tiếng Anh, không tài khoản/backend/analytics; tiến độ được lưu trong IndexedDB và app shell + ngân hàng câu hỏi hoạt động offline sau lần tải đầu.

Ngân hàng v1 gồm 80 câu nguyên bản đã gắn chapter, Learning Objective, K-level và 40 blueprint bucket. Không có nội dung hay tài sản được sao chép từ PDF nghiên cứu.

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
