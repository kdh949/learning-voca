import type { GradingResult, GradingRuleInput } from '@learning-voca/contracts';

export const NORMALIZATION_VERSION = 'nfkc-space-case-v1';
export const GRADING_ENGINE_VERSION = 'exact-answers-v1';

type GradingErrorCode =
  | 'UNSUPPORTED_NORMALIZATION_VERSION'
  | 'UNSUPPORTED_GRADING_ENGINE_VERSION'
  | 'EMPTY_ANSWER'
  | 'EMPTY_RULE_ANSWER'
  | 'DUPLICATE_RULE_ANSWER'
  | 'INVALID_HINT';

/** 입력 수정과 콘텐츠 업데이트가 필요한 오류를 문구에 의존하지 않고 구분한다. */
export class GradingError extends Error {
  constructor(public readonly code: GradingErrorCode, message: string) {
    super(message);
    this.name = 'GradingError';
  }
}

/** NFKC·공백·영문 대소문자만 정규화한다. 문장부호·어미를 삭제하거나 어간을 추론하지 않는다. */
export function normalizeAnswer(rawAnswer: string, version = NORMALIZATION_VERSION): string {
  if (version !== NORMALIZATION_VERSION) {
    throw new GradingError('UNSUPPORTED_NORMALIZATION_VERSION', `지원하지 않는 정규화 버전: ${version}`);
  }
  return rawAnswer.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** 구조는 contracts에서 먼저 검사한다. 여기서는 이 버전의 실행 가능성과 답안 충돌을 검사한다. */
export function validateGradingRule(rule: GradingRuleInput): void {
  if (rule.gradingEngineVersion !== GRADING_ENGINE_VERSION) {
    throw new GradingError('UNSUPPORTED_GRADING_ENGINE_VERSION', `지원하지 않는 채점 버전: ${rule.gradingEngineVersion}`);
  }
  const answers = [rule.targetAnswer, ...rule.answers.map((answer) => answer.answerText)]
    .map((answer) => normalizeAnswer(answer, rule.normalizationVersion));
  if (answers.some((answer) => answer.length === 0)) {
    throw new GradingError('EMPTY_RULE_ANSWER', '정규화 후 비어 있는 답을 채점 규칙에 등록할 수 없습니다.');
  }
  if (new Set(answers).size !== answers.length) {
    throw new GradingError('DUPLICATE_RULE_ANSWER', '정규화 후 목표 답·허용 답이 중복됩니다.');
  }
  // 단계별 힌트로 조용히 바뀌면 기존 최초 시도의 의미도 바뀌므로 이 버전은 첫 글자만 허용한다.
  const firstLetter = Array.from(answers[0]!)[0];
  if (normalizeAnswer(rule.hintText, rule.normalizationVersion) !== firstLetter) {
    throw new GradingError('INVALID_HINT', '이 채점 버전의 힌트는 목표 답의 첫 글자여야 합니다.');
  }
}

const defaultFeedback: Record<GradingResult['outcome'], string> = {
  target_correct: '목표 표현을 맞혔어요.',
  valid_alternative: '문맥에 맞는 표현이에요. 목표 표현도 확인해 주세요.',
  form_error: '문장에 맞는 형태를 확인해 주세요.',
  incorrect: '목표 표현을 확인하고 다시 연습해 주세요.',
};

/** 고정된 규칙으로 제출한 답을 판정한다. hintUsed는 앞서 저장한 힌트 상태에서 얻으며 기록·일정은 변경하지 않는다. */
export function gradeAnswer(rule: GradingRuleInput, rawAnswer: string, hintUsed = false): GradingResult {
  validateGradingRule(rule);
  const normalizedAnswer = normalizeAnswer(rawAnswer, rule.normalizationVersion);
  if (normalizedAnswer.length === 0) {
    throw new GradingError('EMPTY_ANSWER', '빈 답은 제출할 수 없습니다. 모르겠어요는 별도 이벤트를 사용합니다.');
  }
  const target = normalizeAnswer(rule.targetAnswer, rule.normalizationVersion);
  const matched = rule.answers.find((answer) =>
    normalizeAnswer(answer.answerText, rule.normalizationVersion) === normalizedAnswer);
  let outcome: GradingResult['outcome'] = 'incorrect';
  if (normalizedAnswer === target || matched?.kind === 'target_equivalent') outcome = 'target_correct';
  else if (matched?.kind === 'valid_alternative') outcome = 'valid_alternative';
  else if (matched?.kind === 'known_form_error') outcome = 'form_error';

  const deferred = outcome === 'valid_alternative';
  return {
    outcome, normalizedAnswer, hintUsed,
    targetRecallEvaluated: !deferred,
    scheduleRating: deferred ? null : outcome === 'target_correct' && !hintUsed ? 'Good' : 'Again',
    scheduleEffect: deferred ? 'deferred' : 'applied',
    feedback: matched?.feedback ?? defaultFeedback[outcome],
    targetAnswer: rule.targetAnswer,
  };
}

/** 저장된 힌트 이벤트 이후에만 화면에 공개한다. 이 함수 자체는 저장이나 공개를 수행하지 않는다. */
export function getHint(rule: GradingRuleInput): string {
  validateGradingRule(rule);
  return Array.from(normalizeAnswer(rule.targetAnswer, rule.normalizationVersion))[0]!;
}

export type PracticeFeedback = {
  status: 'composing' | 'empty' | 'prefix' | GradingResult['outcome'];
  normalizedAnswer: string;
  targetCompleted: boolean;
  feedback: string;
};

/** 입력 중 피드백이다. 최초 평가·FSRS 값을 반환하지 않으며 IME 조합 중에는 오류나 완료를 확정하지 않는다. */
export function getPracticeFeedback(rule: GradingRuleInput, rawAnswer: string, isComposing = false): PracticeFeedback {
  validateGradingRule(rule);
  const normalizedAnswer = normalizeAnswer(rawAnswer, rule.normalizationVersion);
  if (isComposing || normalizedAnswer.length === 0) {
    return { status: isComposing ? 'composing' : 'empty', normalizedAnswer, targetCompleted: false, feedback: '' };
  }
  const result = gradeAnswer(rule, rawAnswer);
  if (result.outcome === 'target_correct' || result.outcome === 'valid_alternative') {
    return { status: result.outcome, normalizedAnswer, targetCompleted: result.outcome === 'target_correct', feedback: result.feedback };
  }
  const accepted = [rule.targetAnswer, ...rule.answers
    .filter((answer) => answer.kind !== 'known_form_error').map((answer) => answer.answerText)];
  // postpone는 postponed의 입력 도중이기도 하다. 제출 전 접두사를 형태 오류로 확정하지 않는다.
  if (accepted.some((answer) => normalizeAnswer(answer, rule.normalizationVersion).startsWith(normalizedAnswer))) {
    return { status: 'prefix', normalizedAnswer, targetCompleted: false, feedback: '' };
  }
  return { status: result.outcome, normalizedAnswer, targetCompleted: false, feedback: result.feedback };
}
