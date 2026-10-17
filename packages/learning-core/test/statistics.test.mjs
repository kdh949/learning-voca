import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as core from '@learning-voca/learning-core';
import { uuid, statisticsExample } from '../../../tests/session-cases.mjs';
const senses = JSON.parse(readFileSync(new URL('../../../content/fixtures/grading.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('../../../content/fixtures/review.json', import.meta.url), 'utf8'));
const attempt = (n, outcome, hintUsed = false, studyDate = '2026-10-09') => ({ id: uuid(1000 + n), sessionItemId: uuid(2000 + n),
  eventId: uuid(3000 + n), senseId: uuid(4000), goal: 'cloze_recall', rawAnswer: outcome === 'dont_know' ? null : 'answer',
  normalizedAnswer: outcome === 'dont_know' ? null : 'answer', outcome, hintUsed, answerRevealed: true, answeredAt: '2026-10-09T01:00:00Z', studyDate });

test('17문항 예제는 12 + 2 + 2 + 1로 분류하고 12/16 = 75%로 계산한다', () => {
  assert.deepEqual(statisticsExample(core, senses, fixture.config), { firstAttemptCount: 17, unhintedTargetCorrectCount: 12,
    hintedTargetCorrectCount: 2, incorrectCount: 2, validAlternativeCount: 1, evaluatedCount: 16, unhintedTargetAccuracy: 0.75 });
});

test('분모가 없는 빈 기록·대체 표현만 있는 기록은 0% 대신 null이다', () => {
  for (const attempts of [[], [attempt(1, 'valid_alternative')]]) {
    assert.equal(core.calculateStatistics(attempts).unhintedTargetAccuracy, null);
  }
});

test('완료 여부와 관계없이 저장된 학습일로 집계하고 자정·DST 시간대를 보존한다', () => {
  assert.equal(core.getStudyDate('2026-10-09T14:59:59Z', 'Asia/Seoul'), '2026-10-09');
  assert.equal(core.getStudyDate('2026-10-09T15:00:00Z', 'Asia/Seoul'), '2026-10-10');
  assert.equal(core.getStudyDate('2026-03-08T06:59:00Z', 'America/New_York'), '2026-03-08');
  assert.equal(core.getStudyDate('2026-03-08T07:01:00Z', 'America/New_York'), '2026-03-08');
  const attempts = [attempt(0, 'target_correct'), attempt(1, 'incorrect', false, '2026-10-10')];
  assert.equal(core.calculateStatistics(attempts, '2026-10-09').firstAttemptCount, 1);
  assert.equal(core.calculateStatistics(attempts).firstAttemptCount, 2);
});

test('같은 최초 이벤트 재전송은 한 번만 세고 변조·같은 문항의 새 답안은 거절한다', () => {
  const first = attempt(0, 'form_error');
  assert.equal(core.calculateStatistics([first, structuredClone(first)]).firstAttemptCount, 1);
  assert.throws(() => core.calculateStatistics([first, { ...first, outcome: 'target_correct' }]));
  assert.throws(() => core.calculateStatistics([first, { ...attempt(1, 'target_correct'), sessionItemId: first.sessionItemId }]));
  assert.throws(() => core.calculateStatistics([{ ...first, practiceAttempts: [] }]));
});
