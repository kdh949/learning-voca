import { z } from 'zod';

// 답안·문항 이동·세션 완료는 같은 기기 스트림의 식별·순서·시각 규칙을 사용한다.
export const sessionEventFields = {
  eventId: z.uuid(), schemaVersion: z.literal(1), sequence: z.number().int().min(1),
  occurredAt: z.iso.datetime({ offset: true }), sessionId: z.uuid(),
};
