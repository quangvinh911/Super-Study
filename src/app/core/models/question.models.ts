import { ContentBlock } from './content.models';

export type Chapter = 1 | 2 | 3 | 4 | 5 | 6;
export type KLevel = 'K1' | 'K2' | 'K3';
export type InteractionKind = 'singleChoice' | 'multiSelect';
export type QuestionBankSource = string;

export type QuestionStyleTag =
  | (string & {})
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
  readonly chapter?: Chapter;
  readonly section: string;
  readonly learningObjective?: string;
  readonly blueprintBucket?: string;
  readonly kLevel?: KLevel;
  readonly styleTags: readonly QuestionStyleTag[];
}

export interface Provenance {
  readonly kind: 'original' | 'sourceExcerpt';
  readonly authoringNote: string;
  readonly rightsStatus: 'cleared' | 'pending' | 'restricted' | 'privateUserProvided';
  readonly sourceDocument?: string;
  readonly sourceQuestionNumber?: number;
}

export interface Verification {
  readonly answerStatus:
    'verified' | 'pending' | 'rejected' | 'sourcePrinted' | 'sourceAnomalyCorrected';
  readonly classificationStatus?: 'topicMappedAgainstCtflV4.0.1';
  readonly reviewedAgainst: string;
  readonly reviewedAt: string;
}

export interface SourceEvidence {
  readonly questionImage: string;
  readonly answerImage: string;
  readonly questionPages: readonly number[];
  readonly answerPages: readonly number[];
  readonly rawAnswer: string;
  readonly answerNote?: string | null;
}

export interface Question {
  readonly certificateId?: string;
  /** A complete authored exam form; never mix passages/audio across forms. */
  readonly formId?: string;
  readonly order?: number;
  readonly stimulus?: { readonly id: string; readonly content: readonly ContentBlock[] };
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
  readonly sourceEvidence?: SourceEvidence;
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
  readonly certificateId?: string;
  readonly schemaVersion: string;
  readonly bankVersion: string;
  readonly publishedAt: string;
  readonly syllabusVersion: string;
  readonly language: 'en';
  readonly sourceKind?: 'original' | 'privatePdf';
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
