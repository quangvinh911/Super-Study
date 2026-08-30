import { computed, Injectable, OnDestroy, signal } from '@angular/core';
import {
  calculateAttemptResult,
  createPracticeQuestions,
  generateCtflExam,
  scoreQuestion,
  validateSelection,
} from '../domain';
import {
  Attempt,
  SessionQuestionSnapshot,
  SessionResponse,
  SessionSnapshot,
  StartExamInput,
  StartPracticeInput,
} from '../models';
import { ProgressRepository } from '../persistence';

const LEASE_TTL_MS = 15_000;
const LEASE_RENEW_EVERY_TICKS = 5;
const WARNING_MINUTES = [1, 5, 10] as const;

export type DeadlineWarningMinutes = (typeof WARNING_MINUTES)[number];

export interface DeadlineHooks {
  readonly onWarning?: (minutesRemaining: DeadlineWarningMinutes) => void;
  readonly onAutoSubmit?: (attempt: Attempt) => void;
}

export class SessionLockedError extends Error {
  constructor(readonly sessionId: string) {
    super('This mock exam is already active in another browser tab.');
    this.name = 'SessionLockedError';
  }
}

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function immutable<T>(value: T): T {
  return deepFreeze(clone(value));
}

function identifier(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `${prefix}-${uuid}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function tabOwnerIdentifier(): string {
  const storageKey = 'ctfl-practice-tab-owner';
  try {
    const existing = globalThis.sessionStorage?.getItem(storageKey);
    if (existing) {
      return existing;
    }
    const created = identifier('tab');
    globalThis.sessionStorage?.setItem(storageKey, created);
    return created;
  } catch {
    return identifier('tab');
  }
}

function initialResponses(
  questions: readonly SessionQuestionSnapshot[],
): Readonly<Record<string, SessionResponse>> {
  return Object.fromEntries(
    questions.map(({ question }) => [
      question.id,
      {
        questionId: question.id,
        selectedOptionIds: [],
        checked: false,
        flagged: false,
      } satisfies SessionResponse,
    ]),
  );
}

@Injectable({ providedIn: 'root' })
export class QuizSessionStore implements OnDestroy {
  private readonly snapshotState = signal<SessionSnapshot | null>(null);
  private readonly remainingMsState = signal<number | null>(null);
  private readonly deadlineWarningState = signal<DeadlineWarningMinutes | null>(null);
  private readonly lastAttemptState = signal<Attempt | null>(null);
  private readonly persistenceErrorState = signal<unknown>(null);

  readonly snapshot = this.snapshotState.asReadonly();
  readonly remainingMs = this.remainingMsState.asReadonly();
  readonly deadlineWarning = this.deadlineWarningState.asReadonly();
  readonly lastAttempt = this.lastAttemptState.asReadonly();
  readonly persistenceError = this.persistenceErrorState.asReadonly();

  readonly currentQuestion = computed(() => {
    const snapshot = this.snapshotState();
    return snapshot?.questions[snapshot.currentIndex];
  });
  readonly currentResponse = computed(() => {
    const questionId = this.currentQuestion()?.question.id;
    return questionId ? this.snapshotState()?.responses[questionId] : undefined;
  });
  readonly isActive = computed(() => this.snapshotState()?.status === 'active');
  readonly isComplete = computed(() => {
    const status = this.snapshotState()?.status;
    return status === 'completed' || status === 'expired';
  });
  readonly progress = computed(() => {
    const snapshot = this.snapshotState();
    const total = snapshot?.questions.length ?? 0;
    const current = total === 0 ? 0 : (snapshot?.currentIndex ?? 0) + 1;
    return { current, total, percent: total === 0 ? 0 : (current / total) * 100 };
  });
  readonly unansweredCount = computed(() => {
    const snapshot = this.snapshotState();
    if (!snapshot) {
      return 0;
    }
    return snapshot.questions.filter(
      ({ question }) =>
        (snapshot.responses[question.id]?.selectedOptionIds.length ?? 0) === 0,
    ).length;
  });

  private readonly ownerId = tabOwnerIdentifier();
  private persistenceQueue: Promise<void> = Promise.resolve();
  private monitorTimer?: ReturnType<typeof globalThis.setInterval>;
  private tickCount = 0;
  private tickRunning = false;
  private ownsLease = true;
  private hooks: DeadlineHooks = {};
  private warned = new Set<DeadlineWarningMinutes>();
  private submitPromise?: Promise<Attempt | null>;

  constructor(private readonly repository: ProgressRepository) {}

  setDeadlineHooks(hooks: DeadlineHooks): void {
    this.hooks = hooks;
  }

  async startPractice(input: StartPracticeInput): Promise<SessionSnapshot> {
    await this.detachCurrent();
    const id = identifier('practice');
    const seed = String(input.config?.seed ?? id);
    const config = { ...input.config, seed };
    const questions = createPracticeQuestions(
      input.questions,
      input.solutions,
      config,
      input.progress,
    );
    if (questions.length === 0) {
      throw new Error('No verified, rights-cleared questions match the practice filters.');
    }
    const now = input.now ?? new Date();
    const timestamp = now.toISOString();
    const snapshot: SessionSnapshot = {
      schemaVersion: 1,
      id,
      mode: 'practice',
      bankVersion: input.bankVersion,
      seed,
      status: 'active',
      createdAt: timestamp,
      startedAt: timestamp,
      updatedAt: timestamp,
      currentIndex: 0,
      questions,
      responses: initialResponses(questions),
      practiceConfig: config,
    };
    this.ownsLease = true;
    this.install(snapshot);
    await this.repository.saveActiveSession(snapshot);
    return immutable(snapshot);
  }

  async startExam(input: StartExamInput): Promise<SessionSnapshot> {
    await this.detachCurrent();
    const id = identifier('exam');
    const seed = String(input.seed ?? id);
    const questions = generateCtflExam(input.questions, input.solutions, { seed });
    const now = input.now ?? new Date();
    const timestamp = now.toISOString();
    const snapshot: SessionSnapshot = {
      schemaVersion: 1,
      id,
      mode: 'exam',
      bankVersion: input.bankVersion,
      seed,
      status: 'active',
      createdAt: timestamp,
      startedAt: timestamp,
      updatedAt: timestamp,
      deadlineAt: new Date(now.getTime() + input.durationMinutes * 60_000).toISOString(),
      durationMinutes: input.durationMinutes,
      currentIndex: 0,
      questions,
      responses: initialResponses(questions),
    };
    if (!(await this.repository.acquireSessionLease(id, this.ownerId, LEASE_TTL_MS))) {
      throw new SessionLockedError(id);
    }
    this.ownsLease = true;
    this.install(snapshot);
    await this.repository.saveActiveSession(snapshot);
    this.startMonitoring();
    await this.tick(now);
    return immutable(snapshot);
  }

  async restore(sessionId: string): Promise<boolean> {
    await this.detachCurrent();
    const snapshot = await this.repository.getActiveSession(sessionId);
    if (!snapshot || snapshot.status !== 'active') {
      return false;
    }
    if (
      snapshot.mode === 'exam' &&
      !(await this.repository.acquireSessionLease(
        snapshot.id,
        this.ownerId,
        LEASE_TTL_MS,
      ))
    ) {
      throw new SessionLockedError(snapshot.id);
    }
    this.ownsLease = true;
    this.install(snapshot);
    if (snapshot.mode === 'exam') {
      this.startMonitoring();
      await this.tick();
    }
    return true;
  }

  selectOption(optionId: string, selected?: boolean): boolean {
    const snapshot = this.requireEditable();
    const item = snapshot.questions[snapshot.currentIndex];
    if (!item) {
      return false;
    }
    const response = snapshot.responses[item.question.id]!;
    if (snapshot.mode === 'practice' && response.checked) {
      return false;
    }
    if (!item.question.options.some((option) => option.id === optionId)) {
      return false;
    }

    const existing = [...response.selectedOptionIds];
    const alreadySelected = existing.includes(optionId);
    const shouldSelect = selected ?? !alreadySelected;
    let optionIds: string[];
    if (item.question.interaction.kind === 'singleChoice') {
      optionIds = shouldSelect ? [optionId] : [];
    } else if (shouldSelect && !alreadySelected) {
      if (existing.length >= item.question.interaction.requiredSelections) {
        return false;
      }
      optionIds = [...existing, optionId];
    } else if (!shouldSelect && alreadySelected) {
      optionIds = existing.filter((id) => id !== optionId);
    } else {
      return true;
    }

    this.replaceResponse(snapshot, item.question.id, {
      ...response,
      selectedOptionIds: optionIds,
      checked: false,
      isCorrect: undefined,
      answeredAt: optionIds.length > 0 ? new Date().toISOString() : undefined,
    });
    return true;
  }

  async checkCurrent(): Promise<boolean | null> {
    const snapshot = this.requireEditable();
    if (snapshot.mode !== 'practice') {
      return null;
    }
    const item = snapshot.questions[snapshot.currentIndex];
    if (!item) {
      return null;
    }
    const response = snapshot.responses[item.question.id]!;
    if (response.checked) {
      return response.isCorrect ?? false;
    }
    if (!validateSelection(item.question, response.selectedOptionIds)) {
      return null;
    }
    const correct = scoreQuestion(item.solution, response);
    const answeredAt = new Date().toISOString();
    this.replaceResponse(snapshot, item.question.id, {
      ...response,
      checked: true,
      isCorrect: correct,
      answeredAt,
    });
    await Promise.all([
      this.flushPersistence(),
      this.repository.recordQuestionResult(
        item.question.id,
        item.question.revision,
        correct,
        answeredAt,
      ),
    ]);
    return correct;
  }

  goTo(index: number): void {
    const snapshot = this.requireEditable();
    if (!Number.isInteger(index) || index < 0 || index >= snapshot.questions.length) {
      return;
    }
    this.updateSnapshot(snapshot, { currentIndex: index });
  }

  next(): void {
    const snapshot = this.requireEditable();
    this.goTo(Math.min(snapshot.currentIndex + 1, snapshot.questions.length - 1));
  }

  previous(): void {
    const snapshot = this.requireEditable();
    this.goTo(Math.max(snapshot.currentIndex - 1, 0));
  }

  toggleFlag(): void {
    const snapshot = this.requireEditable();
    const item = snapshot.questions[snapshot.currentIndex];
    if (!item) {
      return;
    }
    const response = snapshot.responses[item.question.id]!;
    this.replaceResponse(snapshot, item.question.id, {
      ...response,
      flagged: !response.flagged,
    });
  }

  submit(reason: 'submitted' | 'expired' = 'submitted'): Promise<Attempt | null> {
    this.submitPromise ??= this.performSubmit(reason).finally(() => {
      this.submitPromise = undefined;
    });
    return this.submitPromise;
  }

  async tick(now = new Date()): Promise<Attempt | null> {
    const snapshot = this.snapshotState();
    if (!snapshot || snapshot.status !== 'active' || snapshot.mode !== 'exam') {
      return null;
    }
    const remaining = Math.max(
      0,
      new Date(snapshot.deadlineAt!).getTime() - now.getTime(),
    );
    this.remainingMsState.set(remaining);
    if (remaining === 0) {
      return this.submit('expired');
    }

    const warning = WARNING_MINUTES.find(
      (minutes) => remaining <= minutes * 60_000 && !this.warned.has(minutes),
    );
    if (warning !== undefined) {
      this.warned.add(warning);
      this.deadlineWarningState.set(warning);
      this.hooks.onWarning?.(warning);
    }
    return null;
  }

  async flushPersistence(): Promise<void> {
    await this.persistenceQueue;
  }

  async close(): Promise<void> {
    await this.detachCurrent();
    this.snapshotState.set(null);
    this.remainingMsState.set(null);
  }

  ngOnDestroy(): void {
    this.stopMonitoring();
    const snapshot = this.snapshotState();
    if (snapshot?.mode === 'exam' && this.ownsLease) {
      void this.repository.releaseSessionLease(snapshot.id, this.ownerId);
    }
  }

  private install(snapshot: SessionSnapshot): void {
    this.snapshotState.set(immutable(snapshot));
    this.lastAttemptState.set(null);
    this.persistenceErrorState.set(null);
    this.remainingMsState.set(null);
    this.deadlineWarningState.set(null);
    this.warned.clear();
  }

  private requireEditable(): SessionSnapshot {
    const snapshot = this.snapshotState();
    if (!snapshot || snapshot.status !== 'active') {
      throw new Error('There is no active quiz session.');
    }
    if (snapshot.mode === 'exam' && !this.ownsLease) {
      throw new SessionLockedError(snapshot.id);
    }
    return snapshot;
  }

  private replaceResponse(
    snapshot: SessionSnapshot,
    questionId: string,
    response: SessionResponse,
  ): void {
    this.updateSnapshot(snapshot, {
      responses: { ...snapshot.responses, [questionId]: response },
    });
  }

  private updateSnapshot(
    snapshot: SessionSnapshot,
    changes: Partial<SessionSnapshot>,
  ): void {
    const next: SessionSnapshot = {
      ...snapshot,
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    const safe = immutable(next);
    this.snapshotState.set(safe);
    this.enqueuePersistence(safe);
  }

  private enqueuePersistence(snapshot: SessionSnapshot): void {
    const copy = clone(snapshot);
    const operation = this.persistenceQueue.then(() =>
      this.repository.saveActiveSession(copy),
    );
    this.persistenceQueue = operation.catch((error: unknown) => {
      this.persistenceErrorState.set(error);
    });
  }

  private async performSubmit(
    reason: 'submitted' | 'expired',
  ): Promise<Attempt | null> {
    const snapshot = this.snapshotState();
    if (!snapshot || snapshot.status !== 'active') {
      return this.lastAttemptState();
    }
    await this.flushPersistence();
    const completedAt = new Date();
    const responses = Object.fromEntries(
      snapshot.questions.map((item) => {
        const response = snapshot.responses[item.question.id]!;
        return [
          item.question.id,
          {
            ...response,
            checked: true,
            isCorrect: scoreQuestion(item.solution, response),
          } satisfies SessionResponse,
        ];
      }),
    );
    const completedSnapshot: SessionSnapshot = {
      ...snapshot,
      status: reason === 'expired' ? 'expired' : 'completed',
      completedAt: completedAt.toISOString(),
      updatedAt: completedAt.toISOString(),
      responses,
    };
    const attempt: Attempt = {
      id: snapshot.id,
      sessionId: snapshot.id,
      mode: snapshot.mode,
      bankVersion: snapshot.bankVersion,
      seed: snapshot.seed,
      startedAt: snapshot.startedAt,
      completedAt: completedAt.toISOString(),
      durationSeconds: Math.max(
        0,
        Math.round(
          (completedAt.getTime() - new Date(snapshot.startedAt).getTime()) / 1000,
        ),
      ),
      completionReason: reason,
      questions: clone(snapshot.questions),
      responses,
      result: calculateAttemptResult(snapshot.questions, responses),
    };
    this.snapshotState.set(immutable(completedSnapshot));
    this.lastAttemptState.set(immutable(attempt));
    this.stopMonitoring();

    await this.repository.completeSession(attempt);
    if (snapshot.mode === 'exam') {
      await Promise.all(
        snapshot.questions.map((item) => {
          const response = responses[item.question.id]!;
          return this.repository.recordQuestionResult(
            item.question.id,
            item.question.revision,
            response.isCorrect ?? false,
            completedAt.toISOString(),
          );
        }),
      );
      await this.repository.releaseSessionLease(snapshot.id, this.ownerId);
      this.ownsLease = false;
    }
    if (reason === 'expired') {
      this.hooks.onAutoSubmit?.(attempt);
    }
    return immutable(attempt);
  }

  private startMonitoring(): void {
    this.stopMonitoring();
    this.tickCount = 0;
    this.monitorTimer = globalThis.setInterval(() => {
      if (this.tickRunning) {
        return;
      }
      this.tickRunning = true;
      void this.monitorStep().finally(() => {
        this.tickRunning = false;
      });
    }, 1_000);
  }

  private async monitorStep(): Promise<void> {
    await this.tick();
    const snapshot = this.snapshotState();
    if (!snapshot || snapshot.status !== 'active' || snapshot.mode !== 'exam') {
      return;
    }
    this.tickCount += 1;
    if (this.tickCount % LEASE_RENEW_EVERY_TICKS === 0) {
      this.ownsLease = await this.repository.renewSessionLease(
        snapshot.id,
        this.ownerId,
        LEASE_TTL_MS,
      );
      if (!this.ownsLease) {
        this.persistenceErrorState.set(new SessionLockedError(snapshot.id));
        this.stopMonitoring();
      }
    }
  }

  private stopMonitoring(): void {
    if (this.monitorTimer !== undefined) {
      globalThis.clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }
  }

  private async detachCurrent(): Promise<void> {
    this.stopMonitoring();
    await this.flushPersistence();
    const snapshot = this.snapshotState();
    if (snapshot?.mode === 'exam' && snapshot.status === 'active' && this.ownsLease) {
      await this.repository.releaseSessionLease(snapshot.id, this.ownerId);
    }
    this.ownsLease = true;
  }
}
