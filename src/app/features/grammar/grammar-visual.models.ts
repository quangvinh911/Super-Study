export type SyntaxRole = 'S' | 'V' | 'O' | 'C' | 'M';

export type SyntaxNode =
  | { readonly kind: 'text'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'token';
      readonly id: string;
      readonly text: string;
      readonly role: SyntaxRole;
      readonly pos: string;
      readonly explanation: string;
      readonly wordFormation?: string;
      readonly distractor?: string;
    }
  | {
      readonly kind: 'group';
      readonly id: string;
      readonly label: string;
      readonly role?: SyntaxRole;
      readonly children: readonly SyntaxNode[];
    };

export interface GrammarSentence {
  readonly id: string;
  readonly english: string;
  readonly vietnamese: string;
  readonly clue: string;
  readonly syntax: readonly SyntaxNode[];
}

export type TensePeriod = 'past' | 'present' | 'future';
export type TenseAspect = 'simple' | 'continuous' | 'perfect' | 'perfect-continuous';

export interface TenseExample {
  readonly id: string;
  readonly period: TensePeriod;
  readonly aspect: TenseAspect;
  readonly label: string;
  readonly formula: string;
  readonly sentence: GrammarSentence;
  readonly description: string;
  readonly diagram: {
    readonly shape: 'routine' | 'point' | 'duration' | 'perfect' | 'perfect-duration';
    readonly start: number;
    readonly end: number;
    readonly reference: number;
  };
}

export interface GrammarTransformationDemo {
  readonly id: string;
  readonly title: string;
  readonly steps: readonly {
    readonly id: string;
    readonly label: string;
    readonly sentence: GrammarSentence;
    readonly explanation: string;
  }[];
}
