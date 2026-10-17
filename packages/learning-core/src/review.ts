import { CardStateSchema, SchedulerConfigSchema, FirstAttemptSchema, type CardState, type FirstAttempt, type SchedulerConfig } from '@learning-voca/contracts';
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRSParameters } from 'ts-fsrs';

export const FSRS_LIBRARY_VERSION = '5.4.2';
export const REVIEW_POLICY_VERSION = 'fsrs-review-v1';

/** 버전·입력 오류를 숨기고 새 기본 설정으로 계산하지 않는다. */
export class ReviewError extends Error {
  constructor(public readonly code: 'UNSUPPORTED_CONFIG' | 'INVALID_PARAMETERS' | 'INVALID_CARD' | 'INVALID_TIME' | 'INVALID_RATING', message: string) {
    super(message); this.name = 'ReviewError';
  }
}

/** DB의 불변 설정을 받는다. configHash의 실제 내용 검증·ID별 유일성은 저장 경계의 책임이다. */
export function validateSchedulerConfig(input: SchedulerConfig): SchedulerConfig {
  const config = SchedulerConfigSchema.parse(input);
  if (config.libraryVersion !== FSRS_LIBRARY_VERSION || config.policyVersion !== REVIEW_POLICY_VERSION) {
    throw new ReviewError('UNSUPPORTED_CONFIG', '지원하지 않는 FSRS 라이브러리·정책 버전입니다.');
  }
  const parameters = config.parameters as FSRSParameters;
  const resolved = generatorParameters(parameters);
  // 라이브러리가 오래된 가중치를 변환하거나 범위 밖 값을 보정하면 원래 설정과 결과의 의미가 달라진다.
  if (JSON.stringify(resolved.w) !== JSON.stringify(parameters.w)) {
    throw new ReviewError('INVALID_PARAMETERS', '자동 변환·보정이 필요한 FSRS 가중치는 사용할 수 없습니다.');
  }
  for (const steps of [parameters.learning_steps, parameters.relearning_steps]) {
    const minutes = steps.map((step) => Number(step.slice(0, -1)) * ({ m: 1, h: 60, d: 1440 }[step.slice(-1)] ?? 0));
    if (minutes.some((value, index) => !Number.isSafeInteger(value) || value >= 1440 || (index > 0 && value <= minutes[index - 1]!))) {
      throw new ReviewError('INVALID_PARAMETERS', '단기 학습 단계는 하루 미만의 증가하는 분 단위여야 합니다.');
    }
  }
  return config;
}

/** 날짜와 필드 사이의 불일치를 거절한다. 새 카드는 일정·최초 복습 시각을 갖지 않는다. */
export function validateCardState(input: CardState): CardState {
  const card = CardStateSchema.parse(input);
  if (card.difficulty > 10 || card.lapses > card.reps ||
      (card.state === 'New' ? card.reps !== 0 || card.lastReview !== null || card.stability !== 0 || card.difficulty !== 0 || card.learningSteps !== 0 || card.scheduledDays !== 0 || card.elapsedDays !== 0 || card.due !== null || card.lapses !== 0
        : card.reps === 0 || card.lastReview === null || card.due === null || card.stability === 0 || card.difficulty < 1) ||
      (card.due !== null && card.lastReview !== null && Date.parse(card.due) < Date.parse(card.lastReview))) {
    throw new ReviewError('INVALID_CARD', '복습 카드의 상태·횟수·일정이 서로 맞지 않습니다.');
  }
  return card;
}

/** 새 진도를 위한 전송 카드다. 시스템 현재 시각이나 라이브러리 기본값에 의존하지 않는다. */
export function createNewCard(): CardState {
  return { due: null, lastReview: null, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0,
    reps: 0, lapses: 0, state: 'New', learningSteps: 0 };
}

/** ISO 시각을 명시적으로 받으며, 과거 시각으로 복습 이력을 되돌리지 않는다. null rating은 카드 전체를 보존한다. */
export function scheduleReview(previousCard: CardState, rating: 'Good' | 'Again' | null, effectiveAt: string, schedulerConfig: SchedulerConfig): CardState {
  const previous = validateCardState(previousCard);
  const config = validateSchedulerConfig(schedulerConfig);
  if (!CardStateSchema.shape.due.unwrap().safeParse(effectiveAt).success ||
      (previous.lastReview !== null && Date.parse(effectiveAt) < Date.parse(previous.lastReview))) {
    throw new ReviewError('INVALID_TIME', '복습 시각이 잘못되었거나 마지막 복습보다 이전입니다.');
  }
  if (rating !== null && rating !== 'Good' && rating !== 'Again') throw new ReviewError('INVALID_RATING', '첫 버전은 Good·Again만 사용합니다.');
  if (rating === null) return previous;
  const at = new Date(effectiveAt);
  const card: Card = previous.state === 'New' ? createEmptyCard(at) : {
    due: new Date(previous.due!), last_review: new Date(previous.lastReview!), stability: previous.stability,
    difficulty: previous.difficulty, elapsed_days: previous.elapsedDays, scheduled_days: previous.scheduledDays,
    reps: previous.reps, lapses: previous.lapses, state: State[previous.state], learning_steps: previous.learningSteps,
  };
  const next = fsrs(config.parameters as FSRSParameters).next(card, at, Rating[rating]).card;
  return validateCardState({ due: next.due.toISOString(), lastReview: next.last_review?.toISOString() ?? null,
    stability: next.stability, difficulty: next.difficulty, elapsedDays: next.elapsed_days, scheduledDays: next.scheduled_days,
    reps: next.reps, lapses: next.lapses, state: State[next.state] as CardState['state'], learningSteps: next.learning_steps });
}

/** 재연습 기록을 받지 않고 최초 시도만으로 rating과 목표 확인 대기를 계산한다. */
export function reviewFirstAttempt(previousCard: CardState, attempt: Pick<FirstAttempt, 'outcome' | 'hintUsed' | 'answeredAt'>, config: SchedulerConfig) {
  FirstAttemptSchema.shape.outcome.parse(attempt.outcome);
  FirstAttemptSchema.shape.hintUsed.parse(attempt.hintUsed);
  const rating = attempt.outcome === 'valid_alternative' ? null : attempt.outcome === 'target_correct' && !attempt.hintUsed ? 'Good' : 'Again';
  return { rating, cardState: scheduleReview(previousCard, rating, attempt.answeredAt, config), pendingTargetCheck: rating === null };
}
