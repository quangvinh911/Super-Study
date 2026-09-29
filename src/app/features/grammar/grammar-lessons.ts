export type GrammarStage = 'Nền tảng' | 'Động từ' | 'Nối ý' | 'Mở rộng';

export interface GrammarCheck {
  readonly prompt: string;
  readonly options: readonly [string, string, string, string];
  readonly answer: number;
  readonly explanation: string;
}

export interface GrammarLesson {
  readonly slug: string;
  readonly title: string;
  readonly stage: GrammarStage;
  readonly summary: string;
  readonly goal: string;
  readonly part: 'part-5' | 'part-6';
  readonly rules: readonly {
    readonly label: string;
    readonly pattern: string;
    readonly use: string;
  }[];
  readonly examples: readonly {
    readonly english: string;
    readonly vietnamese: string;
    readonly clue: string;
  }[];
  readonly trap: string;
  readonly visual: { readonly title: string; readonly steps: readonly string[] };
  readonly checks: readonly [GrammarCheck, GrammarCheck];
}

/** Original learning material. External articles inform topic selection, not wording or questions. */
export const GRAMMAR_LESSONS: readonly GrammarLesson[] = [
  {
    slug: 'cau-va-tu-loai',
    title: 'Cấu trúc câu & từ loại',
    stage: 'Nền tảng',
    summary: 'Nhìn vị trí chỗ trống để chọn danh từ, động từ, tính từ hay trạng từ.',
    goal: 'Nhận ra vai trò của một từ trước khi xét nghĩa.',
    part: 'part-5',
    rules: [
      {
        label: 'Khung câu',
        pattern: 'Subject + verb + (object / complement)',
        use: 'Một mệnh đề độc lập cần chủ ngữ và động từ chính.',
      },
      {
        label: 'Bổ nghĩa danh từ',
        pattern: 'determiner + adjective + noun',
        use: 'Tính từ thường đứng trước danh từ; mạo từ và từ hạn định đứng đầu cụm.',
      },
      {
        label: 'Bổ nghĩa động từ',
        pattern: 'verb + adverb',
        use: 'Trạng từ chỉ cách thức thường bổ nghĩa cho động từ, tính từ hoặc trạng từ khác.',
      },
      {
        label: 'Họ từ',
        pattern: 'approve → approval → approved',
        use: 'Nhận diện hậu tố như -tion, -ment, -ly nhưng luôn kiểm tra vị trí và nghĩa.',
      },
    ],
    examples: [
      {
        english: 'The team submitted a detailed proposal.',
        vietnamese: 'Nhóm đã nộp một đề xuất chi tiết.',
        clue: 'detailed đứng trước proposal nên là tính từ.',
      },
      {
        english: 'The system updates automatically.',
        vietnamese: 'Hệ thống tự động cập nhật.',
        clue: 'automatically bổ nghĩa cho updates nên là trạng từ.',
      },
    ],
    trap: 'Đuôi -ly không luôn là trạng từ: friendly là tính từ. Đừng chọn chỉ theo hậu tố.',
    visual: {
      title: 'Vị trí quyết định từ loại',
      steps: ['a / the', 'tính từ', 'danh từ', 'động từ', 'trạng từ'],
    },
    checks: [
      {
        prompt: 'The manager gave a _____ explanation of the policy.',
        options: ['clarity', 'clear', 'clearly', 'clearance'],
        answer: 1,
        explanation: 'Trước danh từ explanation cần tính từ clear.',
      },
      {
        prompt: 'All requests are processed _____.',
        options: ['prompt', 'promptly', 'promptness', 'prompts'],
        answer: 1,
        explanation: 'Sau processed cần trạng từ promptly chỉ cách xử lý.',
      },
    ],
  },
  {
    slug: 'danh-tu-va-tu-han-dinh',
    title: 'Danh từ, mạo từ & đại từ',
    stage: 'Nền tảng',
    summary: 'Chọn số ít, số nhiều, từ hạn định và đại từ đúng chức năng.',
    goal: 'Xác định danh từ đếm được, số lượng và vai trò của đại từ.',
    part: 'part-5',
    rules: [
      {
        label: 'Mạo từ',
        pattern: 'a/an + singular countable noun; the + specific noun',
        use: 'a/an giới thiệu một đối tượng chưa xác định; the chỉ đối tượng xác định trong ngữ cảnh.',
      },
      {
        label: 'Số lượng',
        pattern: 'many/few + plural; much/little + uncountable',
        use: 'Chọn lượng từ theo danh từ đi sau.',
      },
      {
        label: 'Sở hữu',
        pattern: 'our + noun; ours đứng một mình',
        use: 'Tính từ sở hữu cần danh từ theo sau; đại từ sở hữu thay cả cụm danh từ.',
      },
      {
        label: 'Phản thân',
        pattern: 'subject + verb + oneself',
        use: 'Dùng khi chủ ngữ và đối tượng nhận tác động là cùng người.',
      },
    ],
    examples: [
      {
        english: 'We received several invoices this morning.',
        vietnamese: 'Chúng tôi nhận được vài hóa đơn sáng nay.',
        clue: 'several đi với invoices số nhiều.',
      },
      {
        english: 'Our proposal is ready; theirs is still under review.',
        vietnamese: 'Đề xuất của chúng tôi đã sẵn sàng; của họ vẫn đang được xem xét.',
        clue: 'Our cần proposal, còn theirs thay cho their proposal.',
      },
    ],
    trap: 'Information và equipment là danh từ không đếm được trong cách dùng thông thường; không thêm -s để chỉ số nhiều.',
    visual: {
      title: 'Chọn từ đứng trước danh từ',
      steps: [
        'Danh từ đếm được?',
        'Một hay nhiều?',
        'Đã xác định?',
        'Chọn a/an, the hoặc lượng từ',
      ],
    },
    checks: [
      {
        prompt: 'The office needs _____ equipment for the new staff.',
        options: ['many', 'a few', 'some', 'an'],
        answer: 2,
        explanation: 'Equipment không đếm được; some dùng được ở đây.',
      },
      {
        prompt: 'This schedule is ours, but the revised one is _____.',
        options: ['their', 'theirs', 'them', 'they'],
        answer: 1,
        explanation: 'Theirs là đại từ sở hữu, đứng một mình sau is.',
      },
    ],
  },
  {
    slug: 'cac-thi',
    title: 'Các thì & dấu hiệu thời gian',
    stage: 'Nền tảng',
    summary: 'Đọc mốc thời gian trước khi chia động từ.',
    goal: 'Phân biệt hành động thường lệ, đang diễn ra, đã hoàn tất và xảy ra trước một mốc.',
    part: 'part-5',
    rules: [
      {
        label: 'Hiện tại',
        pattern: 'V(s/es) · am/is/are + V-ing · have/has + V3 · have/has been + V-ing',
        use: 'Lần lượt: thói quen; đang diễn ra; kết quả còn liên quan hiện tại; quá trình kéo dài đến nay.',
      },
      {
        label: 'Quá khứ',
        pattern: 'V2 · was/were + V-ing · had + V3 · had been + V-ing',
        use: 'Lần lượt: việc đã xong; đang diễn ra lúc đó; xong trước mốc quá khứ; kéo dài trước mốc đó.',
      },
      {
        label: 'Tương lai',
        pattern: 'will + V · will be + V-ing · will have + V3 · will have been + V-ing',
        use: 'Lần lượt: dự đoán/quyết định; đang diễn ra ở mốc tới; hoàn tất trước mốc tới; kéo dài đến mốc tới.',
      },
      {
        label: 'Từ chỉ thời gian',
        pattern: 'every Monday · now · yesterday · since · by Friday',
        use: 'Mốc thời gian gợi ý thì nhưng phải đối chiếu ý nghĩa cả câu.',
      },
    ],
    examples: [
      {
        english: 'The supplier has delivered the materials.',
        vietnamese: 'Nhà cung cấp đã giao vật liệu.',
        clue: 'Hiện tại hoàn thành nhấn vào kết quả hiện có.',
      },
      {
        english: 'By Friday, we will have completed the audit.',
        vietnamese: 'Đến thứ Sáu, chúng tôi sẽ hoàn thành cuộc kiểm toán.',
        clue: 'by Friday là hạn trước đó hành động hoàn tất.',
      },
    ],
    trap: 'Yesterday chỉ một thời điểm đã kết thúc: dùng quá khứ đơn, không dùng hiện tại hoàn thành.',
    visual: {
      title: 'Trục thời gian',
      steps: ['Quá khứ', 'Hiện tại', 'Tương lai', 'by + mốc: hoàn tất trước mốc'],
    },
    checks: [
      {
        prompt: 'The board _____ the budget yesterday.',
        options: ['approves', 'approved', 'has approved', 'will approve'],
        answer: 1,
        explanation: 'Yesterday là mốc đã kết thúc, nên dùng quá khứ đơn approved.',
      },
      {
        prompt: 'By the time the client arrives, we _____ the presentation.',
        options: ['finish', 'finished', 'will have finished', 'are finishing'],
        answer: 2,
        explanation: 'Việc hoàn thành xảy ra trước mốc tương lai the client arrives.',
      },
    ],
  },
  {
    slug: 'hoa-hop-chu-vi',
    title: 'Hòa hợp chủ ngữ – động từ',
    stage: 'Nền tảng',
    summary: 'Tìm chủ ngữ thật, bỏ qua cụm xen giữa rồi chia động từ.',
    goal: 'Chia đúng động từ theo số của chủ ngữ.',
    part: 'part-5',
    rules: [
      {
        label: 'Chủ ngữ chính',
        pattern: 'The list of items is ...',
        use: 'Cụm of items không đổi số của chủ ngữ list.',
      },
      {
        label: 'Each/every',
        pattern: 'Each employee has ...',
        use: 'Each/every + danh từ số ít thường đi với động từ số ít.',
      },
      {
        label: 'There is/are',
        pattern: 'There are several options.',
        use: 'Chia động từ theo danh từ thực đứng sau.',
      },
      {
        label: 'Chủ ngữ nối',
        pattern: 'A and B are ...',
        use: 'Hai chủ ngữ nối bằng and thường dùng số nhiều.',
      },
    ],
    examples: [
      {
        english: 'The list of approved vendors is available online.',
        vietnamese: 'Danh sách nhà cung cấp được duyệt có trên mạng.',
        clue: 'Chủ ngữ là list, không phải vendors.',
      },
      {
        english: 'Each department has a separate budget.',
        vietnamese: 'Mỗi phòng ban có ngân sách riêng.',
        clue: 'Each department là số ít.',
      },
    ],
    trap: 'Đừng chia theo danh từ gần động từ nhất khi nó chỉ nằm trong cụm bổ nghĩa.',
    visual: {
      title: 'Tìm chủ ngữ thật',
      steps: [
        'Tìm động từ chính',
        'Gạch cụm of / with',
        'Xác định chủ ngữ',
        'Chọn số ít hoặc nhiều',
      ],
    },
    checks: [
      {
        prompt: 'The results of the survey _____ ready.',
        options: ['is', 'are', 'was', 'be'],
        answer: 1,
        explanation: 'Chủ ngữ results là số nhiều nên dùng are.',
      },
      {
        prompt: 'Each of the applicants _____ an interview time.',
        options: ['have', 'has', 'having', 'are having'],
        answer: 1,
        explanation: 'Each là chủ ngữ số ít, dùng has.',
      },
    ],
  },
  {
    slug: 'cau-bi-dong',
    title: 'Câu bị động',
    stage: 'Động từ',
    summary: 'Đặt người hoặc vật nhận hành động lên đầu câu.',
    goal: 'Nhận ra bị động và giữ đúng thì của động từ.',
    part: 'part-5',
    rules: [
      {
        label: 'Công thức',
        pattern: 'be + V3',
        use: 'Đổi dạng be theo thì và số của chủ ngữ; V3 giữ nguyên.',
      },
      {
        label: 'Quá khứ',
        pattern: 'was/were + V3',
        use: 'Dùng cho hành động bị tác động đã xảy ra.',
      },
      {
        label: 'Hiện tại hoàn thành',
        pattern: 'have/has been + V3',
        use: 'Nhấn kết quả đến hiện tại.',
      },
      { label: 'Sau modal', pattern: 'modal + be + V3', use: 'Giữ modal, thêm be trước V3.' },
    ],
    examples: [
      {
        english: 'The invoices were sent yesterday.',
        vietnamese: 'Các hóa đơn đã được gửi hôm qua.',
        clue: 'Invoices nhận hành động gửi; yesterday gọi quá khứ.',
      },
      {
        english: 'The form must be signed before noon.',
        vietnamese: 'Biểu mẫu phải được ký trước trưa.',
        clue: 'must + be + signed.',
      },
    ],
    trap: 'Không phải mọi V3 đều là bị động; hãy tìm trợ động từ be và xem chủ ngữ có nhận hành động không.',
    visual: {
      title: 'Chuyển chủ động sang bị động',
      steps: [
        'The clerk sent the invoice',
        'invoice nhận hành động',
        'The invoice was sent',
        'by the clerk: chỉ thêm khi cần',
      ],
    },
    checks: [
      {
        prompt: 'The contract _____ by both parties last week.',
        options: ['signed', 'was signed', 'has signed', 'signing'],
        answer: 1,
        explanation: 'Contract nhận hành động; last week yêu cầu quá khứ bị động was signed.',
      },
      {
        prompt: 'All applications must _____ before Friday.',
        options: ['submit', 'be submitted', 'submitted', 'be submitting'],
        answer: 1,
        explanation: 'Sau must, dạng bị động là be + V3.',
      },
    ],
  },
  {
    slug: 'dong-tu-khuyet-thieu',
    title: 'Động từ khuyết thiếu',
    stage: 'Động từ',
    summary: 'Diễn tả khả năng, lời khuyên, nghĩa vụ và mức độ chắc chắn.',
    goal: 'Chọn modal theo ý nghĩa và dùng đúng dạng động từ theo sau.',
    part: 'part-5',
    rules: [
      {
        label: 'Dạng cơ bản',
        pattern: 'can / should / must / may + V nguyên thể',
        use: 'Không thêm -s, -ed hoặc to ngay sau modal.',
      },
      {
        label: 'Khả năng',
        pattern: 'can / may / might',
        use: 'can nêu khả năng; may/might có thể nói khả năng xảy ra.',
      },
      {
        label: 'Nghĩa vụ',
        pattern: 'must / have to / should',
        use: 'must/have to mạnh hơn should, vốn là lời khuyên.',
      },
      {
        label: 'Quá khứ suy đoán',
        pattern: 'may / must + have + V3',
        use: 'Suy đoán về việc đã xảy ra, khác modal + V cho hiện tại/tương lai.',
      },
    ],
    examples: [
      {
        english: 'Employees must wear their badges in the building.',
        vietnamese: 'Nhân viên phải đeo thẻ trong tòa nhà.',
        clue: 'must diễn tả yêu cầu bắt buộc.',
      },
      {
        english: 'The shipment may arrive early.',
        vietnamese: 'Lô hàng có thể đến sớm.',
        clue: 'may + arrive nguyên thể.',
      },
    ],
    trap: 'Sau should không dùng should to send hoặc should sends.',
    visual: {
      title: 'Chọn mức độ',
      steps: ['can: có thể', 'may/might: có khả năng', 'should: nên', 'must: phải'],
    },
    checks: [
      {
        prompt: 'Visitors _____ show identification at reception; it is required.',
        options: ['must', 'might', 'could', 'would'],
        answer: 0,
        explanation: 'It is required diễn tả nghĩa vụ bắt buộc, chọn must.',
      },
      {
        prompt: 'The technician should _____ the device first.',
        options: ['checks', 'checking', 'check', 'to check'],
        answer: 2,
        explanation: 'Modal should đi với động từ nguyên thể không to: check.',
      },
    ],
  },
  {
    slug: 'to-v-va-v-ing',
    title: 'To V & V-ing',
    stage: 'Động từ',
    summary: 'Nhận ra động từ, tính từ và giới từ yêu cầu dạng theo sau.',
    goal: 'Chọn dạng động từ dựa trên từ đứng trước.',
    part: 'part-5',
    rules: [
      {
        label: 'Động từ + to V',
        pattern: 'plan / decide / agree + to V',
        use: 'Dùng khi diễn tả kế hoạch, quyết định hoặc đồng ý thực hiện.',
      },
      {
        label: 'Động từ + V-ing',
        pattern: 'avoid / finish / consider + V-ing',
        use: 'Ghi nhớ theo động từ chi phối; không thay bằng to V.',
      },
      {
        label: 'Sau giới từ',
        pattern: 'interested in + V-ing',
        use: 'Sau giới từ thường dùng danh từ hoặc V-ing.',
      },
      { label: 'Mục đích', pattern: 'to + V', use: 'To V có thể nêu mục đích của một hành động.' },
    ],
    examples: [
      {
        english: 'The team decided to postpone the launch.',
        vietnamese: 'Nhóm quyết định hoãn buổi ra mắt.',
        clue: 'decide + to V.',
      },
      {
        english: 'We look forward to meeting the new director.',
        vietnamese: 'Chúng tôi mong được gặp giám đốc mới.',
        clue: 'to trong look forward to là giới từ, nên theo sau là V-ing.',
      },
    ],
    trap: 'Không phải to nào cũng mở đầu động từ nguyên thể: look forward to + V-ing.',
    visual: {
      title: 'Nhìn từ đứng trước',
      steps: ['decide', 'to V', 'avoid', 'V-ing', 'giới từ', 'V-ing'],
    },
    checks: [
      {
        prompt: 'The company plans _____ a new branch.',
        options: ['open', 'opening', 'to open', 'opened'],
        answer: 2,
        explanation: 'Plan + to V: plans to open.',
      },
      {
        prompt: 'Ms. Tran is interested in _____ the workshop.',
        options: ['attend', 'attending', 'to attend', 'attended'],
        answer: 1,
        explanation: 'Sau giới từ in dùng V-ing: attending.',
      },
    ],
  },
  {
    slug: 'phan-tu-va-rut-gon',
    title: 'Phân từ & mệnh đề rút gọn',
    stage: 'Động từ',
    summary: 'Phân biệt -ing chủ động và V3 mang nghĩa bị động hoặc đã hoàn tất.',
    goal: 'Chọn phân từ bổ nghĩa đúng cho danh từ và rút gọn mệnh đề hợp lý.',
    part: 'part-5',
    rules: [
      {
        label: 'Hiện tại phân từ',
        pattern: 'N + V-ing',
        use: 'Danh từ tự thực hiện hành động trong cụm rút gọn.',
      },
      {
        label: 'Quá khứ phân từ',
        pattern: 'N + V3',
        use: 'Danh từ nhận hành động; V3 cũng có thể chỉ trạng thái.',
      },
      {
        label: 'Rút gọn quan hệ',
        pattern: 'documents that were attached → documents attached',
        use: 'Chỉ rút gọn khi quan hệ giữa danh từ và động từ rõ ràng.',
      },
      {
        label: 'Tính từ -ing/-ed',
        pattern: 'interesting / interested',
        use: '-ing mô tả thứ gây cảm xúc; -ed mô tả người hoặc vật chịu cảm xúc.',
      },
    ],
    examples: [
      {
        english: 'The employees attending the seminar received certificates.',
        vietnamese: 'Nhân viên tham dự hội thảo đã nhận chứng nhận.',
        clue: 'Employees tự thực hiện attend.',
      },
      {
        english: 'The documents attached to the email are confidential.',
        vietnamese: 'Tài liệu đính kèm email là bảo mật.',
        clue: 'Documents được attach.',
      },
    ],
    trap: 'Không chọn -ing hay V3 chỉ theo danh từ là người hay vật; xét ai thực hiện hành động.',
    visual: {
      title: 'Ai thực hiện hành động?',
      steps: ['Danh từ tự làm', 'V-ing', 'Danh từ được tác động', 'V3'],
    },
    checks: [
      {
        prompt: 'The guests _____ at the hotel should check in online.',
        options: ['stay', 'staying', 'stayed', 'stays'],
        answer: 1,
        explanation: 'Guests tự thực hiện stay; staying rút gọn who are staying.',
      },
      {
        prompt: 'Please review the file _____ to this message.',
        options: ['attach', 'attaching', 'attached', 'attaches'],
        answer: 2,
        explanation: 'File được đính kèm, nên dùng V3 attached.',
      },
    ],
  },
  {
    slug: 'gioi-tu',
    title: 'Giới từ & cụm giới từ',
    stage: 'Nối ý',
    summary: 'Chọn giới từ theo thời gian, vị trí và cụm đi cùng từ chính.',
    goal: 'Phân biệt từ chỉ mốc, khoảng thời gian và kết hợp cố định.',
    part: 'part-5',
    rules: [
      {
        label: 'Mốc thời gian',
        pattern: 'at 9 a.m. · on Monday · in September',
        use: 'at cho giờ, on cho ngày, in cho tháng/năm/khoảng rộng.',
      },
      {
        label: 'Hạn và khoảng',
        pattern: 'by Friday · until Friday · for two weeks',
        use: 'by là chậm nhất; until kéo dài đến; for nêu độ dài.',
      },
      {
        label: 'Cụm thông dụng',
        pattern: 'responsible for · interested in · comply with',
        use: 'Học cả cụm trong câu, không dịch từng từ.',
      },
      {
        label: 'Sau giới từ',
        pattern: 'preposition + noun / V-ing',
        use: 'Một giới từ cần tân ngữ là cụm danh từ hoặc danh động từ.',
      },
    ],
    examples: [
      {
        english: 'Please submit the form by Thursday.',
        vietnamese: 'Vui lòng nộp biểu mẫu chậm nhất thứ Năm.',
        clue: 'by nêu hạn cuối.',
      },
      {
        english: 'The office will remain closed until Monday.',
        vietnamese: 'Văn phòng sẽ tiếp tục đóng cửa đến thứ Hai.',
        clue: 'until nói trạng thái kéo dài đến mốc.',
      },
    ],
    trap: 'By Monday và until Monday không đồng nghĩa: một bên là hạn hoàn thành, một bên là thời gian kéo dài.',
    visual: {
      title: 'Hai loại mốc',
      steps: ['by: xong trước hạn', 'mốc thời gian', 'until: kéo dài tới hạn'],
    },
    checks: [
      {
        prompt: 'The revised report is due _____ noon.',
        options: ['by', 'until', 'during', 'since'],
        answer: 0,
        explanation: 'Due by noon nghĩa là chậm nhất vào giữa trưa.',
      },
      {
        prompt: 'The analyst is responsible _____ updating the records.',
        options: ['at', 'for', 'with', 'to'],
        answer: 1,
        explanation: 'Cụm cố định responsible for + V-ing.',
      },
    ],
  },
  {
    slug: 'lien-tu-va-tu-noi',
    title: 'Liên từ & từ nối',
    stage: 'Nối ý',
    summary: 'Phân biệt từ nối mệnh đề với từ đi trước danh từ.',
    goal: 'Dùng đúng cấu trúc cho nguyên nhân, đối lập, thời gian và kết quả.',
    part: 'part-6',
    rules: [
      {
        label: 'Nguyên nhân',
        pattern: 'because + clause; because of + noun',
        use: 'Because nối mệnh đề có chủ ngữ và động từ; because of đi trước cụm danh từ.',
      },
      {
        label: 'Đối lập',
        pattern: 'although + clause; despite + noun / V-ing',
        use: 'Kiểm tra thành phần sau chỗ trống trước khi chọn.',
      },
      {
        label: 'Thời gian',
        pattern: 'when / while / before + clause',
        use: 'Liên từ thời gian nối hai sự việc.',
      },
      {
        label: 'Chuyển ý',
        pattern: 'however / therefore, + clause',
        use: 'Trạng từ nối ý thường tách bằng dấu câu; xét logic toàn đoạn.',
      },
    ],
    examples: [
      {
        english: 'Although the order was delayed, the client remained patient.',
        vietnamese: 'Dù đơn hàng bị chậm, khách hàng vẫn kiên nhẫn.',
        clue: 'Sau although là một mệnh đề đầy đủ.',
      },
      {
        english: 'The order was delayed; therefore, we notified the client.',
        vietnamese: 'Đơn hàng bị chậm; vì vậy chúng tôi đã báo khách hàng.',
        clue: 'therefore chỉ kết quả và đứng sau dấu chấm phẩy.',
      },
    ],
    trap: 'Despite the delay đúng; despite the order was delayed sai vì despite không đi trực tiếp với mệnh đề.',
    visual: {
      title: 'Nhìn cấu trúc phía sau',
      steps: [
        'Có chủ ngữ + động từ?',
        'although / because',
        'Cụm danh từ?',
        'despite / because of',
      ],
    },
    checks: [
      {
        prompt: '_____ the rain, the event continued as planned.',
        options: ['Although', 'Despite', 'Because', 'While'],
        answer: 1,
        explanation: 'The rain là cụm danh từ, dùng despite.',
      },
      {
        prompt: 'The venue was unavailable; _____, we moved the meeting online.',
        options: ['however', 'therefore', 'although', 'despite'],
        answer: 1,
        explanation: 'Chuyển sang họp trực tuyến là kết quả, dùng therefore.',
      },
    ],
  },
  {
    slug: 'menh-de',
    title: 'Mệnh đề quan hệ, danh từ & trạng ngữ',
    stage: 'Nối ý',
    summary: 'Đọc chức năng của mệnh đề để chọn who, which, that, where hay when.',
    goal: 'Xác định mệnh đề bổ nghĩa danh từ, đóng vai trò danh từ hoặc nêu hoàn cảnh.',
    part: 'part-6',
    rules: [
      {
        label: 'Quan hệ',
        pattern: 'person who ...; thing which/that ...',
        use: 'Mệnh đề quan hệ đứng sau danh từ và bổ nghĩa cho danh từ đó.',
      },
      {
        label: 'Nơi/thời điểm',
        pattern: 'place where ...; time when ...',
        use: 'Where/when nối ý về nơi chốn/thời gian khi vai trò trong mệnh đề phù hợp.',
      },
      {
        label: 'Mệnh đề danh từ',
        pattern: 'We know that the shipment arrived.',
        use: 'Cả mệnh đề that... làm tân ngữ của know.',
      },
      {
        label: 'Mệnh đề trạng ngữ',
        pattern: 'If / when / because + subject + verb',
        use: 'Thêm điều kiện, thời gian hoặc lý do cho mệnh đề chính.',
      },
    ],
    examples: [
      {
        english: 'The engineer who inspected the site sent a report.',
        vietnamese: 'Kỹ sư đã kiểm tra địa điểm gửi báo cáo.',
        clue: 'who bổ nghĩa engineer và là chủ ngữ của inspected.',
      },
      {
        english: 'We confirmed that the delivery had arrived.',
        vietnamese: 'Chúng tôi xác nhận rằng hàng đã đến.',
        clue: 'that the delivery had arrived là tân ngữ của confirmed.',
      },
    ],
    trap: 'Không dùng where chỉ vì thấy danh từ chỉ nơi; cần kiểm tra mệnh đề sau có thiếu thành phần gì.',
    visual: {
      title: 'Ba vai trò của mệnh đề',
      steps: ['Sau danh từ → quan hệ', 'Làm chủ/tân ngữ → danh từ', 'Nêu hoàn cảnh → trạng ngữ'],
    },
    checks: [
      {
        prompt: 'The consultant _____ led the workshop will return next month.',
        options: ['whose', 'who', 'where', 'when'],
        answer: 1,
        explanation: 'Chỉ người consultant, đồng thời làm chủ ngữ của led: who.',
      },
      {
        prompt: 'Please confirm _____ the shipment has arrived.',
        options: ['what', 'whose', 'that', 'where'],
        answer: 2,
        explanation: 'That mở đầu mệnh đề danh từ làm tân ngữ của confirm.',
      },
    ],
  },
  {
    slug: 'so-sanh',
    title: 'Cấu trúc so sánh',
    stage: 'Nối ý',
    summary: 'So sánh bằng, hơn, nhất và mức thay đổi.',
    goal: 'Chọn đúng dạng tính từ/trạng từ và từ đi kèm.',
    part: 'part-5',
    rules: [
      {
        label: 'Bằng nhau',
        pattern: 'as + adjective/adverb + as',
        use: 'Hai đối tượng có cùng mức độ.',
      },
      {
        label: 'Hơn',
        pattern: '-er / more + adjective/adverb + than',
        use: 'So sánh hai đối tượng; chọn -er hay more tùy từ.',
      },
      {
        label: 'Nhất',
        pattern: 'the -est / the most + adjective',
        use: 'Chọn mức cao nhất trong một nhóm.',
      },
      {
        label: 'Tăng cùng nhau',
        pattern: 'The more ..., the better ...',
        use: 'Hai thay đổi liên hệ với nhau.',
      },
    ],
    examples: [
      {
        english: 'This route is faster than the old one.',
        vietnamese: 'Tuyến này nhanh hơn tuyến cũ.',
        clue: 'faster + than.',
      },
      {
        english: 'The earlier we book, the lower the fare will be.',
        vietnamese: 'Đặt càng sớm, giá vé sẽ càng thấp.',
        clue: 'The + so sánh hơn ở cả hai vế.',
      },
    ],
    trap: 'Không dùng more faster; faster đã là dạng so sánh hơn.',
    visual: {
      title: 'Chọn mức so sánh',
      steps: [
        'Bằng nhau → as ... as',
        'Hai mức → ... than',
        'Cao nhất → the ...est / most',
        'Cùng thay đổi → the ..., the ...',
      ],
    },
    checks: [
      {
        prompt: 'The new software is _____ than the previous version.',
        options: ['efficient', 'more efficient', 'most efficient', 'as efficient'],
        answer: 1,
        explanation: 'Có than nên dùng so sánh hơn more efficient.',
      },
      {
        prompt: 'Of the three plans, this is _____ expensive.',
        options: ['less', 'the least', 'least', 'as'],
        answer: 1,
        explanation: 'Of the three plans nêu nhóm để so sánh nhất: the least expensive.',
      },
    ],
  },
  {
    slug: 'cau-dieu-kien',
    title: 'Câu điều kiện',
    stage: 'Nối ý',
    summary: 'Tách điều kiện có thật khỏi giả định hiện tại và quá khứ.',
    goal: 'Chọn cặp thì đúng cho mỗi ý nghĩa nếu–thì.',
    part: 'part-5',
    rules: [
      {
        label: 'Loại 0',
        pattern: 'If + present, present',
        use: 'Quy luật hoặc sự thật thường xuyên.',
      },
      {
        label: 'Loại 1',
        pattern: 'If + present, will + V',
        use: 'Điều kiện có thể xảy ra trong tương lai.',
      },
      {
        label: 'Loại 2',
        pattern: 'If + past, would + V',
        use: 'Giả định trái thực tế hiện tại hoặc khó xảy ra.',
      },
      {
        label: 'Loại 3',
        pattern: 'If + had + V3, would have + V3',
        use: 'Giả định ngược với sự việc đã xảy ra.',
      },
      {
        label: 'Hỗn hợp',
        pattern: 'If + had + V3, would + V now',
        use: 'Điều kiện không thật trong quá khứ dẫn đến kết quả hiện tại.',
      },
    ],
    examples: [
      {
        english: 'If the supplier confirms today, we will ship tomorrow.',
        vietnamese: 'Nếu nhà cung cấp xác nhận hôm nay, mai chúng tôi sẽ gửi hàng.',
        clue: 'Điều kiện tương lai có thể xảy ra: hiện tại + will.',
      },
      {
        english: 'If we had ordered earlier, the parts would have arrived on time.',
        vietnamese: 'Nếu đặt sớm hơn, linh kiện đã đến đúng giờ.',
        clue: 'Giả định trái với quá khứ: had ordered + would have arrived.',
      },
    ],
    trap: 'Trong mệnh đề if loại 1, không tự động dùng will sau if.',
    visual: {
      title: 'Chọn theo thời gian và thực tế',
      steps: [
        'Quy luật → loại 0',
        'Có thể xảy ra → loại 1',
        'Giả định hiện tại → loại 2',
        'Tiếc về quá khứ → loại 3',
      ],
    },
    checks: [
      {
        prompt: 'If the client approves the design, we _____ production.',
        options: ['begin', 'began', 'will begin', 'would have begun'],
        answer: 2,
        explanation: 'Điều kiện loại 1: if + hiện tại, mệnh đề chính will + V.',
      },
      {
        prompt: 'If the team had checked the address, the parcel _____ lost.',
        options: ['will not be', 'would not have been', 'is not', 'would not be'],
        answer: 1,
        explanation: 'Giả định ngược với quá khứ: would not have been.',
      },
    ],
  },
  {
    slug: 'cau-gia-dinh',
    title: 'Câu giả định & wish',
    stage: 'Mở rộng',
    summary: 'Nhận ra đề nghị trang trọng và mong muốn trái thực tế.',
    goal: 'Dùng dạng nguyên thể sau yêu cầu và dạng lùi thì sau wish.',
    part: 'part-5',
    rules: [
      {
        label: 'Đề nghị',
        pattern: 'suggest / recommend that + subject + (should) + V',
        use: 'Trong văn phong trang trọng, động từ sau that ở dạng nguyên thể dù chủ ngữ là số ít.',
      },
      {
        label: 'Điều cần thiết',
        pattern: 'It is essential that + subject + (should) + V',
        use: 'Nêu yêu cầu quan trọng, không chia -s ở V.',
      },
      {
        label: 'Wish hiện tại',
        pattern: 'wish + past simple',
        use: 'Mong muốn khác thực tế hiện tại.',
      },
      { label: 'Wish quá khứ', pattern: 'wish + had + V3', use: 'Tiếc về sự việc đã xảy ra.' },
    ],
    examples: [
      {
        english: 'The director requested that the report be revised.',
        vietnamese: 'Giám đốc yêu cầu báo cáo được chỉnh sửa.',
        clue: 'Sau requested that dùng be, không dùng is.',
      },
      {
        english: 'I wish the meeting started later.',
        vietnamese: 'Ước gì cuộc họp bắt đầu muộn hơn.',
        clue: 'started là dạng lùi thì cho mong muốn hiện tại.',
      },
    ],
    trap: 'Sau suggest that trong cấu trúc giả định, he submit đúng; he submits không đúng với mẫu này.',
    visual: {
      title: 'Hai cách dùng giả định',
      steps: [
        'Yêu cầu → that + V nguyên thể',
        'Ước hiện tại → lùi về quá khứ',
        'Ước quá khứ → had + V3',
      ],
    },
    checks: [
      {
        prompt: 'The supervisor recommended that she _____ the form again.',
        options: ['submits', 'submitted', 'submit', 'submitting'],
        answer: 2,
        explanation: 'Recommend that + chủ ngữ + động từ nguyên thể submit.',
      },
      {
        prompt: 'I wish I _____ the deadline yesterday.',
        options: ['know', 'knew', 'had known', 'will know'],
        answer: 2,
        explanation: 'Yesterday là điều đã qua; wish + had + V3.',
      },
    ],
  },
  {
    slug: 'cau-hoi-va-gian-tiep',
    title: 'Câu hỏi & lời nói gián tiếp',
    stage: 'Mở rộng',
    summary: 'Đọc câu hỏi trực tiếp, câu hỏi gián tiếp và lời thuật lại.',
    goal: 'Giữ trật tự từ đúng khi một câu hỏi nằm trong câu khác.',
    part: 'part-6',
    rules: [
      {
        label: 'Câu hỏi trực tiếp',
        pattern: 'Where is the office?',
        use: 'Đảo trợ động từ hoặc be lên trước chủ ngữ.',
      },
      {
        label: 'Câu hỏi gián tiếp',
        pattern: 'Could you tell me where the office is?',
        use: 'Trong mệnh đề hỏi gián tiếp, trở về trật tự chủ ngữ + động từ.',
      },
      {
        label: 'Tường thuật',
        pattern: 'She said that the report was ready.',
        use: 'Khi động từ tường thuật ở quá khứ, thì thường lùi nếu bối cảnh yêu cầu.',
      },
      {
        label: 'Yes/no gián tiếp',
        pattern: 'asked whether / if + subject + verb',
        use: 'Dùng whether/if thay cho đảo câu hỏi trực tiếp.',
      },
    ],
    examples: [
      {
        english: 'Please tell me when the interview begins.',
        vietnamese: 'Vui lòng cho tôi biết buổi phỏng vấn bắt đầu khi nào.',
        clue: 'when the interview begins có trật tự mệnh đề trần thuật.',
      },
      {
        english: 'She asked whether the invoice had been paid.',
        vietnamese: 'Cô ấy hỏi liệu hóa đơn đã được thanh toán chưa.',
        clue: 'whether mở câu hỏi yes/no gián tiếp.',
      },
    ],
    trap: 'Could you tell me where is the office? sai trật tự ở phần câu hỏi gián tiếp.',
    visual: {
      title: 'Đảo hay không đảo?',
      steps: ['Hỏi trực tiếp → Where is it?', 'Nằm trong câu khác', '... where it is'],
    },
    checks: [
      {
        prompt: 'Do you know when _____?',
        options: [
          'does the train leave',
          'the train leaves',
          'leaves the train',
          'the train leave',
        ],
        answer: 1,
        explanation: 'Trong câu hỏi gián tiếp, dùng trật tự the train leaves.',
      },
      {
        prompt: 'He asked _____ the office was open on Saturday.',
        options: ['that', 'whether', 'what', 'who'],
        answer: 1,
        explanation: 'Câu hỏi có/không được dẫn bằng whether hoặc if.',
      },
    ],
  },
  {
    slug: 'cau-truc-cong-viec',
    title: 'Cấu trúc thường gặp trong công việc',
    stage: 'Mở rộng',
    summary: 'Nhớ các mẫu sai khiến, mức độ và cụm động từ hay gặp trong văn bản công việc.',
    goal: 'Nhận ra cấu trúc theo cả cụm thay vì dịch từng từ.',
    part: 'part-6',
    rules: [
      {
        label: 'Nhờ làm dịch vụ',
        pattern: 'have/get + object + V3',
        use: 'Chủ ngữ sắp xếp để người khác thực hiện việc trên object.',
      },
      {
        label: 'Yêu cầu ai làm',
        pattern: 'have + person + V; get + person + to V',
        use: 'Hai động từ sai khiến có dạng theo sau khác nhau.',
      },
      {
        label: 'Đủ/quá',
        pattern: 'adjective + enough + to V; too + adjective + to V',
        use: 'Enough nói đủ điều kiện; too nói quá mức để làm việc.',
      },
      {
        label: 'Cụm động từ',
        pattern: 'fill out a form · set up a meeting',
        use: 'Học ý nghĩa của cả cụm trong bối cảnh; particle có thể thay đổi nghĩa động từ.',
      },
    ],
    examples: [
      {
        english: 'We had the printer repaired yesterday.',
        vietnamese: 'Hôm qua chúng tôi đã cho sửa máy in.',
        clue: 'printer nhận hành động sửa: have + object + V3.',
      },
      {
        english: 'The room is large enough to hold the conference.',
        vietnamese: 'Phòng đủ rộng để tổ chức hội nghị.',
        clue: 'large + enough + to hold.',
      },
    ],
    trap: 'Have the technician repair và get the technician to repair dùng dạng động từ khác nhau.',
    visual: {
      title: 'Mẫu sai khiến',
      steps: ['have + người + V', 'get + người + to V', 'have/get + vật + V3'],
    },
    checks: [
      {
        prompt: 'We will have the air conditioner _____ tomorrow.',
        options: ['repair', 'repairing', 'repaired', 'to repair'],
        answer: 2,
        explanation: 'Máy điều hòa nhận hành động: have + object + V3 repaired.',
      },
      {
        prompt: 'The hall is _____ to seat 200 guests.',
        options: ['enough large', 'large enough', 'too large', 'large too'],
        answer: 1,
        explanation: 'Tính từ đứng trước enough: large enough to seat.',
      },
    ],
  },
];

export const GRAMMAR_STAGES: readonly GrammarStage[] = ['Nền tảng', 'Động từ', 'Nối ý', 'Mở rộng'];
