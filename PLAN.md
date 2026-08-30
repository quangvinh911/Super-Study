# Kế hoạch xây dựng CTFL Practice bằng Angular 22

## Tóm tắt

- Tài liệu đã khảo sát: :codex-file-citation{path="C:/Users/Admin/Downloads/ctfl-v4-0.pdf" purpose="source"}. PDF có 262 trang, 278 câu, nhưng không có sẵn nhãn chapter, Learning Objective hoặc K-level.
- Phân loại tương tác:
  - 276 câu chọn một đáp án A-D.
  - 2 câu chọn đúng hai đáp án A-E: Q192=`BE`, Q272=`BD`.
  - Đáp án in trong PDF: A=61, B=75, C=74, D=63, `U`=3, `BE`=1, `BD`=1.
  - Q38, Q39 và Q47 ghi sai `U`; phần giải thích đều chỉ ra A. Chỉ 265/278 câu có phần giải thích.
  - Ít nhất 23 câu phụ thuộc bảng hoặc sơ đồ; có một số câu gần trùng hoặc mâu thuẫn như Q10/Q41.
- Website công khai, phi thương mại, không tài khoản/backend; giao diện tiếng Việt, câu hỏi và giải thích tiếng Anh; có luyện tập và thi thử; lưu dữ liệu trên trình duyệt; hỗ trợ PWA/offline.
- Vì chưa có quyền tái xuất bản, PDF chỉ được dùng làm tài liệu nghiên cứu nội bộ. Bản công khai sẽ phát hành 80 câu viết mới, kiểm định theo CTFL v4.0.1 rồi mở rộng đến 278. Không dùng nguyên văn, ảnh, bảng, logo hoặc giải thích của CertyIQ; thêm tuyên bố không liên kết với ISTQB/CertyIQ. Tài liệu mẫu chính thức cũng có điều kiện tái sử dụng, nên chỉ liên kết và trích dẫn ngắn, không sao chép hàng loạt ([copyright notice](https://istqb.org/wp-content/uploads/sdm-uploads/ISTQB_CTFL_v4.0_Sample-Exam-D-Answers_v1.5.pdf)).
- Pin phiên bản hiện hành ngày 29-08-2026: `@angular/core` 22.1.4, Angular CLI 22.1.6, Node 24.19.0 và pnpm 11.19.0. Angular 22.1 đang là dòng ổn định; 22.2 vẫn là prerelease ([release schedule](https://angular.dev/reference/releases), [core package](https://www.npmjs.com/package/%40angular/core?activeTab=versions), [CLI package](https://www.npmjs.com/package/%40angular/cli), [compatibility](https://angular.dev/reference/versions)).

## Phân loại và mô hình dữ liệu

- Tách ba trục phân loại:
  - `interaction`: `singleChoice | multiSelect`.
  - `styleTags`: `directKnowledge`, `scenario`, `statementEvaluation`, `calculation`, `ordering`, `tableOrDiagram`; có thêm cờ diễn đạt `TRUE`, `FALSE`, `BEST`, `MOST`, `NOT`, `MINIMAL`.
  - `syllabus`: chapter 1-6, section, Learning Objective, blueprint bucket và `K1 | K2 | K3`.
- Mọi đáp án đúng được lưu bằng mảng ID, kể cả câu chọn một đáp án. Multi-select chấm theo tập hợp chính xác, không phụ thuộc thứ tự và không cho điểm từng phần.
- Dùng nội dung có cấu trúc gồm paragraph, list, table, code, formula và image có alt text; không lưu hoặc render HTML tùy ý.

```ts
interface Question {
  id: string;
  revision: number;
  language: 'en';
  stem: ContentBlock[];
  options: { id: string; content: ContentBlock[] }[];
  interaction: {
    kind: 'singleChoice' | 'multiSelect';
    requiredSelections: number;
  };
  classification: {
    chapter: 1 | 2 | 3 | 4 | 5 | 6;
    section: string;
    learningObjective: string;
    blueprintBucket: string;
    kLevel: 'K1' | 'K2' | 'K3';
    styleTags: string[];
  };
  shuffleOptions: boolean;
  provenance: Provenance;
  verification: Verification;
}

interface Solution {
  questionId: string;
  correctOptionIds: string[];
  explanation: ContentBlock[];
  optionRationales?: Record<string, ContentBlock[]>;
  references: EvidenceReference[];
}
```

- Viết nội dung trong YAML theo chapter; JSON Schema + Ajv kiểm tra và biên dịch thành `manifest`, `questions` và `solutions` JSON có version.
- Chỉ xuất bản câu có `rightsStatus=cleared` và `answerStatus=verified`. Build phải thất bại nếu có ID trùng, đáp án không tồn tại như `U`, sai số lựa chọn, thiếu LO/K-level, thiếu nguồn kiểm chứng hoặc thiếu câu cho blueprint.

## Xây dựng ứng dụng

- Khởi tạo ngay tại Git repository hiện tại bằng Angular standalone, strict, zoneless, SCSS và Vitest; không dùng NgModules, NgRx, SSR, Angular Material, backend, authentication hay analytics. Dùng native form controls và SCSS riêng để giảm bundle.
- Tổ chức theo feature, lazy-load các route:
  - `/`: giới thiệu, tiến độ và nút tiếp tục.
  - `/practice` và `/practice/:sessionId`: lọc theo chapter/LO/K-level/style, câu chưa làm/sai/bookmark; phản hồi ngay sau nút “Kiểm tra”.
  - `/mock-exam` và `/mock-exam/:sessionId`: hướng dẫn, 60 hoặc 75 phút, điều hướng 40 câu, đánh dấu, cảnh báo câu trống, tự nộp khi hết giờ.
  - `/results/:sessionId`: điểm, đạt/trượt, thống kê theo chapter/K-level, xem lại và luyện câu sai.
  - `/progress`: lịch sử, điểm yếu, bookmark, export/import/reset.
  - `/methodology`: nguồn, bản quyền, quyền riêng tư và tuyên bố không liên kết.
- Dùng signal store cho phiên hiện tại; scoring, shuffle và generator là các hàm TypeScript thuần. Lưu session snapshot bất biến để cập nhật ngân hàng câu hỏi không thay đổi kết quả cũ.
- Blueprint thi thử bám [ISTQB CTFL](https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/) và [Exam Structure Tables v1.19](https://istqb.org/?download_id=3832&sdm_process_download=1):

| Chapter | K1 | K2 | K3 | Tổng |
|---|---:|---:|---:|---:|
| 1 | 2 | 6 | 0 | 8 |
| 2 | 2 | 4 | 0 | 6 |
| 3 | 2 | 2 | 0 | 4 |
| 4 | 0 | 6 | 5 | 11 |
| 5 | 1 | 5 | 3 | 9 |
| 6 | 1 | 1 | 0 | 2 |
| Tổng | 8 | 24 | 8 | 40 |

- Soạn 80 câu bằng hai biến thể độc lập cho mỗi blueprint bucket. Generator có seed, lấy đúng 40 câu không trùng, xáo thứ tự câu/đáp án bằng option ID và từ chối bắt đầu nếu không đủ inventory.
- Mỗi câu một điểm; 26/40 là đạt; 60 phút tiêu chuẩn hoặc 75 phút cho mô phỏng non-native. Practice chỉ hiện giải thích sau khi xác nhận; mock exam chỉ hiện sau khi nộp hoặc hết giờ.
- IndexedDB lưu tiến độ, bookmark, lịch sử, lựa chọn, deadline tuyệt đối và session snapshot; `localStorage` chỉ lưu tùy chọn giao diện. Có export/import JSON, reset dữ liệu và ngăn hai tab cùng sửa một kỳ thi.
- Thêm Angular PWA để cache app shell và ngân hàng câu hỏi. Sau lần tải đầu, luyện tập, thi, tải lại và xem kết quả phải hoạt động offline; chỉ kích hoạt bản cập nhật sau khi phiên hiện tại kết thúc. Angular Service Worker chỉ được dùng cho caching cơ bản như khuyến nghị chính thức ([PWA guidance](https://angular.dev/ecosystem/service-workers)).
- Đạt WCAG 2.2 AA: `fieldset/legend`, điều khiển bàn phím đầy đủ, focus rõ ràng, trạng thái không phụ thuộc màu, reflow 320px, zoom 200%, reduced motion, bảng/ảnh có mô tả và cảnh báo giờ ở mốc 10/5/1 phút.

## Nội dung, triển khai và phát hành

- Quy trình nội dung: viết câu nguyên bản → schema/similarity checks → người kiểm định đối chiếu CTFL v4.0.1/Glossary → xác nhận quyền → PR review → phát hành bank version bất biến.
- Giữ PDF và phần text trích xuất ngoài repository. Chỉ lưu audit metadata như số câu, loại, `invalidKey`, `missingExplanation`, `possibleDuplicate`, `conflictingDuplicate`; không sao chép bảng/ảnh nguồn vào bản public.
- Dùng GitHub làm remote mặc định và Cloudflare Pages Git integration: branch `main`, preview cho pull request, HTTPS và SPA fallback.
- Build command: `pnpm run build:cf` chạy `ng build --output-path dist/cloudflare`; publish `dist/cloudflare/browser`. Pin `.node-version=24.19.0` và `PNPM_VERSION=11.19.0`; thêm CSP và security headers. Cấu hình bám [Cloudflare Angular guide](https://developers.cloudflare.com/pages/framework-guides/deploy-an-angular-site/) và [SPA routing behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/).
- Phát hành đầu trên miền `*.pages.dev`; custom domain và admin editor nằm ngoài v1.

## Kiểm thử và tiêu chí nghiệm thu

- Content tests: đúng 80 câu public đã cleared/verified; validator bắt được `U`, ID trùng, đáp án sai, thiếu nguồn và thiếu blueprint bucket.
- Unit tests bằng Vitest: exact-set multi-select, pass 25/26, shuffle theo seed, đủ quota chapter/K/LO, không trùng câu, timer, filter và migration IndexedDB.
- Component/router tests: radio/checkbox, giới hạn số lựa chọn, feedback practice, ẩn đáp án trong mock, focus restoration và reload session.
- Playwright trên Chromium/Firefox/WebKit: hoàn thành practice, thi 40 câu, 60/75 phút, flag/unanswered, refresh, auto-submit, export/import/reset và deep link Cloudflare.
- PWA tests trên production build: hoàn thành phiên offline sau lần đồng bộ đầu; cập nhật app không làm mất phiên đang thi.
- Accessibility/security: không có lỗi axe serious/critical; Lighthouse performance tối thiểu 90 và accessibility tối thiểu 95; kiểm tra bàn phím, screen reader, zoom 200%, CSP và security headers.
- Acceptance cuối: generator luôn tạo đúng ma trận 40 câu; 25/40 trượt, 26/40 đạt; multi-select chỉ đúng khi tập lựa chọn khớp hoàn toàn; lịch sử không đổi khi câu hỏi có revision mới; production không chứa nội dung hoặc tài sản sao chép từ PDF.
