import { z } from 'zod';
import { sessionEventFields } from './event-fields';

// 최초 답안·힌트·재연습은 같은 스트림 식별·순서·발생 시각을 공유한다.
const eventFields = {
  ...sessionEventFields,
  sessionItemId: z.uuid(),
};

const progressFields = {
  gradingRuleId: z.uuid(),
  baseCheckpointId: z.uuid(),
  previousProgressEventId: z.uuid().nullable(),
};

export const HintRevealedEventSchema = z.strictObject({
  ...eventFields,
  type: z.literal('hint.revealed'),
  payload: z.strictObject({ gradingRuleId: z.uuid() }),
});

/** 힌트 사용·채점 결과·새 일정은 클라이언트의 권위 있는 입력으로 받지 않는다. */
export const AnswerSubmittedEventSchema = z.strictObject({
  ...eventFields,
  type: z.literal('answer.submitted'),
  payload: z.strictObject({ ...progressFields, rawAnswer: z.string().min(1) }),
});

/** 모르겠어요는 빈 답안과 구분한 명시적인 최초 시도다. */
export const AnswerGivenUpEventSchema = z.strictObject({
  ...eventFields,
  type: z.literal('answer.given_up'),
  payload: z.strictObject(progressFields),
});

export const PracticeSubmittedEventSchema = z.strictObject({
  ...eventFields,
  type: z.literal('practice.submitted'),
  payload: z.strictObject({ rawAnswer: z.string().min(1), gradingRuleId: z.uuid() }),
});

/** 전체 LearningEvent가 아니라 이번에 구현한 네 답안 관련 이벤트만 검사한다. */
export const AnswerEventSchema = z.discriminatedUnion('type', [
  HintRevealedEventSchema,
  AnswerSubmittedEventSchema,
  AnswerGivenUpEventSchema,
  PracticeSubmittedEventSchema,
]);

export type AnswerEvent = z.infer<typeof AnswerEventSchema>;
