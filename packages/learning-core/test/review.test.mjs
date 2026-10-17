import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as core from '@learning-voca/learning-core';
const fixture = JSON.parse(readFileSync(new URL('../../../content/fixtures/review.json', import.meta.url), 'utf8'));

test('고정 FSRS 버전은 Again·Good·졸업·재학습의 전체 카드와 일정을 보존한다', () => {
  let card = core.createNewCard();
  for (const step of fixture.steps) {
    const previous = structuredClone(card);
    card = core.scheduleReview(card, step.rating, step.effectiveAt, fixture.config);
    assert.deepEqual(card, step.expected);
    assert.deepEqual(previous, core.validateCardState(previous));
  }
});

test('무힌트 목표 답만 Good이며 힌트·형태 오류·오답·모르겠어요는 짧은 Again이다', () => {
  for (const [outcome, hintUsed, rating, offset] of [
    ['target_correct', false, 'Good', 10], ['target_correct', true, 'Again', 1],
    ['form_error', false, 'Again', 1], ['incorrect', true, 'Again', 1], ['dont_know', false, 'Again', 1],
  ]) {
    const result = core.reviewFirstAttempt(core.createNewCard(), { outcome, hintUsed, answeredAt: fixture.steps[0].effectiveAt }, fixture.config);
    assert.equal(result.rating, rating);
    assert.equal(Date.parse(result.cardState.due) - Date.parse(fixture.steps[0].effectiveAt), offset * 60000);
    assert.equal(result.pendingTargetCheck, false);
  }
});

test('유효한 대체 표현은 기존 일정·횟수를 보존하고 목표 확인만 대기한다', () => {
  for (const card of [core.createNewCard(), fixture.steps[2].expected]) {
    const result = core.reviewFirstAttempt(card, { outcome: 'valid_alternative', hintUsed: true, answeredAt: fixture.steps[3].effectiveAt }, fixture.config);
    assert.deepEqual(result.cardState, card);
    assert.equal(result.rating, null);
    assert.equal(result.pendingTargetCheck, true);
  }
});

for (const [name, mutate] of [
  ['라이브러리 버전', (c) => c.libraryVersion = '5.3.1'], ['정책 버전', (c) => c.policyVersion = 'other'],
  ['fuzz', (c) => c.parameters.enable_fuzz = true], ['누락 설정', (c) => delete c.parameters.learning_steps],
  ['가중치 자동 보정', (c) => c.parameters.w[0] = -1], ['다른 가중치 길이', (c) => c.parameters.w.pop()],
  ['NaN', (c) => c.parameters.w[0] = NaN], ['무한대', (c) => c.parameters.request_retention = Infinity],
  ['유지율 경계', (c) => c.parameters.request_retention = 1], ['단기 단계 역행', (c) => c.parameters.learning_steps = ['10m', '1m']],
  ['하루 이상 단계', (c) => c.parameters.learning_steps = ['1d']], ['임의 설정', (c) => c.parameters.extra = true],
]) {
  test(`잘못된 FSRS 설정 거절: ${name}`, () => {
    const config = structuredClone(fixture.config); mutate(config);
    assert.throws(() => core.scheduleReview(core.createNewCard(), 'Good', fixture.steps[0].effectiveAt, config));
  });
}

test('시간 역행·잘못된 날짜·Hard/Easy·손상된 카드를 거절한다', () => {
  const card = fixture.steps[2].expected;
  for (const at of ['2026-10-08T00:00:00Z', 'invalid', '2026-02-30T00:00:00Z']) {
    assert.throws(() => core.scheduleReview(card, 'Good', at, fixture.config));
  }
  for (const rating of ['Hard', 'Easy', 'Manual']) assert.throws(() => core.scheduleReview(card, rating, fixture.steps[3].effectiveAt, fixture.config));
  for (const altered of [{ ...card, lastReview: null }, { ...card, difficulty: 11 }, { ...card, reps: 0 },
    { ...card, due: '2026-01-01T00:00:00Z' }, { ...core.createNewCard(), due: card.due }]) {
    assert.throws(() => core.scheduleReview(altered, 'Good', fixture.steps[3].effectiveAt, fixture.config));
  }
});

test('명시한 시간·설정만 사용하며 frozen 입력을 변경하지 않는다', () => {
  const config = structuredClone(fixture.config);
  Object.freeze(config.parameters.w); Object.freeze(config.parameters.learning_steps); Object.freeze(config.parameters.relearning_steps);
  Object.freeze(config.parameters); Object.freeze(config);
  const before = Object.freeze(core.createNewCard());
  assert.deepEqual(core.scheduleReview(before, 'Again', fixture.steps[0].effectiveAt, config), fixture.steps[0].expected);
});
