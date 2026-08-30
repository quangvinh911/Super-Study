import { ContentBlock } from './content.models';

export type Chapter = 1 | 2 | 3 | 4 | 5 | 6;
export type KLevel = 'K1' | 'K2' | 'K3';
export type InteractionKind = 'singleChoice' | 'multiSelect';

export type QuestionStyleTag =
  | 'directKnowledge'
  | 'scenario'
  | 'statementEvaluation'
  | 'calculation'
  | 'ordering'
  | 'tableOrDiagram'
  | 'TRUE'
  | 'FALSE'
  | 'BEST'
  | 'MOST'
  | 'NOT'
  | 'MINIMAL';

export interface QuestionOption {
  readonly id: string;
  readonly content: readonly ContentBlock[];
}

export interface QuestionInteraction {
  readonly kind: InteractionKind;
  readonly requiredSelections: number;
}

export interface QuestionClassification {
  readonly chapter: Chapter;
  readonly section: string;
  readonly learningObjective: string;
  readonly blueprintBucket: string;
  readonly kLevel: KLevel;
  readonly styleTags: readonly QuestionStyleTag[];
}

export interface Provenance {
  readonly kind: 'original';
  readonly authoringNote: string;
  readonly rightsStatus: 'cleared' | 'pending' | 'restricted';
}

export interface Verification {
  readonly answerStatus: 'verified' | 'pending' | 'rejected';
  readonly reviewedAgainst: string;
  readonly reviewedAt: string;
}

export interface Question {
  readonly id: string;
  readonly revision: number;
  readonly language: 'en';
  readonly stem: readonly ContentBlock[];
  readonly options: readonly QuestionOption[];
  readonly interaction: QuestionInteraction;
  readonly classification: QuestionClassification;
  readonly shuffleOptions: boolean;
  readonly provenance: Provenance;
  readonly verification: Verification;
  readonly variant?: 'A' | 'B';
}

export interface EvidenceReference {
  readonly title: string;
  readonly version: string;
  readonly locator: string;
  readonly url?: string;
}

export interface Solution {
  readonly questionId: string;
  readonly correctOptionIds: readonly string[];
  readonly explanation: readonly ContentBlock[];
  readonly optionRationales?: Readonly<Record<string, readonly ContentBlock[]>>;
  readonly references: readonly EvidenceReference[];
}

export interface QuestionEnvelope {
  readonly schemaVersion: string;
  readonly bankVersion: string;
  readonly questions: readonly Question[];
}

export interface SolutionEnvelope {
  readonly schemaVersion: string;
  readonly bankVersion: string;
  readonly solutions: readonly Solution[];
}

export interface BlueprintManifestCell {
  readonly chapter: Chapter;
  readonly kLevel: KLevel;
  readonly count: number;
}

export interface QuestionBankManifest {
  readonly schemaVersion: string;
  readonly bankVersion: string;
  readonly publishedAt: string;
  readonly syllabusVersion: string;
  readonly language: 'en';
  readonly questionCount: number;
  readonly solutionCount: number;
  readonly blueprint: readonly BlueprintManifestCell[];
  readonly files: {
    readonly questions: string;
    readonly solutions: string;
  };
}

export interface LoadedQuestionBank {
  readonly manifest: QuestionBankManifest;
  readonly questions: readonly Question[];
  readonly solutions: readonly Solution[];
}
