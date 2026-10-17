import assert from 'node:assert/strict';
import { test } from 'node:test';
import contracts from '../dist/index.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const first = { id: id(1), sessionItemId: id(2), eventId: id(3), senseId: id(4),
  goal: 'cloze_recall', rawAnswer: null, normalizedAnswer: null, outcome: 'dont_know',
  hintUsed: false, answerRevealed: true, answeredAt: '2026-10-09T09:00:00+09:00', studyDate: '2026-10-09' };

test('모르겠어요의 null 원문을 빈 문자열로 바꾸지 않고 최초 기록으로 보존한다', () => {
  assert.deepEqual(contracts.FirstAttemptSchema.parse(first), first);
});

test('재연습 기록에는 입력 원문이 필요하며 최초 평가 필드를 섞지 않는다', () => {
  const practice = { id: id(5), sessionItemId: id(2), eventId: id(6), rawAnswer: 'postponed',
    outcome: 'target_correct', attemptedAt: '2026-10-09T09:00:01+09:00' };
  contracts.PracticeAttemptSchema.parse(practice);
  assert.equal(contracts.PracticeAttemptSchema.safeParse({ ...practice, rawAnswer: null }).success, false);
  assert.equal(contracts.PracticeAttemptSchema.safeParse({ ...practice, hintUsed: false }).success, false);
  assert.equal(contracts.PracticeAttemptSchema.safeParse({ ...practice, outcome: 'dont_know' }).success, false);
});
