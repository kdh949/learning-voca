import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as core from '@learning-voca/learning-core';
import { sessionInput, sessionEvent, answerPayload, uuid } from '../../../tests/session-cases.mjs';
const senses = JSON.parse(readFileSync(new URL('../../../content/fixtures/grading.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('../../../content/fixtures/review.json', import.meta.url), 'utf8'));
const create = (indices = [0, 1]) => core.createSession(sessionInput(core, senses, fixture.config, indices));

test('최초 오답을 보존하며 재연습 정답·재전송이 카드·통계를 다시 갱신하지 않는다', () => {
  let state = create();
  const before = structuredClone(state);
  const firstEvent = sessionEvent(state, 'answer.submitted', 1, answerPayload(state, 'postpone'));
  const answer = core.applySessionEvent(state, firstEvent);
  assert.deepEqual(state, before);
  assert.equal(answer.items[0].firstAttempt.outcome, 'form_error');
  assert.equal(answer.items[0].item.phase, 'feedback');
  assert.equal(answer.items[0].firstAttempt.answerRevealed, true);
  assert.equal(answer.items[0].firstAttempt.studyDate, '2026-10-10');
  assert.equal(core.applySessionEvent(answer, firstEvent), answer);
  state = core.applySessionEvent(answer, sessionEvent(answer, 'practice.submitted', 2, { gradingRuleId: answer.items[0].item.gradingRuleId, rawAnswer: 'postponed' }));
  assert.equal(state.items[0].practiceAttempts[0].outcome, 'target_correct');
  assert.equal(state.items[0].item.phase, 'practicing');
  assert.deepEqual(state.items[0].firstAttempt, answer.items[0].firstAttempt);
  assert.deepEqual(state.items[0].cardState, answer.items[0].cardState);
  assert.equal(state.items[0].cardState.reps, 1);
  assert.throws(() => core.applySessionEvent(state, sessionEvent(state, 'answer.submitted', 3, answerPayload(state, 'postponed'))), { code: 'INVALID_TRANSITION' });
});

test('힌트를 저장한 뒤 답하면 Again이며 제출 이후 새 힌트를 적용할 수 없다', () => {
  let state = create();
  state = core.applySessionEvent(state, sessionEvent(state, 'hint.revealed', 1, { gradingRuleId: state.items[0].item.gradingRuleId }));
  const at = '2026-10-09T15:01:00Z';
  state = core.applySessionEvent(state, sessionEvent(state, 'answer.submitted', 2, answerPayload(state, 'postponed'), 0, at));
  assert.equal(state.items[0].firstAttempt.hintUsed, true);
  assert.equal(Date.parse(state.items[0].cardState.due) - Date.parse(at), 60000);
  assert.throws(() => core.applySessionEvent(state, sessionEvent(state, 'hint.revealed', 3, { gradingRuleId: state.items[0].item.gradingRuleId })), { code: 'INVALID_TRANSITION' });
});

test('대체 표현 뒤 목표 재연습은 평가 보류·최초 결과를 바꾸지 않는다', () => {
  let state = create();
  state = core.applySessionEvent(state, sessionEvent(state, 'answer.submitted', 1, answerPayload(state, 'delayed')));
  const original = structuredClone(state.items[0]);
  for (const [rawAnswer, sequence] of [['delayed', 2], ['postponed', 3]]) {
    state = core.applySessionEvent(state, sessionEvent(state, 'practice.submitted', sequence, { gradingRuleId: state.items[0].item.gradingRuleId, rawAnswer }));
    assert.deepEqual(state.items[0].cardState, core.createNewCard());
    assert.equal(state.items[0].pendingTargetCheck, true);
    assert.deepEqual(state.items[0].firstAttempt, original.firstAttempt);
  }
  assert.equal(core.calculateStatistics([state.items[0].firstAttempt]).unhintedTargetAccuracy, null);
});

test('모르겠어요는 null 답안의 독립 최초 시도로 보존한다', () => {
  let state = create();
  state = core.applySessionEvent(state, sessionEvent(state, 'answer.given_up', 1, answerPayload(state, null)));
  assert.equal(state.items[0].firstAttempt.outcome, 'dont_know');
  assert.equal(state.items[0].firstAttempt.rawAnswer, null);
  assert.equal(state.items[0].firstAttempt.normalizedAnswer, null);
  assert.equal(state.items[0].cardState.reps, 1);
});

test('미완료 문항·현재 문항 이전·다음 문항 선행 답안을 거절하고 명시적으로 이동·완료한다', () => {
  let state = create();
  assert.throws(() => core.applySessionEvent(state, sessionEvent(state, 'session.completed', 1)), { code: 'INVALID_TRANSITION' });
  assert.throws(() => core.applySessionEvent(state, sessionEvent(state, 'item.advanced', 1)), { code: 'INVALID_TRANSITION' });
  assert.throws(() => core.applySessionEvent(state, sessionEvent(state, 'answer.submitted', 1, answerPayload(state, 'book', 1), 1)), { code: 'INVALID_TRANSITION' });
  state = core.applySessionEvent(state, sessionEvent(state, 'answer.submitted', 1, answerPayload(state, 'postponed')));
  state = core.applySessionEvent(state, sessionEvent(state, 'item.advanced', 2));
  assert.equal(state.items[0].item.phase, 'done');
  state = core.applySessionEvent(state, sessionEvent(state, 'item.skipped', 3, { reason: 'excluded' }, 1));
  const finish = sessionEvent(state, 'session.completed', 4);
  state = core.applySessionEvent(state, finish);
  assert.equal(state.status, 'completed');
  assert.equal(state.completedAt, finish.occurredAt);
  assert.equal(core.applySessionEvent(state, finish), state);
  assert.throws(() => core.applySessionEvent(state, sessionEvent(state, 'session.completed', 5)), { code: 'INVALID_TRANSITION' });
});

test('게시 중단은 미래 미답안도 건너뛰고 이미 답한 기록·카드는 보존한다', () => {
  let state = create();
  state = core.applySessionEvent(state, sessionEvent(state, 'item.skipped', 1, { reason: 'withdrawn' }, 1));
  assert.equal(state.items[1].item.skipReason, 'withdrawn');
  state = core.applySessionEvent(state, sessionEvent(state, 'answer.submitted', 2, answerPayload(state, 'postponed')));
  const original = structuredClone(state.items[0]);
  state = core.applySessionEvent(state, sessionEvent(state, 'item.skipped', 3, { reason: 'withdrawn' }));
  assert.deepEqual(state.items[0], original);
});

test('같은 ID의 변조·순서 역행·다른 세션·채점 버전·진도 기준을 거절한다', () => {
  const initial = create();
  const event = sessionEvent(initial, 'answer.submitted', 10, answerPayload(initial, 'postponed'));
  const state = core.applySessionEvent(initial, event);
  assert.throws(() => core.applySessionEvent(state, { ...event, payload: { ...event.payload, rawAnswer: 'postpone' } }), { code: 'EVENT_CONFLICT' });
  for (const invalid of [sessionEvent(state, 'item.advanced', 9), sessionEvent(state, 'item.advanced', 11, {}, 0, '2026-10-08T00:00:00Z')]) {
    assert.throws(() => core.applySessionEvent(state, invalid), { code: 'INVALID_EVENT_ORDER' });
  }
  assert.throws(() => core.applySessionEvent(initial, { ...event, sessionId: uuid(999) }), { code: 'REFERENCE_MISMATCH' });
  for (const field of ['gradingRuleId', 'baseCheckpointId']) {
    assert.throws(() => core.applySessionEvent(initial, { ...event, payload: { ...event.payload, [field]: uuid(999) } }), { code: 'REFERENCE_MISMATCH' });
  }
  assert.throws(() => core.applySessionEvent(initial, { ...event, payload: { ...event.payload, hintUsed: false } }));
  assert.throws(() => core.applySessionEvent(initial, { ...event, payload: { ...event.payload, rawAnswer: '  ' } }));
});

test('고정된 입력을 복사하고 다른 버전·중복 문항·시간대·진도 참조를 거절한다', () => {
  const input = sessionInput(core, senses, fixture.config);
  const state = core.createSession(input);
  input.items[0].example.gradingRule.targetAnswer = 'mutated';
  input.schedulerConfig.parameters.w[0] = 99;
  assert.equal(state.items[0].example.gradingRule.targetAnswer, 'postponed');
  assert.equal(state.schedulerConfig.parameters.w[0], fixture.config.parameters.w[0]);
  for (const mutate of [(v) => v.items = [], (v) => v.items[1] = v.items[0], (v) => v.settings.timezone = 'Invalid/Zone',
    (v) => v.questionPolicyVersion = 'other', (v) => v.items[0].seed.gradingRuleId = uuid(999),
    (v) => v.items[0].checkpoint.schedulerConfigId = uuid(999), (v) => v.items[0].seed.baseProgressVersion = 1]) {
    const invalid = sessionInput(core, senses, fixture.config); mutate(invalid);
    assert.throws(() => core.createSession(invalid));
  }
});

test('세션 생성 경계에서도 신규 제한과 아직 도래하지 않은 복습을 거절한다', () => {
  const excess = sessionInput(core, senses, fixture.config);
  excess.settings.newWordLimit = 1;
  assert.throws(() => core.createSession(excess), { code: 'INVALID_SESSION' });
  const future = sessionInput(core, senses, fixture.config);
  future.items[0].checkpoint.cardState = structuredClone(fixture.steps[2].expected);
  assert.throws(() => core.createSession(future), { code: 'INVALID_SESSION' });
  future.items[0].checkpoint.pendingTargetCheck = true;
  assert.equal(core.createSession(future).items[0].pendingTargetCheck, true);
});
