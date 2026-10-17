import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as core from '@learning-voca/learning-core';
import { candidate, uuid } from '../../../tests/session-cases.mjs';
const senses = JSON.parse(readFileSync(new URL('../../../content/fixtures/grading.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('../../../content/fixtures/review.json', import.meta.url), 'utf8'));
const now = '2026-10-11T00:11:00Z';
const topic = uuid(11), travel = uuid(12), adult = uuid(13);
function catalog() {
  const sense = structuredClone(senses[0]); sense.difficulty = 3;
  sense.examples[0].topicIds = [topic]; sense.examples[0].difficulty = 1;
  const travelExample = { ...structuredClone(sense.examples[0]), id: uuid(22), topicIds: [travel] };
  const advanced = { ...structuredClone(sense.examples[0]), id: uuid(23), difficulty: 3 };
  sense.examples.push(travelExample, advanced);
  const deck = { id: uuid(31), deckId: uuid(32), version: 1, title: '검증 단어장', description: '', status: 'published', rowVersion: 1,
    etag: '"1"', items: [{ senseId: sense.senseId, position: 0 }], topicIds: [topic, travel], audienceIds: [adult] };
  return { selection: { source: 'catalog', topicIds: [topic], audienceIds: [adult], difficultyMin: 1, difficultyMax: 1 },
    policyVersion: core.CONTENT_SELECTION_POLICY_VERSION, senses: [sense], decks: [deck], savedSenseIds: [], difficultyLevels: [1, 3] };
}
const checkpoint = (sense, cardState = fixture.steps[2].expected, pendingTargetCheck = false) => ({
  id: uuid(600), senseId: sense.senseId, goal: 'cloze_recall', progressVersion: cardState.reps,
  schedulerConfigId: fixture.config.id, cardState: structuredClone(cardState), pendingTargetCheck,
});
const questions = (overrides = {}) => core.selectQuestions({ candidates: senses.map((s) => candidate(s)), progress: [],
  excludedSenseIds: [], conflictingSenseIds: [], withdrawnSenseIds: [], limits: { sessionLimit: 20, newWordLimit: 5 },
  now, seed: 'fixed-seed', policyVersion: core.QUESTION_SELECTION_POLICY_VERSION, ...overrides });

test('단어장·예문·선택 주제 교집합과 대상 AND, 배열 OR, 예문 난이도 양끝을 적용한다', () => {
  const input = catalog();
  assert.deepEqual(core.selectContentCandidates(input), [candidate(input.senses[0], input.decks[0].id)]);
  input.selection.topicIds.push(travel);
  assert.equal(core.selectContentCandidates(input).length, 2);
  input.selection.difficultyMax = 3;
  assert.equal(core.selectContentCandidates(input).length, 3);
  input.decks[0].topicIds = [topic];
  assert.equal(core.selectContentCandidates(input).length, 2);
  input.selection.audienceIds = [uuid(99), adult];
  assert.equal(core.selectContentCandidates(input).length, 2);
  input.decks[0].audienceIds = [];
  assert.deepEqual(core.selectContentCandidates(input), []);
});

test('조건 밖 콘텐츠·미게시 콘텐츠로 범위를 넓히지 않으며 빈 배열·미등록 난이도를 거절한다', () => {
  const input = catalog();
  for (const selection of [{ topicIds: [] }, { difficultyMin: 3, difficultyMax: 1 }, { difficultyMin: 2 }, {}]) {
    assert.throws(() => core.selectContentCandidates({ ...input, selection }));
  }
  assert.deepEqual(core.selectContentCandidates({ ...input, selection: { deckIds: [uuid(99)] } }), []);
  assert.deepEqual(core.selectContentCandidates({ ...input, decks: [{ ...input.decks[0], status: 'withdrawn' }] }), []);
  assert.deepEqual(core.selectContentCandidates({ ...input, senses: [{ ...input.senses[0], status: 'in_review' }] }), []);
  assert.throws(() => core.selectContentCandidates({ ...input, policyVersion: 'other' }), { code: 'UNSUPPORTED_POLICY' });
});

test('saved는 고정 저장 목록·예문 주제를 사용하고 단어장·대상 조건을 거절한다', () => {
  const input = catalog();
  const selection = { source: 'saved', topicIds: [travel], difficultyMin: 1, difficultyMax: 1 };
  const saved = { ...input, selection, savedSenseIds: [input.senses[0].senseId] };
  const result = core.selectContentCandidates(saved);
  assert.equal(result.length, 1); assert.equal(result[0].deckRevisionId, null);
  assert.equal(result[0].exampleRevisionId, uuid(22));
  assert.deepEqual(core.selectContentCandidates({ ...saved, savedSenseIds: [] }), []);
  for (const selection of [{ source: 'saved', deckIds: [uuid(1)] }, { source: 'saved', audienceIds: [adult] }]) {
    assert.throws(() => core.selectContentCandidates({ ...saved, selection }));
  }
});

test('복습 → 목표 확인 대기 → 신규, 미래 복습 제외와 세션당 신규 제한을 적용한다', () => {
  const progress = [checkpoint(senses[0]), checkpoint(senses[1], core.createNewCard(), true),
    checkpoint(senses[2], { ...fixture.steps[2].expected, due: '2027-01-01T00:00:00Z' })];
  const selected = questions({ progress, limits: { sessionLimit: 3, newWordLimit: 5 } });
  assert.deepEqual(selected.map((q) => q.kind), ['review', 'target_check', 'new']);
  assert.equal(selected[0].candidate.senseId, senses[0].senseId);
  assert.equal(selected[1].candidate.senseId, senses[1].senseId);
  assert.equal(selected.some((q) => q.candidate.senseId === senses[2].senseId), false);
  assert.equal(questions({ limits: { sessionLimit: 20, newWordLimit: 2 } }).length, 2);
});

test('복습 18개면 신규 2개, 복습 25개면 20개만 고르며 오래된 일정부터 출제한다', () => {
  for (const count of [18, 25]) {
    const candidates = Array.from({ length: 30 }, (_, n) => ({ ...candidate(senses[0]), senseId: uuid(1000 + n),
      senseRevisionId: uuid(2000 + n), exampleRevisionId: uuid(3000 + n), gradingRuleId: uuid(4000 + n) }));
    const progress = candidates.slice(0, count).map((c, n) => ({ ...checkpoint({ senseId: c.senseId }), id: uuid(5000 + n),
      cardState: { ...fixture.steps[2].expected, due: `2026-10-10T00:${String(n).padStart(2, '0')}:00Z`, lastReview: '2026-10-09T00:00:00Z' } }));
    const result = questions({ candidates, progress });
    assert.equal(result.length, 20);
    assert.equal(result.filter((q) => q.kind === 'review').length, Math.min(count, 20));
    assert.equal(result.filter((q) => q.kind === 'new').length, count === 18 ? 2 : 0);
    assert.equal(result[0].candidate.senseId, candidates[0].senseId);
  }
});

test('제외·충돌·인지한 중단은 패키지 안에서 적용하고 비어 있으면 명시적으로 실패한다', () => {
  const ids = senses.map((s) => s.senseId);
  const result = questions({ excludedSenseIds: [ids[0]], conflictingSenseIds: [ids[1]], withdrawnSenseIds: [ids[2]] });
  assert.equal(result.length, 3);
  assert.equal(result.some((q) => ids.slice(0, 3).includes(q.candidate.senseId)), false);
  assert.throws(() => questions({ excludedSenseIds: ids }), { code: 'NO_ELIGIBLE_ITEMS' });
  assert.throws(() => questions({ limits: { sessionLimit: 20, newWordLimit: 0 } }), { code: 'NO_ELIGIBLE_ITEMS' });
  assert.throws(() => questions({ candidates: [] }), { code: 'NO_ELIGIBLE_ITEMS' });
});

test('같은 의미의 예문·출처는 하나만 고르며 입력 순서·진도 순서와 무관하게 seed 결과가 같다', () => {
  const candidates = senses.flatMap((sense, index) => [candidate(sense), { ...candidate(sense), deckRevisionId: uuid(800) },
    { ...candidate(sense), exampleRevisionId: uuid(810 + index), gradingRuleId: uuid(820 + index) }]);
  const progress = [checkpoint(senses[0]), checkpoint(senses[1])];
  const original = structuredClone({ candidates, progress });
  const selected = questions({ candidates, progress });
  assert.equal(new Set(selected.map((q) => q.candidate.senseId)).size, selected.length);
  assert.deepEqual(questions({ candidates: [...candidates].reverse(), progress: [...progress].reverse() }), selected);
  assert.deepEqual({ candidates, progress }, original);
  const choices = new Set(Array.from({ length: 12 }, (_, n) => JSON.stringify(questions({ candidates, progress, seed: `seed-${n}` }))));
  assert.ok(choices.size > 1);
});

test('중복 후보·복수 의미 버전·진도·알 수 없는 정책·빈 seed·잘못된 제한을 거절한다', () => {
  const c = candidate(senses[0]);
  for (const overrides of [{ candidates: [c, c] }, { candidates: [c, { ...c, exampleRevisionId: uuid(999), senseRevisionId: uuid(998) }] },
    { progress: [checkpoint(senses[0]), checkpoint(senses[0])] }, { seed: '' }, { policyVersion: 'other' },
    { limits: { sessionLimit: 0, newWordLimit: 5 } }, { limits: { sessionLimit: 1, newWordLimit: -1 } }, { now: 'not-a-date' }]) {
    assert.throws(() => questions(overrides));
  }
});

test('같은 예문 ID의 다른 채점 규칙을 출처별 별개 후보로 숨기지 않는다', () => {
  const c = candidate(senses[0]);
  assert.throws(() => questions({ candidates: [c, { ...c, deckRevisionId: uuid(999), gradingRuleId: uuid(998) }] }), { code: 'INVALID_CANDIDATES' });
});

test('콘텐츠 선택은 중복 예문 ID의 덮어쓰기와 잘못된 의미 참조를 거절한다', () => {
  const duplicate = catalog();
  duplicate.senses[0].examples.push({ ...structuredClone(duplicate.senses[0].examples[0]), gradingRule: { ...duplicate.senses[0].examples[0].gradingRule, id: uuid(99) } });
  assert.throws(() => core.selectContentCandidates(duplicate), { code: 'INVALID_CANDIDATES' });
  const invalid = catalog(); invalid.senses[0].examples[0].senseRevisionId = uuid(99);
  assert.throws(() => core.selectContentCandidates(invalid), { code: 'INVALID_CANDIDATES' });
});
