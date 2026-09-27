import { Chapter, KLevel, QuestionBankSource } from './question.models';
import { ExamDefinition, ScoringPolicy } from './certificate.models';
import {
  Bookmark,
  QuestionStat,
  QuizMode,
  SessionQuestionSnapshot,
  SessionResponse,
  SessionSnapshot,
} from './session.models';

export interface ResultBreakdownItem<T extends string | number> {
  readonly key: T;
  readonly total: number;
  readonly answered: number;
  readonly correct: number;
  readonly percent: number;
}

export interface AttemptResult {
  readonly score: number;
  readonly total: number;
  readonly answered: number;
  readonly percent: number;
  readonly passMark: number | null;
  readonly passed: boolean | null;
  readonly bySection?: readonly ResultBreakdownItem<string>[];
  readonly byChapter: readonly ResultBreakdownItem<Chapter>[];
  readonly byKLevel: readonly ResultBreakdownItem<KLevel>[];
}

export interface Attempt {
  readonly scoringPolicy?: ScoringPolicy;
  readonly certificateId?: string;
  readonly examDefinition?: ExamDefinition;
  readonly id: string;
  readonly sessionId: string;
  readonly mode: QuizMode;
  readonly bankVersion: string;
  readonly bankSource?: QuestionBankSource;
  readonly seed: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationSeconds: number;
  readonly completionReason: 'submitted' | 'expired';
  readonly questions: readonly SessionQuestionSnapshot[];
  readonly responses: Readonly<Record<string, SessionResponse>>;
  readonly result: AttemptResult;
}

export interface LearningSettings {
  readonly preferredExamDurationMinutes: number;
  readonly lastPracticeConfig?: unknown;
}

export interface UiPreferences {
  readonly theme: 'light' | 'dark' | 'system';
  readonly reducedMotion: boolean;
}

export interface ProgressExport {
  readonly format: 'ctfl-practice-progress' | 'certificate-practice-progress';
  readonly schemaVersion: 1 | 2;
  readonly certificateId?: string;
  readonly exportedAt: string;
  readonly activeSessions: readonly SessionSnapshot[];
  readonly attempts: readonly Attempt[];
  readonly questionStats: readonly QuestionStat[];
  readonly bookmarks: readonly Bookmark[];
  readonly settings: Readonly<Record<string, unknown>>;
}
