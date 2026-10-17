import { ExampleRevisionSchema, FirstAttemptSchema, PracticeAttemptSchema, SessionEventSchema, SessionItemSchema,
  SessionItemSeedSchema, SessionSettingsSchema, ProgressCheckpointSchema, type CardState, type ExampleRevision, type FirstAttempt,
  type PracticeAttempt, type ProgressCheckpoint, type SchedulerConfig, type SessionEvent, type SessionItem, type SessionItemSeed, type SessionSettings } from '@learning-voca/contracts';
import { gradeAnswer, validateGradingRule } from './grading.js';
import { reviewFirstAttempt, validateCardState, validateSchedulerConfig } from './review.js';
import { getStudyDate } from './statistics.js';
import { QUESTION_SELECTION_POLICY_VERSION } from './selection.js';

export class SessionError extends Error {
  constructor(public readonly code: 'INVALID_SESSION' | 'INVALID_TRANSITION' | 'EVENT_CONFLICT' | 'INVALID_EVENT_ORDER' | 'REFERENCE_MISMATCH', message: string) {
    super(message); this.name = 'SessionError';
  }
}
export type SessionItemState = {
  item: SessionItem; example: ExampleRevision; cardState: CardState; pendingTargetCheck: boolean;
  firstAttempt: FirstAttempt | null; practiceAttempts: PracticeAttempt[];
};
export type LearningSessionState = {
  id: string; startedAt: string; completedAt: string | null; status: 'active' | 'completed'; settings: SessionSettings;
  questionPolicyVersion: string; schedulerConfig: SchedulerConfig; items: SessionItemState[]; events: SessionEvent[];
};

/** 선택된 고정 문항·설정으로 메모리 상태를 만든다. ID 발급·패키지 소유권·저장은 호출자가 담당한다. */
export function createSession(input: {
  id: string; startedAt: string; settings: SessionSettings; questionPolicyVersion: string; schedulerConfig: SchedulerConfig;
  items: readonly { seed: SessionItemSeed; example: ExampleRevision; checkpoint: ProgressCheckpoint }[];
}): LearningSessionState {
  FirstAttemptSchema.shape.id.parse(input.id);
  const settings = SessionSettingsSchema.parse(input.settings);
  getStudyDate(input.startedAt, settings.timezone);
  const schedulerConfig = validateSchedulerConfig(input.schedulerConfig);
  if (input.questionPolicyVersion !== QUESTION_SELECTION_POLICY_VERSION || input.items.length === 0 || input.items.length > settings.sessionLimit) {
    throw new SessionError('INVALID_SESSION', '세션 정책·문항 수가 잘못되었습니다.');
  }
  const itemIds = new Set<string>(), senseIds = new Set<string>();
  const items = input.items.map((value, position): SessionItemState => {
    const seed = SessionItemSeedSchema.parse(value.seed);
    const example = ExampleRevisionSchema.parse(value.example);
    const checkpoint = ProgressCheckpointSchema.parse(value.checkpoint);
    if (seed.position !== position || itemIds.has(seed.id) || senseIds.has(seed.senseId)) {
      throw new SessionError('INVALID_SESSION', '문항 순서·ID·의미가 중복되거나 잘못되었습니다.');
    }
    if (seed.exampleRevisionId !== example.id || seed.senseRevisionId !== example.senseRevisionId || seed.gradingRuleId !== example.gradingRule.id ||
        seed.senseId !== checkpoint.senseId || seed.goal !== checkpoint.goal || seed.baseCheckpointId !== checkpoint.id ||
        seed.baseProgressVersion !== checkpoint.progressVersion || checkpoint.schedulerConfigId !== schedulerConfig.id) {
      throw new SessionError('REFERENCE_MISMATCH', '고정 문항과 예문·채점 버전이 맞지 않습니다.');
    }
    validateGradingRule(example.gradingRule);
    itemIds.add(seed.id); senseIds.add(seed.senseId);
    const cardState = validateCardState(checkpoint.cardState);
    if ((cardState.lastReview !== null && Date.parse(cardState.lastReview) > Date.parse(input.startedAt)) ||
        (!checkpoint.pendingTargetCheck && cardState.due !== null && Date.parse(cardState.due) > Date.parse(input.startedAt))) {
      throw new SessionError('INVALID_SESSION', '아직 예정 시각이 오지 않은 복습은 세션에 넣을 수 없습니다.');
    }
    return { item: SessionItemSchema.parse({ ...seed, phase: 'answering', firstAttemptId: null, hintUsed: false, skipReason: null }),
      example, cardState, pendingTargetCheck: checkpoint.pendingTargetCheck, firstAttempt: null, practiceAttempts: [] };
  });
  if (items.filter((value) => value.cardState.state === 'New' && !value.pendingTargetCheck).length > settings.newWordLimit) {
    throw new SessionError('INVALID_SESSION', '세션당 신규 의미 제한을 초과했습니다.');
  }
  return { id: input.id, startedAt: input.startedAt, completedAt: null, status: 'active', settings,
    questionPolicyVersion: input.questionPolicyVersion, schedulerConfig, items, events: [] };
}

/** 이미 검증해 생성·복원한 상태에 이벤트 하나를 적용한다. 반환 상태와 이벤트는 같은 저장 transaction으로 확정해야 한다. */
export function applySessionEvent(state: LearningSessionState, input: SessionEvent): LearningSessionState {
  const event = SessionEventSchema.parse(input);
  const duplicate = state.events.find((previous) => previous.eventId === event.eventId);
  if (duplicate) {
    if (JSON.stringify(duplicate) !== JSON.stringify(event)) throw new SessionError('EVENT_CONFLICT', '같은 이벤트 ID에 다른 내용이 있습니다.');
    return state;
  }
  if (event.sessionId !== state.id) throw new SessionError('REFERENCE_MISMATCH', '다른 세션의 이벤트입니다.');
  const last = state.events.at(-1);
  if ((last && event.sequence <= last.sequence) || Date.parse(event.occurredAt) < Date.parse(last?.occurredAt ?? state.startedAt)) {
    throw new SessionError('INVALID_EVENT_ORDER', '이벤트 순서·시각이 역행합니다.');
  }
  if (state.status !== 'active') throw new SessionError('INVALID_TRANSITION', '완료한 세션에는 새 이벤트를 적용할 수 없습니다.');
  const next = { ...state, events: [...state.events, event] };
  if (event.type === 'session.completed') {
    if (state.items.some(({ item }) => item.phase !== 'done' && item.phase !== 'skipped')) {
      throw new SessionError('INVALID_TRANSITION', '미완료 문항이 있는 세션을 완료할 수 없습니다.');
    }
    return { ...next, status: 'completed', completedAt: event.occurredAt };
  }
  const index = state.items.findIndex(({ item }) => item.id === event.sessionItemId);
  if (index < 0) throw new SessionError('REFERENCE_MISMATCH', '세션에 없는 문항입니다.');
  const current = state.items[index]!;
  const activeIndex = state.items.findIndex(({ item }) => item.phase !== 'done' && item.phase !== 'skipped');
  if (event.type !== 'item.skipped' && index !== activeIndex) throw new SessionError('INVALID_TRANSITION', '현재 문항만 답하거나 이동할 수 있습니다.');
  let updated: SessionItemState = current;
  const fail = () => { throw new SessionError('INVALID_TRANSITION', '현재 문항 상태에서 허용하지 않는 전이입니다.'); };
  if (event.type === 'item.skipped') {
    // 재연결에서 중단을 알게 되어도 이미 제출한 최초 기록·일정은 되돌리지 않는다.
    if (current.firstAttempt === null && current.item.phase !== 'skipped') {
      updated = { ...current, item: { ...current.item, phase: 'skipped', skipReason: event.payload.reason } };
    }
  } else if (event.type === 'item.advanced') {
    if (current.item.phase !== 'feedback' && current.item.phase !== 'practicing') fail();
    updated = { ...current, item: { ...current.item, phase: 'done' } };
  } else {
    if (event.payload.gradingRuleId !== current.item.gradingRuleId) throw new SessionError('REFERENCE_MISMATCH', '다른 채점 버전을 참조했습니다.');
    if (event.type === 'hint.revealed') {
      if (current.item.phase !== 'answering') fail();
      updated = { ...current, item: { ...current.item, hintUsed: true } };
    } else if (event.type === 'practice.submitted') {
      if (current.firstAttempt === null || (current.item.phase !== 'feedback' && current.item.phase !== 'practicing')) fail();
      const result = gradeAnswer(current.example.gradingRule, event.payload.rawAnswer);
      const attempt = PracticeAttemptSchema.parse({ id: event.eventId, sessionItemId: current.item.id, eventId: event.eventId,
        rawAnswer: event.payload.rawAnswer, outcome: result.outcome, attemptedAt: event.occurredAt });
      // 성공해도 자동 이동하지 않으며 카드·최초 답안을 건드리지 않는다. 다음 이동은 별도 이벤트다.
      updated = { ...current, item: { ...current.item, phase: 'practicing' }, practiceAttempts: [...current.practiceAttempts, attempt] };
    } else {
      if (current.item.phase !== 'answering' || current.firstAttempt !== null) fail();
      if (event.payload.baseCheckpointId !== current.item.baseCheckpointId) throw new SessionError('REFERENCE_MISMATCH', '다른 진도 기준을 참조했습니다.');
      const rawAnswer = event.type === 'answer.submitted' ? event.payload.rawAnswer : null;
      const result = rawAnswer === null ? null : gradeAnswer(current.example.gradingRule, rawAnswer, current.item.hintUsed);
      const attempt = FirstAttemptSchema.parse({ id: event.eventId, sessionItemId: current.item.id, eventId: event.eventId,
        senseId: current.item.senseId, goal: current.item.goal, rawAnswer, normalizedAnswer: result?.normalizedAnswer ?? null,
        outcome: result?.outcome ?? 'dont_know', hintUsed: current.item.hintUsed, answerRevealed: true,
        answeredAt: event.occurredAt, studyDate: getStudyDate(event.occurredAt, state.settings.timezone) });
      const review = reviewFirstAttempt(current.cardState, attempt, state.schedulerConfig);
      updated = { ...current, item: { ...current.item, phase: 'feedback', firstAttemptId: attempt.id }, firstAttempt: attempt,
        cardState: review.cardState, pendingTargetCheck: review.pendingTargetCheck };
    }
  }
  const items = [...state.items]; items[index] = updated;
  return { ...next, items };
}
