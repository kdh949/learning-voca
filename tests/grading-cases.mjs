// Node 단위 테스트와 실제 브라우저 비교가 같은 입력·기대 판정을 사용한다.
export const gradingCases = [
  { name: '목표 과거형', sense: 0, raw: 'postponed', outcome: 'target_correct' },
  { name: '힌트 사용 목표 답', sense: 0, raw: 'postponed', hintUsed: true, outcome: 'target_correct' },
  { name: '대소문자와 앞뒤 공백', sense: 0, raw: '  POSTPONED  ', outcome: 'target_correct' },
  { name: 'NFKC 전각 영문', sense: 0, raw: 'ＰＯＳＴＰＯＮＥＤ', outcome: 'target_correct' },
  { name: '검수된 대체 표현', sense: 0, raw: 'delayed', outcome: 'valid_alternative' },
  { name: '힌트 뒤 대체 표현도 평가 보류', sense: 0, raw: 'delayed', hintUsed: true, outcome: 'valid_alternative' },
  { name: '다중 단어 대체 표현의 연속 공백', sense: 0, raw: ' put\t off ', outcome: 'valid_alternative' },
  { name: '명시한 형태 오류', sense: 0, raw: 'postpone', outcome: 'form_error' },
  { name: '힌트 뒤 형태 오류', sense: 0, raw: 'postpone', hintUsed: true, outcome: 'form_error' },
  { name: '어간 추론 없음', sense: 0, raw: 'postponing', outcome: 'incorrect' },
  { name: '문장부호 보존', sense: 0, raw: 'postponed!', outcome: 'incorrect' },
  { name: '단어 안 공백 보존', sense: 0, raw: 'post poned', outcome: 'incorrect' },
  { name: '단어 안 하이픈 보존', sense: 0, raw: 'post-poned', outcome: 'incorrect' },
  { name: '정규화는 제로폭 문자를 임의 삭제하지 않음', sense: 0, raw: 'post\u200bponed', outcome: 'incorrect' },
  { name: '명사 book', sense: 1, raw: 'book', outcome: 'target_correct' },
  { name: '명사 문맥의 복수형 오류', sense: 1, raw: 'books', outcome: 'form_error' },
  { name: '명사에 동사 대체 답을 적용하지 않음', sense: 1, raw: 'reserve', outcome: 'incorrect' },
  { name: '동사 book', sense: 2, raw: 'book', outcome: 'target_correct' },
  { name: '동사 문맥의 대체 표현', sense: 2, raw: 'reserve', outcome: 'valid_alternative' },
  { name: '동사 문맥의 과거형 오류', sense: 2, raw: 'booked', outcome: 'form_error' },
  { name: '다중 단어 목표 답', sense: 3, raw: ' PUT\n  OFF ', outcome: 'target_correct' },
  { name: '다중 단어의 경계를 지우지 않음', sense: 3, raw: 'putoff', outcome: 'incorrect' },
  { name: '아포스트로피 목표 답', sense: 4, raw: "don't", outcome: 'target_correct' },
  { name: '검수된 동등 표기', sense: 4, raw: 'don’t', outcome: 'target_correct' },
  { name: '아포스트로피를 임의 삭제하지 않음', sense: 4, raw: 'dont', outcome: 'incorrect' },
  { name: '하이픈 목표 답', sense: 5, raw: 'check-in', outcome: 'target_correct' },
  { name: '하이픈 삭제를 허용하지 않음', sense: 5, raw: 'checkin', outcome: 'incorrect' },
];

export const practiceCases = [
  { name: '빈 재연습 입력', sense: 0, raw: '', status: 'empty', targetCompleted: false },
  { name: '목표 답의 접두사', sense: 0, raw: 'postpone', status: 'prefix', targetCompleted: false },
  { name: '대체 표현의 접두사', sense: 0, raw: 'dela', status: 'prefix', targetCompleted: false },
  { name: '다중 단어 대체 표현 접두사', sense: 0, raw: 'put o', status: 'prefix', targetCompleted: false },
  { name: '재연습 목표 완료', sense: 0, raw: 'postponed', status: 'target_correct', targetCompleted: true },
  { name: '대체 표현은 목표 재연습 완료가 아님', sense: 0, raw: 'delayed', status: 'valid_alternative', targetCompleted: false },
  { name: '접두사 오류', sense: 0, raw: 'postpx', status: 'incorrect', targetCompleted: false },
  { name: '재연습에서 확인된 형태 오류', sense: 2, raw: 'booked', status: 'form_error', targetCompleted: false },
  { name: '동등 표기로 재연습 완료', sense: 4, raw: 'don’t', status: 'target_correct', targetCompleted: true },
  { name: 'IME 중 오류 확정 금지', sense: 0, raw: 'ㅍ', composing: true, status: 'composing', targetCompleted: false },
  { name: 'IME 중 완료 확정 금지', sense: 0, raw: 'postponed', composing: true, status: 'composing', targetCompleted: false },
];

/** 같은 실제 패키지의 공개 함수를 호출한 관찰값이다. 기대 결과나 가짜 서버 응답으로 대체하지 않는다. */
export function observeCases(core, contracts, fixtures) {
  const senses = fixtures.map((sense) => contracts.SenseRevisionSchema.parse(sense));
  return {
    grades: gradingCases.map((item) => ({ name: item.name,
      result: core.gradeAnswer(senses[item.sense].examples[0].gradingRule, item.raw, item.hintUsed ?? false) })),
    practice: practiceCases.map((item) => ({ name: item.name,
      result: core.getPracticeFeedback(senses[item.sense].examples[0].gradingRule, item.raw, item.composing ?? false) })),
    hints: senses.map((sense) => core.getHint(sense.examples[0].gradingRule)),
  };
}
