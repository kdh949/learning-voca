import { z } from 'zod';

export const GradingAnswerSchema = z.strictObject({
  kind: z.enum(['target_equivalent', 'valid_alternative', 'known_form_error']),
  answerText: z.string().min(1),
  feedback: z.string().optional(),
});

/** 전송 구조를 검사한다. 정규화 후 답 중복·지원 버전은 learning-core에서 검사한다. */
export const GradingRuleInputSchema = z.strictObject({
  targetAnswer: z.string().min(1),
  normalizationVersion: z.string().min(1),
  gradingEngineVersion: z.string().min(1),
  hintText: z.string().min(1),
  answers: z.array(GradingAnswerSchema),
});

export const GradingRuleSchema = GradingRuleInputSchema.extend({ id: z.uuid() });

export const TranslationSegmentSchema = z.strictObject({
  text: z.string(),
  emphasis: z.boolean(),
});

/** 게시·패키지 경계에서 사용한다. 참조의 소유권·게시 상태는 서버에서 추가 검사해야 한다. */
export const ExampleRevisionSchema = z.strictObject({
  id: z.uuid(),
  exampleId: z.uuid(),
  senseRevisionId: z.uuid(),
  sentenceTemplate: z.string().min(1)
    .refine((text) => text.split('{answer}').length === 2, '예문에는 {answer}가 정확히 하나 있어야 합니다.'),
  translationSegments: z.array(TranslationSegmentSchema).min(1),
  explanation: z.string(),
  difficulty: z.number().int().min(1),
  source: z.string().min(1),
  usageTerms: z.string().min(1),
  ordinal: z.number().int().min(0),
  gradingRule: GradingRuleSchema,
  topicIds: z.array(z.uuid()).min(0)
    .refine((ids) => new Set(ids).size === ids.length, '주제 ID는 중복될 수 없습니다.')
    .meta({ uniqueItems: true }),
});

export const SenseRevisionSchema = z.strictObject({
  id: z.uuid(),
  senseId: z.uuid(),
  version: z.number().int().min(1),
  status: z.enum(['draft', 'in_review', 'published', 'withdrawn']),
  rowVersion: z.number().int().min(1),
  etag: z.string(),
  expressionText: z.string().min(1),
  meaningKo: z.string().min(1),
  partOfSpeech: z.string().min(1),
  usageNote: z.string(),
  difficulty: z.number().int().min(1),
  source: z.string().min(1),
  usageTerms: z.string().min(1),
  examples: z.array(ExampleRevisionSchema),
});

export const GradingOutcomeSchema = z.enum([
  'target_correct', 'valid_alternative', 'form_error', 'incorrect',
]);

/** 미리보기 판정이다. scheduleEffect는 적용 정책을 뜻하며 DB 반영 완료를 보장하지 않는다. */
export const GradingResultSchema = z.strictObject({
  outcome: GradingOutcomeSchema,
  normalizedAnswer: z.string(),
  hintUsed: z.boolean(),
  targetRecallEvaluated: z.boolean(),
  scheduleRating: z.enum(['Good', 'Again']).nullable(),
  scheduleEffect: z.enum(['applied', 'deferred']),
  feedback: z.string(),
  targetAnswer: z.string().min(1),
});

export const FirstAttemptSchema = z.strictObject({
  id: z.uuid(),
  sessionItemId: z.uuid(),
  eventId: z.uuid(),
  senseId: z.uuid(),
  goal: z.literal('cloze_recall'),
  rawAnswer: z.string().nullable(),
  normalizedAnswer: z.string().nullable(),
  outcome: z.enum([...GradingOutcomeSchema.options, 'dont_know']),
  hintUsed: z.boolean(),
  answerRevealed: z.boolean(),
  answeredAt: z.iso.datetime({ offset: true }),
  studyDate: z.iso.date(),
});

export const PracticeAttemptSchema = z.strictObject({
  id: z.uuid(),
  sessionItemId: z.uuid(),
  eventId: z.uuid(),
  rawAnswer: z.string(),
  outcome: GradingOutcomeSchema,
  attemptedAt: z.iso.datetime({ offset: true }),
});

export type GradingAnswer = z.infer<typeof GradingAnswerSchema>;
export type GradingRuleInput = z.infer<typeof GradingRuleInputSchema>;
export type GradingRule = z.infer<typeof GradingRuleSchema>;
export type ExampleRevision = z.infer<typeof ExampleRevisionSchema>;
export type SenseRevision = z.infer<typeof SenseRevisionSchema>;
export type GradingResult = z.infer<typeof GradingResultSchema>;
export type FirstAttempt = z.infer<typeof FirstAttemptSchema>;
export type PracticeAttempt = z.infer<typeof PracticeAttemptSchema>;
