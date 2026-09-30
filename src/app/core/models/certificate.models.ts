import type { QuestionBankSource } from './question.models';

export type ScoringPolicy =
  { readonly kind: 'threshold'; readonly passPercent: number } | { readonly kind: 'raw' };

export interface ExamPart {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface ExamSection {
  readonly id: string;
  readonly label: string;
  readonly durationMinutes: number;
  readonly parts: readonly ExamPart[];
}

export interface ExamDefinition {
  readonly id: string;
  readonly label: string;
  readonly questionCount: number;
  readonly durations: readonly number[];
  readonly generation: 'ctflBlueprint' | 'sections' | 'random';
  readonly scoring: ScoringPolicy;
  readonly sections?: readonly ExamSection[];
}

export interface CertificateDefinition {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly description: string;
  readonly catalogGroup: 'language' | 'professional';
  readonly catalogHighlights: readonly string[];
  readonly learningResources?: readonly {
    readonly label: string;
    readonly path: string;
    readonly description: string;
  }[];
  readonly taxonomy: 'syllabus' | 'sections';
  readonly topics?: readonly { readonly id: string; readonly label: string }[];
  readonly banks: readonly {
    readonly id: QuestionBankSource;
    readonly label: string;
    readonly description: string;
    readonly manifestUrl: string;
  }[];
  readonly exam: ExamDefinition;
  readonly references: readonly { readonly title: string; readonly url: string }[];
}
