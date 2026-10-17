export const uuid = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const startedAt = '2026-10-09T14:59:00Z';

/** 실제 계약으로 파싱되는 검증 데이터다. 제품의 세션·UUID 발급을 대신하지 않는다. */
export function sessionInput(core, senses, config, indices = [0, 1]) {
  return { id: uuid(100), startedAt, settings: { timezone: 'Asia/Seoul', sessionLimit: 20, newWordLimit: 5, autoplayAfterAnswer: false },
    questionPolicyVersion: core.QUESTION_SELECTION_POLICY_VERSION, schedulerConfig: structuredClone(config),
    items: indices.map((index, position) => {
      const sense = senses[index], example = sense.examples[0];
      return { seed: { id: uuid(200 + position), position, senseId: sense.senseId, goal: 'cloze_recall', senseRevisionId: sense.id,
        exampleRevisionId: example.id, gradingRuleId: example.gradingRule.id, baseProgressVersion: 0,
        baseCheckpointId: uuid(300 + position), sourceDeckRevisionId: uuid(400) },
      example: structuredClone(example), checkpoint: { id: uuid(300 + position), senseId: sense.senseId, goal: 'cloze_recall',
        progressVersion: 0, schedulerConfigId: config.id, cardState: core.createNewCard(), pendingTargetCheck: false } };
    }) };
}

export function sessionEvent(state, type, sequence, payload = {}, index = 0, occurredAt = '2026-10-09T15:01:00Z') {
  return { eventId: uuid(500 + sequence), schemaVersion: 1, sequence, occurredAt, type, sessionId: state.id,
    ...(type === 'session.completed' ? {} : { sessionItemId: state.items[index].item.id }), payload };
}
export function answerPayload(state, rawAnswer, index = 0) {
  return { gradingRuleId: state.items[index].item.gradingRuleId, baseCheckpointId: state.items[index].item.baseCheckpointId,
    previousProgressEventId: null, ...(rawAnswer === null ? {} : { rawAnswer }) };
}
export function candidate(sense, deckRevisionId = uuid(400)) {
  const example = sense.examples[0];
  return { deckRevisionId, senseId: sense.senseId, senseRevisionId: sense.id, exampleRevisionId: example.id, gradingRuleId: example.gradingRule.id };
}

/** 17개의 실제 최초 제출을 만들어 채점·힌트 분류부터 75% 집계까지 검증한다. */
export function statisticsExample(core, senses, config) {
  const attempts = Array.from({ length: 17 }, (_, index) => {
    const input = sessionInput(core, senses, config, [0]);
    input.id = uuid(6000 + index); input.items[0].seed.id = uuid(6100 + index);
    let state = core.createSession(input);
    const hintUsed = index === 12 || index === 13;
    if (hintUsed) {
      state = core.applySessionEvent(state, { ...sessionEvent(state, 'hint.revealed', 1, { gradingRuleId: state.items[0].item.gradingRuleId }), eventId: uuid(6200 + index) });
    }
    const raw = index < 14 ? 'postponed' : index === 14 ? 'postpone' : index === 15 ? null : 'delayed';
    state = core.applySessionEvent(state, { ...sessionEvent(state, raw === null ? 'answer.given_up' : 'answer.submitted', 2,
      answerPayload(state, raw)), eventId: uuid(6300 + index) });
    return state.items[0].firstAttempt;
  });
  return core.calculateStatistics(attempts);
}

/** Node와 브라우저에서 같은 공개 함수를 호출해 상태·FSRS 카드·시간대·출제 결과를 비교한다. */
export function observeSessionCases(core, contracts, senses, fixture) {
  let card = core.createNewCard();
  const reviews = fixture.steps.map((step) => {
    card = core.scheduleReview(card, step.rating, step.effectiveAt, fixture.config);
    return card;
  });
  let session = core.createSession(sessionInput(core, senses, fixture.config));
  const events = [
    sessionEvent(session, 'hint.revealed', 1, { gradingRuleId: session.items[0].item.gradingRuleId }),
    sessionEvent(session, 'answer.submitted', 2, answerPayload(session, 'postpone')),
    sessionEvent(session, 'practice.submitted', 3, { gradingRuleId: session.items[0].item.gradingRuleId, rawAnswer: 'postponed' }),
    sessionEvent(session, 'item.advanced', 4),
    sessionEvent(session, 'answer.given_up', 5, answerPayload(session, null, 1), 1),
    sessionEvent(session, 'item.advanced', 6, {}, 1), sessionEvent(session, 'session.completed', 7),
  ];
  const transitions = events.map((event) => { session = core.applySessionEvent(session, event); return session; });
  const progress = [
    { id: uuid(300), senseId: senses[0].senseId, goal: 'cloze_recall', progressVersion: 3, cardState: fixture.steps[2].expected,
      pendingTargetCheck: false, schedulerConfigId: fixture.config.id },
    { id: uuid(301), senseId: senses[1].senseId, goal: 'cloze_recall', progressVersion: 0, cardState: core.createNewCard(),
      pendingTargetCheck: true, schedulerConfigId: fixture.config.id },
  ];
  const questions = core.selectQuestions({ candidates: senses.flatMap((sense) => [candidate(sense), candidate(sense, uuid(401))]), progress,
    excludedSenseIds: [], conflictingSenseIds: [senses[2].senseId], withdrawnSenseIds: [], limits: { sessionLimit: 3, newWordLimit: 3 },
    now: '2026-10-11T00:11:00Z', seed: '검증용 고정 seed', policyVersion: core.QUESTION_SELECTION_POLICY_VERSION });
  return { reviews, transitions, questions, statistics: core.calculateStatistics(session.items.map((item) => item.firstAttempt)),
    statistics75: statisticsExample(core, senses, fixture.config),
    dates: ['Asia/Seoul', 'America/New_York', 'UTC'].map((timezone) => core.getStudyDate('2026-10-09T15:00:00Z', timezone)),
    parsedItems: session.items.map((value) => contracts.SessionItemSchema.parse(value.item)) };
}
