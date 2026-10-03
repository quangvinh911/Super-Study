import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ContentBlock } from '../../core/models';

export function formatLegacyTranscript(blocks: readonly ContentBlock[]): readonly ContentBlock[] {
  return blocks.flatMap((block) => {
    if (block.kind !== 'paragraph' || !block.text.startsWith('Transcript: ')) return [block];

    const transcript = block.text.slice('Transcript: '.length);
    const formatted: ContentBlock[] = [{ kind: 'heading', level: 4, text: 'Transcript' }];
    const choices = [...transcript.matchAll(/\(([A-D])\)\s*/g)];
    const labels = choices.map((match) => match[1]).join('');
    const firstChoice = choices.at(0);
    if ((labels === 'ABC' || labels === 'ABCD') && firstChoice) {
      const question = transcript.slice(0, firstChoice.index).trim();
      if (question) formatted.push({ kind: 'paragraph', text: question });
      for (const [index, choice] of choices.entries()) {
        const end = choices[index + 1]?.index ?? transcript.length;
        formatted.push({
          kind: 'paragraph',
          text: `(${choice[1]}) ${transcript.slice(choice.index + choice[0].length, end).trim()}`,
        });
      }
      return formatted;
    }

    const turns = transcript
      .split(/(?=\b[MW]:\s)/)
      .map((turn) => turn.trim())
      .filter(Boolean);
    formatted.push(...turns.map((text) => ({ kind: 'paragraph' as const, text })));
    return formatted;
  });
}

@Component({
  selector: 'app-content-blocks',
  templateUrl: './content-blocks.html',
  styleUrl: './content-blocks.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentBlocks {
  readonly blocks = input.required<readonly ContentBlock[]>();
  readonly displayBlocks = computed(() => formatLegacyTranscript(this.blocks()));
}
