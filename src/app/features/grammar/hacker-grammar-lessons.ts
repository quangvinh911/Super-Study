import type { GrammarLesson } from './grammar-lessons';

/** Authored explanations and exercises based on reviewed Hacker 3 topic coverage, not copied questions. */
export const HACKER_GRAMMAR_LESSONS: readonly GrammarLesson[] = [
  {
    slug: 'other-another-va-dai-tu-bat-dinh',
    title: 'Other, another & đại từ bất định',
    stage: 'Nền tảng',
    summary: 'Phân biệt từ đứng trước danh từ với đại từ đứng một mình.',
    goal: 'Chọn other, another, others, those và đại từ tương hỗ theo cấu trúc.',
    part: 'part-5',
    rules: [
      {
        label: 'Một đối tượng khác',
        pattern: 'another + singular countable noun',
        use: 'Another chỉ thêm một hoặc một đối tượng khác chưa xác định; the other chỉ đối tượng còn lại trong hai đối tượng đã xác định.',
      },
      {
        label: 'Nhiều đối tượng khác',
        pattern: 'other + plural noun; others; the others',
        use: 'Other cần danh từ đi sau; others thay cho các đối tượng khác; the others chỉ những đối tượng còn lại trong một nhóm đã xác định. Other cũng có thể đứng trước danh từ không đếm được, như other information.',
      },
      {
        label: 'Người được mô tả',
        pattern: 'anyone who + singular verb; those who + plural verb',
        use: 'Anyone chỉ bất cứ người nào và đi với động từ số ít; those có thể chỉ những người được mô tả ở phía sau.',
      },
      {
        label: 'Tương hỗ và phản thân',
        pattern: 'help one another / each other; introduce oneself',
        use: 'One another và each other diễn tả tác động qua lại; đại từ phản thân diễn tả hành động hướng về chính chủ ngữ. By oneself có nghĩa là một mình hoặc tự làm.',
      },
    ],
    examples: [
      {
        ruleLabel: 'Nhiều đối tượng khác',
        english: 'Some files are ready; others need approval.',
        vietnamese: 'Một số hồ sơ đã sẵn sàng; các hồ sơ khác cần phê duyệt.',
        clue: 'Others đứng một mình và thay cho other files.',
      },
      {
        ruleLabel: 'Tương hỗ và phản thân',
        english: 'The colleagues help one another during busy periods.',
        vietnamese: 'Các đồng nghiệp giúp đỡ lẫn nhau trong thời gian bận rộn.',
        clue: 'Họ giúp nhau, nên dùng đại từ tương hỗ.',
      },
    ],
    trap: 'Không dùng others documents; dùng other documents. Anyone who needs khác với those who need.',
    visual: {
      title: 'Chọn đại từ theo đối tượng',
      steps: [
        'Có danh từ theo sau?',
        'Một hay nhiều đối tượng?',
        'Nhóm đã xác định?',
        'Tác động vào mình hay lẫn nhau?',
      ],
    },
    checks: [
      {
        prompt: 'This monitor is faulty. Please bring _____ monitor from storage.',
        options: ['another', 'others', 'each other', 'anyone'],
        answer: 0,
        explanation: 'Monitor là danh từ đếm được số ít; another monitor là một màn hình khác.',
      },
      {
        prompt: '_____ who wishes to attend must register by Friday.',
        options: ['Those', 'Anyone', 'All', 'Others'],
        answer: 1,
        explanation:
          'Wishes là động từ số ít, phù hợp với anyone who; those/all/others who cần wish.',
      },
    ],
  },
  {
    slug: 'trang-tu-va-tu-nhan-manh',
    title: 'Trạng từ & từ nhấn mạnh',
    stage: 'Mở rộng',
    summary: 'Đọc phạm vi bổ nghĩa để hiểu mức độ, thời điểm và giới hạn.',
    goal: 'Phân biệt nearly, even, only, still, yet và trạng từ bổ nghĩa tính từ.',
    part: 'part-5',
    rules: [
      {
        label: 'Bổ nghĩa tính từ',
        pattern: 'adverb + adjective / participle adjective',
        use: 'Trạng từ diễn tả mức độ của tính từ, như fully operational hoặc overwhelmingly positive; không chọn tính từ chỉ vì chỗ trống đứng sau be.',
      },
      {
        label: 'Gần như và ngay cả',
        pattern: 'nearly / almost / practically + all; even + noun phrase',
        use: 'Nearly, almost và practically diễn tả gần như toàn bộ; even nhấn mạnh một trường hợp bất ngờ. Chọn theo nghĩa, không chỉ vị trí.',
      },
      {
        label: 'Còn và chưa',
        pattern: 'still + verb; have not + yet + V3',
        use: 'Still diễn tả tình trạng tiếp tục; not yet diễn tả việc chưa xảy ra tới thời điểm xét. Already chỉ việc đã xảy ra; yet cũng thường đứng cuối câu.',
      },
      {
        label: 'Phạm vi giới hạn',
        pattern: 'only after + event; not necessarily + adjective / V3',
        use: 'Only after giới hạn thời điểm cho phép hành động; not necessarily nghĩa là không nhất thiết. Vị trí only quyết định thành phần được giới hạn.',
      },
    ],
    examples: [
      {
        ruleLabel: 'Bổ nghĩa tính từ',
        english: 'The new payment system is fully operational.',
        vietnamese: 'Hệ thống thanh toán mới đã vận hành đầy đủ.',
        clue: 'Fully bổ nghĩa cho tính từ operational.',
      },
      {
        ruleLabel: 'Phạm vi giới hạn',
        english: 'Refunds are issued only after the returned goods are inspected.',
        vietnamese: 'Tiền chỉ được hoàn sau khi hàng trả lại được kiểm tra.',
        clue: 'Only giới hạn điều kiện thời gian after, không bổ nghĩa cho goods.',
      },
    ],
    trap: 'Not necessarily guaranteed nghĩa là không nhất thiết được bảo đảm; không có nghĩa là chắc chắn không được bảo đảm.',
    visual: {
      title: 'Tìm phạm vi bổ nghĩa',
      steps: [
        'Xác định từ được bổ nghĩa',
        'Mức độ hay thời gian?',
        'Kiểm tra phủ định',
        'Đọc nghĩa cả câu',
      ],
    },
    checks: [
      {
        prompt: 'The reviews of the new service are _____ positive.',
        options: ['overwhelming', 'overwhelmingly', 'overwhelm', 'overwhelmed'],
        answer: 1,
        explanation: 'Trước tính từ positive cần trạng từ overwhelmingly chỉ mức độ.',
      },
      {
        prompt: 'The team has not _____ received the signed contract.',
        options: ['yet', 'ever since', 'soon', 'no longer'],
        answer: 0,
        explanation: 'Has not yet received diễn tả đến nay nhóm vẫn chưa nhận được hợp đồng.',
      },
    ],
  },
  {
    slug: 'lien-tu-cap-va-cau-truc-song-song',
    title: 'Liên từ cặp & cấu trúc song song',
    stage: 'Nối ý',
    summary: 'Nối các thành phần cùng chức năng và phân biệt điều kiện với lựa chọn.',
    goal: 'Dùng both–and, either–or, neither–nor, whether–or và unless đúng nghĩa.',
    part: 'part-5',
    rules: [
      {
        label: 'Liên từ cặp',
        pattern: 'both A and B; either A or B; neither A nor B',
        use: 'Both–and khẳng định cả hai; either–or đưa ra lựa chọn; neither–nor phủ định cả hai. A và B cần cùng chức năng ngữ pháp.',
      },
      {
        label: 'Song song',
        pattern: 'to review and approve; reviewing and approving',
        use: 'Nối danh từ với danh từ, cụm động từ với cụm động từ. Một to hoặc modal có thể dùng chung cho hai động từ nguyên mẫu.',
      },
      {
        label: 'Hai khả năng',
        pattern: 'whether + clause + or + alternative',
        use: 'Whether–or nêu hai khả năng, có thể mang nghĩa bất kể lựa chọn nào. Either không thay được whether khi cần một từ mở đầu mệnh đề.',
      },
      {
        label: 'Điều kiện và hậu quả',
        pattern: 'unless + clause; imperative + or + clause',
        use: 'Unless thường tương đương if not; mệnh lệnh + or có thể cảnh báo hậu quả nếu không làm. Unless otherwise stated là dạng rút gọn của unless it is otherwise stated.',
      },
    ],
    examples: [
      {
        ruleLabel: 'Song song',
        english: 'The supervisor will review and approve the request.',
        vietnamese: 'Người giám sát sẽ xem xét và phê duyệt yêu cầu.',
        clue: 'Will dùng chung cho hai động từ nguyên mẫu review và approve.',
      },
      {
        ruleLabel: 'Hai khả năng',
        english: 'The fee is the same whether you pay online or at the counter.',
        vietnamese: 'Mức phí như nhau dù bạn thanh toán trực tuyến hay tại quầy.',
        clue: 'Whether mở đầu mệnh đề you pay, rồi or nêu lựa chọn khác.',
      },
    ],
    trap: 'Neither of the two applicants has replied dùng neither như đại từ; neither A nor B là cấu trúc liên từ cặp.',
    visual: {
      title: 'Nối ý đúng cấu trúc',
      steps: [
        'Khẳng định hay phủ định?',
        'Cụm từ hay mệnh đề?',
        'Hai vế cùng chức năng?',
        'Lựa chọn hay điều kiện?',
      ],
    },
    checks: [
      {
        prompt: 'The report includes both the sales figures _____ the operating costs.',
        options: ['and', 'or', 'nor', 'whether'],
        answer: 0,
        explanation: 'Both kết hợp với and để nối hai cụm danh từ cùng chức năng.',
      },
      {
        prompt: 'The discount applies _____ customers pay by card or in cash.',
        options: ['either', 'whether', 'neither', 'both'],
        answer: 1,
        explanation: 'Whether mở đầu mệnh đề customers pay và kết hợp với or để nêu hai khả năng.',
      },
    ],
  },
];
