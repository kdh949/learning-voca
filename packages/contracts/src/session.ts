import { z } from 'zod';
import { sessionEventFields } from './event-fields';
import { AnswerGivenUpEventSchema, AnswerSubmittedEventSchema, HintRevealedEventSchema, PracticeSubmittedEventSchema } from './answer-events';

const ids = z.array(z.uuid()).refine((values) => new Set(values).size === values.length, 'ID는 중복될 수 없습니다.').meta({ uniqueItems: true });
const selectedIds = ids.min(1);

/** 빈 선택·saved의 단어장/대상 조건은 거절한다. 사전의 등록·활성 여부는 호출 경계에서 검사한다. */
export const ContentSelectionSchema = z.strictObject({
  source: z.enum(['catalog', 'saved']).optional().meta({ default: 'catalog' }),
  deckIds: selectedIds.optional(), topicIds: selectedIds.optional(), audienceIds: selectedIds.optional(),
  difficultyMin: z.number().int().min(1).optional(), difficultyMax: z.number().int().min(1).optional(),
}).superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) ctx.addIssue({ code: 'custom', message: '선택 조건을 명시해야 합니다.' });
  if (value.source === 'saved' && (value.deckIds !== undefined || value.audienceIds !== undefined)) {
    ctx.addIssue({ code: 'custom', message: '개인 저장 범위에는 단어장·대상 조건을 사용할 수 없습니다.' });
  }
  if (value.difficultyMin !== undefined && value.difficultyMax !== undefined && value.difficultyMin > value.difficultyMax) {
    ctx.addIssue({ code: 'custom', message: '최소 난이도는 최대 난이도보다 클 수 없습니다.' });
  }
}).meta({ minProperties: 1, allOf: [{ if: { properties: { source: { const: 'saved' } }, required: ['source'] },
  then: { not: { anyOf: [{ required: ['deckIds'] }, { required: ['audienceIds'] }] } } }] });

export const DeckItemSchema = z.strictObject({ senseId: z.uuid(), position: z.number().int().min(0) });
export const DeckRevisionSchema = z.strictObject({
  id: z.uuid(), deckId: z.uuid(), version: z.number().int().min(1), title: z.string().min(1), description: z.string(),
  status: z.enum(['draft', 'in_review', 'published', 'withdrawn']), rowVersion: z.number().int().min(1), etag: z.string(),
  items: z.array(DeckItemSchema), topicIds: ids.min(0), audienceIds: ids.min(0),
});

export const PackageCandidateSchema = z.strictObject({
  deckRevisionId: z.uuid().nullable(), senseId: z.uuid(), senseRevisionId: z.uuid(), exampleRevisionId: z.uuid(), gradingRuleId: z.uuid(),
});
export const CardStateSchema = z.strictObject({
  due: z.iso.datetime({ offset: true }).nullable(), lastReview: z.iso.datetime({ offset: true }).nullable(),
  stability: z.number().min(0), difficulty: z.number().min(0), elapsedDays: z.number().int().min(0),
  scheduledDays: z.number().int().min(0), reps: z.number().int().min(0), lapses: z.number().int().min(0),
  state: z.enum(['New', 'Learning', 'Review', 'Relearning']), learningSteps: z.number().int().min(0),
});

/** 전체 설정을 보존하며 누락을 라이브러리 기본값으로 채우지 않는다. 이 버전은 fuzz를 금지한다. */
export const FsrsParametersSchema = z.strictObject({
  request_retention: z.number().gt(0).lt(1), maximum_interval: z.number().int().min(1),
  w: z.array(z.number()).length(21), enable_fuzz: z.literal(false), enable_short_term: z.boolean(),
  learning_steps: z.array(z.string().regex(/^(?:[1-9]\d*)(?:m|h|d)$/)),
  relearning_steps: z.array(z.string().regex(/^(?:[1-9]\d*)(?:m|h|d)$/)),
});
export const SchedulerConfigSchema = z.strictObject({
  id: z.uuid(), libraryVersion: z.string().min(1), policyVersion: z.string().min(1),
  configHash: z.string().regex(/^[a-f0-9]{64}$/), parameters: FsrsParametersSchema,
});
export const ProgressCheckpointSchema = z.strictObject({
  id: z.uuid(), senseId: z.uuid(), goal: z.literal('cloze_recall'), progressVersion: z.number().int().min(0),
  cardState: CardStateSchema, pendingTargetCheck: z.boolean(), schedulerConfigId: z.uuid(),
});
export const SessionSettingsSchema = z.strictObject({
  timezone: z.string().min(1), sessionLimit: z.number().int().min(1), newWordLimit: z.number().int().min(0), autoplayAfterAnswer: z.boolean(),
});
export const SessionItemSeedSchema = z.strictObject({
  id: z.uuid(), position: z.number().int().min(0), senseId: z.uuid(), goal: z.literal('cloze_recall'),
  senseRevisionId: z.uuid(), exampleRevisionId: z.uuid(), gradingRuleId: z.uuid(),
  baseProgressVersion: z.number().int().min(0), baseCheckpointId: z.uuid(), sourceDeckRevisionId: z.uuid().nullable(),
});
export const SessionItemSchema = SessionItemSeedSchema.extend({
  phase: z.enum(['answering', 'feedback', 'practicing', 'done', 'skipped']), firstAttemptId: z.uuid().nullable(),
  hintUsed: z.boolean(), skipReason: z.enum(['excluded', 'withdrawn']).nullable(),
});

export const ItemAdvancedEventSchema = z.strictObject({ ...sessionEventFields, type: z.literal('item.advanced'),
  sessionItemId: z.uuid(), payload: z.strictObject({}) });
export const ItemSkippedEventSchema = z.strictObject({ ...sessionEventFields, type: z.literal('item.skipped'),
  sessionItemId: z.uuid(), payload: z.strictObject({ reason: z.enum(['excluded', 'withdrawn']) }) });
export const SessionCompletedEventSchema = z.strictObject({ ...sessionEventFields, type: z.literal('session.completed'), payload: z.strictObject({}) });
/** 이미 시작한 세션의 전이만 검사한다. 세션 생성·권한 검사를 대신하지 않는다. */
export const SessionEventSchema = z.discriminatedUnion('type', [
  HintRevealedEventSchema, AnswerSubmittedEventSchema, AnswerGivenUpEventSchema, PracticeSubmittedEventSchema,
  ItemAdvancedEventSchema, ItemSkippedEventSchema, SessionCompletedEventSchema,
]);

export type ContentSelection = z.infer<typeof ContentSelectionSchema>;
export type DeckRevision = z.infer<typeof DeckRevisionSchema>;
export type PackageCandidate = z.infer<typeof PackageCandidateSchema>;
export type CardState = z.infer<typeof CardStateSchema>;
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>;
export type ProgressCheckpoint = z.infer<typeof ProgressCheckpointSchema>;
export type SessionSettings = z.infer<typeof SessionSettingsSchema>;
export type SessionItemSeed = z.infer<typeof SessionItemSeedSchema>;
export type SessionItem = z.infer<typeof SessionItemSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;
