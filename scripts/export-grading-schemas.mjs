import { createRequire } from 'node:module';

const requireContracts = createRequire(new URL('../packages/contracts/package.json', import.meta.url));
const { z } = requireContracts('zod');
const contracts = requireContracts('./dist');
const names = [
  'GradingAnswer', 'GradingRuleInput', 'GradingRule', 'TranslationSegment',
  'ExampleRevision', 'SenseRevision', 'GradingResult', 'FirstAttempt', 'PracticeAttempt',
  'HintRevealedEvent', 'AnswerSubmittedEvent', 'AnswerGivenUpEvent', 'PracticeSubmittedEvent',
];

// 스키마를 따로 수작업 복제하지 않고 실제 런타임 검증 정의에서 검사 자료를 얻는다.
process.stdout.write(JSON.stringify(Object.fromEntries(names.map((name) => [
  name, z.toJSONSchema(contracts[`${name}Schema`], { io: 'input' }),
]))));
