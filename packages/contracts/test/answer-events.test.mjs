import assert from 'node:assert/strict';
import { test } from 'node:test';
import contracts from '../dist/index.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = { eventId: id(1), schemaVersion: 1, sequence: 1,
  occurredAt: '2026-10-09T00:00:00Z', sessionId: id(2), sessionItemId: id(3) };
const payload = { rawAnswer: 'postpone', gradingRuleId: id(4), baseCheckpointId: id(5), previousProgressEventId: null };
const answer = { ...base, type: 'answer.submitted', payload };

test('답 원문과 진도 분기 기준을 보존하며 문자열로 강제 변환하지 않는다', () => {
  const raw = '  ＰＯＳＴＰＯＮＥ  ';
  const parsed = contracts.AnswerEventSchema.parse({ ...answer, payload: { ...payload, rawAnswer: raw } });
  assert.equal(parsed.payload.rawAnswer, raw);
  assert.equal(parsed.payload.previousProgressEventId, null);
  assert.equal(contracts.AnswerEventSchema.safeParse({ ...answer, payload: { ...payload, rawAnswer: 123 } }).success, false);
});

for (const [name, value] of [['userId', id(6)], ['hintUsed', true], ['outcome', 'target_correct'], ['nextReviewAt', '2030-01-01T00:00:00Z']]) {
  test(`서버에서 결정할 payload 필드 거절: ${name}`, () => {
    assert.equal(contracts.AnswerEventSchema.safeParse({ ...answer, payload: { ...payload, [name]: value } }).success, false);
  });
}

test('envelope 상속 필드·사용자 ID를 이벤트 본문에 몰래 추가하지 않는다', () => {
  for (const field of ['userId', 'deviceId', 'streamId', 'dataGeneration']) {
    assert.equal(contracts.AnswerEventSchema.safeParse({ ...answer, [field]: id(6) }).success, false);
  }
});

for (const [field, value] of [['eventId', 'event_example'], ['sequence', 0], ['sequence', 1.5],
  ['sequence', Number.MAX_SAFE_INTEGER + 1], ['schemaVersion', 2], ['occurredAt', '2026-02-30T00:00:00Z'], ['occurredAt', '2026-10-09T00:00:00']]) {
  test(`지원하지 않거나 손상된 이벤트 경계 거절: ${field}=${value}`, () => {
    assert.equal(contracts.AnswerEventSchema.safeParse({ ...answer, [field]: value }).success, false);
  });
}

test('분기 기준을 누락하거나 다른 학습 이벤트를 답안 이벤트로 보내면 거절한다', () => {
  const missing = { ...payload }; delete missing.baseCheckpointId;
  assert.equal(contracts.AnswerEventSchema.safeParse({ ...answer, payload: missing }).success, false);
  assert.equal(contracts.AnswerEventSchema.safeParse({ ...answer, type: 'session.started' }).success, false);
});

test('모르겠어요는 rawAnswer 없는 독립 이벤트이며 빈 문자열 제출과 다르다', () => {
  const { rawAnswer, ...givenUp } = payload;
  assert.equal(contracts.AnswerEventSchema.parse({ ...base, type: 'answer.given_up', payload: givenUp }).type, 'answer.given_up');
  assert.equal(contracts.AnswerEventSchema.safeParse({ ...answer, payload: { ...payload, rawAnswer: '' } }).success, false);
  assert.equal(contracts.AnswerEventSchema.safeParse({ ...base, type: 'answer.given_up', payload }).success, false);
});

test('힌트·재연습은 각자의 payload만 받는다', () => {
  contracts.AnswerEventSchema.parse({ ...base, type: 'hint.revealed', payload: { gradingRuleId: id(4) } });
  const practice = { ...base, type: 'practice.submitted', payload: { rawAnswer: 'postponed', gradingRuleId: id(4) } };
  contracts.AnswerEventSchema.parse(practice);
  assert.equal(contracts.AnswerEventSchema.safeParse({ ...practice, payload: { ...practice.payload, baseCheckpointId: id(5) } }).success, false);
});
