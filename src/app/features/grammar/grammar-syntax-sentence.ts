import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { GrammarSentence, SyntaxNode, SyntaxRole } from './grammar-visual.models';

type SyntaxToken = Extract<SyntaxNode, { kind: 'token' }>;

function findToken(nodes: readonly SyntaxNode[], id: string | null): SyntaxToken | undefined {
  for (const node of nodes) {
    if (node.kind === 'token' && node.id === id) return node;
    if (node.kind === 'group') {
      const match = findToken(node.children, id);
      if (match) return match;
    }
  }
  return undefined;
}

@Component({
  selector: 'app-grammar-syntax-sentence',
  imports: [NgTemplateOutlet],
  templateUrl: './grammar-syntax-sentence.html',
  styleUrl: './grammar-syntax-sentence.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrammarSyntaxSentence {
  readonly sentence = input.required<GrammarSentence>();
  readonly showLegend = input(false);
  protected readonly roles: readonly SyntaxRole[] = ['S', 'V', 'O', 'C', 'M'];
  protected readonly roleLabels: Readonly<Record<SyntaxRole, string>> = {
    S: 'Chủ ngữ',
    V: 'Động từ',
    O: 'Tân ngữ',
    C: 'Bổ ngữ',
    M: 'Thành phần bổ nghĩa',
  };
  private readonly selectedTokenId = linkedSignal<GrammarSentence, string | null>({
    source: this.sentence,
    computation: () => null,
  });
  protected readonly selectedToken = computed(() =>
    findToken(this.sentence().syntax, this.selectedTokenId()),
  );
  private selectedButton: HTMLButtonElement | undefined;

  protected roleLabel(role: SyntaxRole): string {
    return this.roleLabels[role];
  }

  protected selectToken(token: SyntaxToken, button: HTMLButtonElement): void {
    this.selectedButton = button;
    this.selectedTokenId.set(token.id);
  }

  protected closeDetails(): void {
    if (!this.selectedToken()) return;
    this.selectedTokenId.set(null);
    if (this.selectedButton?.isConnected) this.selectedButton.focus();
    this.selectedButton = undefined;
  }
}
