import { TestBed } from '@angular/core/testing';
import { GrammarTransformation } from './grammar-transformation';
import { GrammarSentence, GrammarTransformationDemo } from './grammar-visual.models';

const ACTIVE: GrammarSentence = {
  id: 'active',
  english: 'The team completes the report.',
  vietnamese: 'Nhóm hoàn thành báo cáo.',
  clue: 'Chủ ngữ thực hiện hành động.',
  syntax: [
    {
      kind: 'token',
      id: 'team',
      text: 'The team',
      role: 'S',
      pos: 'Cụm danh từ',
      explanation: 'Người thực hiện.',
    },
    { kind: 'text', id: 'space-1', text: ' ' },
    {
      kind: 'token',
      id: 'verb',
      text: 'completes',
      role: 'V',
      pos: 'Động từ',
      explanation: 'Hành động.',
    },
    { kind: 'text', id: 'space-2', text: ' ' },
    {
      kind: 'token',
      id: 'report',
      text: 'the report',
      role: 'O',
      pos: 'Cụm danh từ',
      explanation: 'Đối tượng của hành động.',
    },
    { kind: 'text', id: 'period', text: '.' },
  ],
};
const PASSIVE: GrammarSentence = {
  id: 'passive',
  english: 'The report is completed by the team.',
  vietnamese: 'Báo cáo được nhóm hoàn thành.',
  clue: 'Tân ngữ trở thành chủ ngữ.',
  syntax: [
    {
      kind: 'token',
      id: 'report',
      text: 'The report',
      role: 'S',
      pos: 'Cụm danh từ',
      explanation: 'Đối tượng được tác động.',
    },
    { kind: 'text', id: 'space-1', text: ' ' },
    {
      kind: 'token',
      id: 'verb',
      text: 'is completed',
      role: 'V',
      pos: 'Động từ bị động',
      explanation: 'be + V3.',
    },
    { kind: 'text', id: 'space-2', text: ' ' },
    {
      kind: 'token',
      id: 'team',
      text: 'by the team',
      role: 'M',
      pos: 'Cụm giới từ',
      explanation: 'Người thực hiện.',
    },
    { kind: 'text', id: 'period', text: '.' },
  ],
};
const DEMO: GrammarTransformationDemo = {
  id: 'passive-demo',
  title: 'Chuyển câu bị động',
  steps: [
    {
      id: 'start',
      label: 'Nhận diện',
      sentence: ACTIVE,
      explanation: 'Xác định người thực hiện và đối tượng.',
    },
    {
      id: 'convert',
      label: 'Đổi cấu trúc',
      sentence: PASSIVE,
      explanation: 'Đưa đối tượng lên đầu, giữ hiện tại đơn.',
    },
    {
      id: 'review',
      label: 'Kiểm tra',
      sentence: { ...PASSIVE, id: 'passive-review' },
      explanation: 'Đối chiếu nghĩa và hòa hợp chủ–vị.',
    },
  ],
};

describe('GrammarTransformation', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [GrammarTransformation] }).compileComponents();
    const fixture = TestBed.createComponent(GrammarTransformation);
    fixture.componentRef.setInput('demo', DEMO);
    await fixture.whenStable();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  function button(page: HTMLElement, label: string): HTMLButtonElement {
    const match = Array.from(page.querySelectorAll('button')).find((item) =>
      item.textContent?.includes(label),
    );
    if (!match) throw new Error(`Missing ${label} control`);
    return match;
  }

  it('moves through authored steps, stops at boundaries and resets', async () => {
    const { fixture, page } = await render();
    expect(page.querySelector('[role="status"]')?.textContent).toContain('Bước 1/3 · Nhận diện');
    expect(button(page, 'Bước trước').disabled).toBe(true);
    expect(button(page, 'Đặt lại').disabled).toBe(true);
    button(page, 'Bước sau').click();
    await fixture.whenStable();
    expect(page.querySelector('[role="status"]')?.textContent).toContain('Bước 2/3 · Đổi cấu trúc');
    expect(page.querySelector('.syntax-translation')?.textContent).toBe(PASSIVE.vietnamese);
    expect(page.querySelector('.transformation-explanation')?.textContent).toContain(
      'giữ hiện tại đơn',
    );
    expect(page.querySelector('[aria-current="step"]')?.textContent).toContain('Đổi cấu trúc');
    button(page, 'Bước trước').click();
    await fixture.whenStable();
    expect(page.querySelector('.syntax-translation')?.textContent).toBe(ACTIVE.vietnamese);
    button(page, 'Bước sau').click();
    await fixture.whenStable();
    button(page, 'Bước sau').click();
    await fixture.whenStable();
    expect(button(page, 'Bước sau').disabled).toBe(true);
    expect(page.querySelector('[role="status"]')?.textContent).toContain('Bước 3/3');
    button(page, 'Đặt lại').click();
    await fixture.whenStable();
    expect(page.querySelector('[role="status"]')?.textContent).toContain('Bước 1/3');
  });

  it('resets the step and token details when a new demo is shown', async () => {
    const { fixture, page } = await render();
    button(page, 'Bước sau').click();
    await fixture.whenStable();
    page.querySelector<HTMLButtonElement>('[data-syntax-id="report"]')?.click();
    await fixture.whenStable();
    expect(page.querySelector('.syntax-detail')).not.toBeNull();
    fixture.componentRef.setInput('demo', {
      ...DEMO,
      id: 'another-demo',
      title: 'Mô phỏng tiếp theo',
    });
    await fixture.whenStable();
    expect(page.querySelector('h3')?.textContent).toBe('Mô phỏng tiếp theo');
    expect(page.querySelector('[role="status"]')?.textContent).toContain('Bước 1/3');
    expect(page.querySelector('.syntax-detail')).toBeNull();
  });

  it('skips native animations when reduced motion is requested', async () => {
    const animationDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const mediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    try {
      const { fixture, page } = await render();
      button(page, 'Bước sau').click();
      await fixture.whenStable();
      expect(page.querySelector('[role="status"]')?.textContent).toContain('Bước 2/3');
      expect(animate).not.toHaveBeenCalled();
    } finally {
      if (animationDescriptor)
        Object.defineProperty(HTMLElement.prototype, 'animate', animationDescriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
      if (mediaDescriptor) Object.defineProperty(window, 'matchMedia', mediaDescriptor);
      else Reflect.deleteProperty(window, 'matchMedia');
    }
  });

  it('animates stable tokens and cancels active animations on replacement and destruction', async () => {
    const animationDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const mediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel, onfinish: null, oncancel: null }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    try {
      const { fixture, page } = await render();
      button(page, 'Bước sau').click();
      await fixture.whenStable();
      expect(animate).toHaveBeenCalledTimes(3);
      expect(page.querySelectorAll('[data-syntax-id]')).toHaveLength(3);
      fixture.componentRef.setInput('demo', { ...DEMO, id: 'replacement' });
      await fixture.whenStable();
      expect(cancel).toHaveBeenCalledTimes(3);
      button(page, 'Bước sau').click();
      await fixture.whenStable();
      fixture.destroy();
      expect(cancel).toHaveBeenCalledTimes(6);
    } finally {
      if (animationDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'animate', animationDescriptor);
      } else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
      if (mediaDescriptor) Object.defineProperty(window, 'matchMedia', mediaDescriptor);
      else Reflect.deleteProperty(window, 'matchMedia');
    }
  });

  it('reports an empty authored demo without inventing a step', async () => {
    const { fixture, page } = await render();
    fixture.componentRef.setInput('demo', { id: 'empty', title: 'Chưa có dữ liệu', steps: [] });
    await fixture.whenStable();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Chưa có các bước');
    expect(page.querySelector('.transformation-navigation')).toBeNull();
  });
});
