import {
  Chapter,
  KLevel,
  Question,
  QuestionBankSource,
  QuestionStyleTag,
  Solution,
} from './question.models';

export type QuizMode = 'practice' | 'exam';
export type SessionStatus = 'active' | 'completed' | 'expired';
export type PracticeHistoryFilter = 'unseen' | 'incorrect' | 'bookmarked';

export interface PracticeConfig {
  readonly chapters?: readonly Chapter[];
  readonly sections?: readonly string[];
  readonly learningObjectives?: readonly string[];
  readonly kLevels?: readonly KLevel[];
  readonly styleTags?: readonly QuestionStyleTag[];
  /** Selected history states are ORed; all classification filters are ANDed. */
  readonly history?: readonly PracticeHistoryFilter[];
  readonly questionLimit?: number;
  readonly shuffleQuestions?: boolean;
  readonly seed?: string | number;
}

export interface SessionQuestionSnapshot {
  readonly question: Question;
  readonly solution: Solution;
}

export interface SessionResponse {
  readonly questionId: string;
  readonly selectedOptionIds: readonly string[];
  readonly checked: boolean;
  readonly flagged: boolean;
  readonly isCorrect?: boolean;
  readonly answeredAt?: string;
}

/**
 * Contains complete question/solution revisions, not just IDs. Historical
 * attempts therefore remain reproducible after a question-bank update.
 */
export interface SessionSnapshot {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly mode: QuizMode;
  readonly bankVersion: string;
  readonly bankSource?: QuestionBankSource;
  readonly seed: string;
  readonly status: SessionStatus;
  readonly createdAt: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly deadlineAt?: string;
  readonly durationMinutes?: 60 | 75;
  readonly currentIndex: number;
  readonly questions: readonly SessionQuestionSnapshot[];
  readonly responses: Readonly<Record<string, SessionResponse>>;
  readonly practiceConfig?: PracticeConfig;
}

export interface StartPracticeInput {
  readonly bankVersion: string;
  readonly bankSource?: QuestionBankSource;
  readonly questions: readonly Question[];
  readonly solutions: readonly Solution[];
  readonly config?: PracticeConfig;
  readonly progress?: PracticeProgressContext;
  readonly now?: Date;
}

export interface StartExamInput {
  readonly bankVersion: string;
  readonly bankSource?: QuestionBankSource;
  readonly questions: readonly Question[];
  readonly solutions: readonly Solution[];
  readonly durationMinutes: 60 | 75;
  readonly generation?: 'blueprint' | 'random40';
  readonly seed?: string | number;
  readonly now?: Date;
}

export interface PracticeProgressContext {
  readonly stats?: ReadonlyMap<string, QuestionStat> | Readonly<Record<string, QuestionStat>>;
  readonly bookmarkedQuestionIds?: ReadonlySet<string> | readonly string[];
}

export interface QuestionStat {
  readonly questionId: string;
  readonly revision: number;
  readonly seenCount: number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  readonly currentCorrectStreak: number;
  readonly lastCorrect?: boolean;
  readonly lastAnsweredAt?: string;
  readonly updatedAt: string;
}

export interface Bookmark {
  readonly questionId: string;
  readonly revision: number;
  readonly createdAt: string;
}
