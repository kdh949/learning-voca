import { FirstAttemptSchema, type FirstAttempt } from '@learning-voca/contracts';

export type LearningStatistics = {
  firstAttemptCount: number; unhintedTargetCorrectCount: number; hintedTargetCorrectCount: number;
  incorrectCount: number; validAlternativeCount: number; evaluatedCount: number; unhintedTargetAccuracy: number | null;
};

/** 세션에 고정한 시간대로 학습일을 구한다. 기기 설정이나 완료일이 바뀌어도 과거 답안의 날짜를 바꾸지 않는다. */
export function getStudyDate(answeredAt: string, timezone: string): string {
  FirstAttemptSchema.shape.answeredAt.parse(answeredAt);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(answeredAt));
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** 최초 시도만 집계한다. 같은 이벤트의 재전송은 제외하고 동일 문항의 다른 답안·변조된 재전송은 거절한다. */
export function calculateStatistics(inputs: readonly FirstAttempt[], studyDate?: string): LearningStatistics {
  if (studyDate !== undefined) FirstAttemptSchema.shape.studyDate.parse(studyDate);
  const events = new Map<string, FirstAttempt>();
  const items = new Set<string>();
  const ids = new Set<string>();
  for (const input of inputs) {
    const attempt = FirstAttemptSchema.parse(input);
    const duplicate = events.get(attempt.eventId);
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(attempt)) throw new Error('동일 이벤트 ID의 최초 답안이 다릅니다.');
      continue;
    }
    if (items.has(attempt.sessionItemId) || ids.has(attempt.id)) throw new Error('동일 문항·최초 시도 ID에 여러 답안이 있습니다.');
    items.add(attempt.sessionItemId); ids.add(attempt.id); events.set(attempt.eventId, attempt);
  }
  const result: LearningStatistics = { firstAttemptCount: 0, unhintedTargetCorrectCount: 0, hintedTargetCorrectCount: 0,
    incorrectCount: 0, validAlternativeCount: 0, evaluatedCount: 0, unhintedTargetAccuracy: null };
  for (const attempt of events.values()) {
    if (studyDate !== undefined && attempt.studyDate !== studyDate) continue;
    result.firstAttemptCount++;
    if (attempt.outcome === 'valid_alternative') result.validAlternativeCount++;
    else if (attempt.outcome === 'target_correct') {
      if (attempt.hintUsed) result.hintedTargetCorrectCount++;
      else result.unhintedTargetCorrectCount++;
    } else result.incorrectCount++;
  }
  result.evaluatedCount = result.firstAttemptCount - result.validAlternativeCount;
  result.unhintedTargetAccuracy = result.evaluatedCount === 0 ? null : result.unhintedTargetCorrectCount / result.evaluatedCount;
  return result;
}
