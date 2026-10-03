import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ContentBlocks, formatLegacyTranscript } from './content-blocks';

describe('legacy Listening transcript display', () => {
  it('places each spoken choice on its own line', () => {
    expect(
      formatLegacyTranscript([
        {
          kind: 'paragraph',
          text: 'Transcript: Where is the file? (A) On the desk. (B) At noon. (C) Yes, I did.',
        },
      ]),
    ).toEqual([
      { kind: 'heading', level: 4, text: 'Transcript' },
      { kind: 'paragraph', text: 'Where is the file?' },
      { kind: 'paragraph', text: '(A) On the desk.' },
      { kind: 'paragraph', text: '(B) At noon.' },
      { kind: 'paragraph', text: '(C) Yes, I did.' },
    ]);
  });

  it('places each speaker turn on its own line and preserves other blocks', () => {
    const note = { kind: 'paragraph' as const, text: 'The printed answer key marks C.' };
    expect(
      formatLegacyTranscript([
        { kind: 'paragraph', text: 'Transcript: M: Hello. W: Good morning. M: Please sit down.' },
        note,
      ]),
    ).toEqual([
      { kind: 'heading', level: 4, text: 'Transcript' },
      { kind: 'paragraph', text: 'M: Hello.' },
      { kind: 'paragraph', text: 'W: Good morning.' },
      { kind: 'paragraph', text: 'M: Please sit down.' },
      note,
    ]);
  });

  it('renders a saved one-line transcript as separate paragraphs', async () => {
    await TestBed.configureTestingModule({ imports: [ContentBlocks] }).compileComponents();
    const fixture = TestBed.createComponent(ContentBlocks);
    fixture.componentRef.setInput('blocks', [
      {
        kind: 'paragraph',
        text: 'Transcript: (A) First scene. (B) Second scene. (C) Third scene.',
      },
    ]);
    await fixture.whenStable();
    const rendered = fixture.nativeElement as HTMLElement;
    expect(rendered.querySelector('h4')?.textContent).toBe('Transcript');
    expect([...rendered.querySelectorAll('p')].map((item) => item.textContent)).toEqual([
      '(A) First scene.',
      '(B) Second scene.',
      '(C) Third scene.',
    ]);
  });
});
