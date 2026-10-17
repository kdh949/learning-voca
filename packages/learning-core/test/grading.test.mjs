import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as core from '@learning-voca/learning-core';
import contracts from '../../contracts/dist/index.js';
import { gradingCases, practiceCases } from '../../../tests/grading-cases.mjs';

const fixtures = JSON.parse(readFileSync(new URL('../../../content/fixtures/grading.json', import.meta.url), 'utf8'));
const senses = fixtures.map((sense) => contracts.SenseRevisionSchema.parse(sense));
const rule = (index) => senses[index].examples[0].gradingRule;

for (const item of gradingCases) {
  test(`최초 답 판정: ${item.name}`, () => {
    const result = core.gradeAnswer(rule(item.sense), item.raw, item.hintUsed ?? false);
    contracts.GradingResultSchema.parse(result);
    assert.equal(result.outcome, item.outcome);
    assert.equal(result.hintUsed, item.hintUsed ?? false);
    const alternative = item.outcome === 'valid_alternative';
    assert.equal(result.targetRecallEvaluated, !alternative);
    assert.equal(result.scheduleEffect, alternative ? 'deferred' : 'applied');
    assert.equal(result.scheduleRating, alternative ? null : item.outcome === 'target_correct' && !item.hintUsed ? 'Good' : 'Again');
  });
}

for (const item of practiceCases) {
  test(`재연습 피드백: ${item.name}`, () => {
    const result = core.getPracticeFeedback(rule(item.sense), item.raw, item.composing ?? false);
    assert.equal(result.status, item.status);
    assert.equal(result.targetCompleted, item.targetCompleted);
    assert.equal('scheduleRating' in result, false);
    assert.equal('targetRecallEvaluated' in result, false);
  });
}

test('정규화는 원문 대신 별도 문자열을 반환하며 영문 이외의 대소문자는 변환하지 않는다', () => {
  assert.equal(core.normalizeAnswer('  ＰＵＴ\tOFF  '), 'put off');
  assert.equal(core.normalizeAnswer('İ É'), 'İ É');
  assert.equal(core.normalizeAnswer("Don't check-in!"), "don't check-in!");
});

test('검수한 안내를 반환하고 규칙을 변경하지 않는다', () => {
  const original = structuredClone(rule(0));
  const frozen = Object.freeze({ ...original, answers: Object.freeze(original.answers.map(Object.freeze)) });
  assert.equal(core.gradeAnswer(frozen, 'postpone').feedback, '지난 일이므로 과거형 postponed가 필요해요.');
  assert.equal(core.getHint(frozen), 'p');
  assert.deepEqual(frozen, original);
});

for (const raw of ['', '  \n\t ', '\u3000']) {
  test(`빈 제출 거절: ${JSON.stringify(raw)}`, () => {
    assert.throws(() => core.gradeAnswer(rule(0), raw), { code: 'EMPTY_ANSWER' });
  });
}

for (const [field, code] of [
  ['normalizationVersion', 'UNSUPPORTED_NORMALIZATION_VERSION'],
  ['gradingEngineVersion', 'UNSUPPORTED_GRADING_ENGINE_VERSION'],
]) {
  test(`구버전·알 수 없는 버전을 현재 로직으로 대체하지 않음: ${field}`, () => {
    const unsupported = { ...rule(0), [field]: 'unsupported-v99' };
    for (const invoke of [() => core.gradeAnswer(unsupported, 'postponed'),
      () => core.getHint(unsupported), () => core.getPracticeFeedback(unsupported, 'p')]) {
      assert.throws(invoke, { code });
    }
  });
}

for (const answers of [
  [{ kind: 'valid_alternative', answerText: ' POSTPONED ' }],
  [{ kind: 'valid_alternative', answerText: 'delay' }, { kind: 'known_form_error', answerText: 'ＤＥＬＡＹ' }],
]) {
  test(`정규화 후 답 충돌을 판정 우선순위로 숨기지 않음: ${answers.map((answer) => answer.answerText).join(', ')}`, () => {
    assert.throws(() => core.validateGradingRule({ ...rule(0), answers }), { code: 'DUPLICATE_RULE_ANSWER' });
  });
}

test('공백뿐인 목표 답·허용 답을 콘텐츠 규칙으로 등록하지 않음', () => {
  assert.throws(() => core.validateGradingRule({ ...rule(0), targetAnswer: ' ' }), { code: 'EMPTY_RULE_ANSWER' });
  assert.throws(() => core.validateGradingRule({ ...rule(0), answers: [{ kind: 'valid_alternative', answerText: ' ' }] }), { code: 'EMPTY_RULE_ANSWER' });
});

test('이 규칙 버전에서 목표 답 전체를 힌트로 노출하지 않음', () => {
  assert.throws(() => core.getHint({ ...rule(0), hintText: 'postponed' }), { code: 'INVALID_HINT' });
});

test('같은 표제어라도 명사·동사 의미와 예문 버전을 구분한다', () => {
  assert.equal(senses[1].expressionText, senses[2].expressionText);
  assert.notEqual(senses[1].senseId, senses[2].senseId);
  for (const sense of senses) {
    assert.equal(sense.examples[0].senseRevisionId, sense.id);
    core.validateGradingRule(sense.examples[0].gradingRule);
  }
});
