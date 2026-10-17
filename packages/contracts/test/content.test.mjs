import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import contracts from '../dist/index.js';

const sense = JSON.parse(readFileSync(new URL('../../../content/fixtures/grading.json', import.meta.url), 'utf8'))[0];
const example = sense.examples[0];

test('게시 fixture는 채점·콘텐츠 참조와 한국어 강조를 손실 없이 보존한다', () => {
  const parsed = contracts.SenseRevisionSchema.parse(sense);
  assert.deepEqual(parsed, sense);
  assert.equal(parsed.examples[0].gradingRule.answers[0].kind, 'valid_alternative');
  assert.equal(parsed.examples[0].translationSegments[1].emphasis, true);
});

for (const template of ['There is no blank.', '{answer} and {answer}', '']) {
  test(`예문의 목표 빈칸 누락·중복 거절: ${template}`, () => {
    assert.equal(contracts.ExampleRevisionSchema.safeParse({ ...example, sentenceTemplate: template }).success, false);
  });
}

test('유효하지 않은 예문 난이도와 중복 주제 참조를 거절한다', () => {
  assert.equal(contracts.ExampleRevisionSchema.safeParse({ ...example, difficulty: 0 }).success, false);
  assert.equal(contracts.ExampleRevisionSchema.safeParse({ ...example, topicIds: [sense.senseId, sense.senseId] }).success, false);
});

test('채점 규칙의 알 수 없는 답 종류·숨은 필드를 거절한다', () => {
  const rule = example.gradingRule;
  assert.equal(contracts.GradingRuleSchema.safeParse({ ...rule, answers: [{ kind: 'fuzzy_correct', answerText: 'postpon' }] }).success, false);
  assert.equal(contracts.GradingRuleSchema.safeParse({ ...rule, acceptAll: true }).success, false);
});
