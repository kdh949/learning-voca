import { ContentSelectionSchema, DeckRevisionSchema, PackageCandidateSchema, SenseRevisionSchema, SessionSettingsSchema,
  CardStateSchema, ProgressCheckpointSchema, type ProgressCheckpoint, type ContentSelection, type DeckRevision, type PackageCandidate, type SenseRevision } from '@learning-voca/contracts';
import { validateCardState } from './review.js';

export const CONTENT_SELECTION_POLICY_VERSION = 'topic-selection-v1';
export const QUESTION_SELECTION_POLICY_VERSION = 'review-target-new-v1';

export class SelectionError extends Error {
  constructor(public readonly code: 'INVALID_SELECTION' | 'INVALID_CANDIDATES' | 'INVALID_PROGRESS' | 'UNSUPPORTED_POLICY' | 'NO_ELIGIBLE_ITEMS', message: string) {
    super(message); this.name = 'SelectionError';
  }
}
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const intersects = (a: readonly string[], b: readonly string[]) => a.some((id) => b.includes(id));
const candidateKey = (candidate: PackageCandidate) => `${candidate.senseId}/${candidate.exampleRevisionId}/${candidate.deckRevisionId ?? ''}`;

/** 한 카탈로그 스냅샷에서 후보 관계를 만든다. saved 목록의 소유권·활성 사전은 서버가 확인해서 제공해야 한다. */
export function selectContentCandidates(input: {
  selection: ContentSelection; policyVersion: string; senses: readonly SenseRevision[]; decks: readonly DeckRevision[];
  savedSenseIds: readonly string[]; difficultyLevels: readonly number[];
}): PackageCandidate[] {
  if (input.policyVersion !== CONTENT_SELECTION_POLICY_VERSION) throw new SelectionError('UNSUPPORTED_POLICY', '지원하지 않는 콘텐츠 선택 정책입니다.');
  const selection = ContentSelectionSchema.parse(input.selection);
  for (const level of [selection.difficultyMin, selection.difficultyMax]) {
    if (level !== undefined && !input.difficultyLevels.includes(level)) throw new SelectionError('INVALID_SELECTION', '등록된 난이도 양끝을 사용해야 합니다.');
  }
  const senses = input.senses.map((sense) => SenseRevisionSchema.parse(sense));
  const decks = input.decks.map((deck) => DeckRevisionSchema.parse(deck));
  const published = senses.filter((sense) => sense.status === 'published');
  if (new Set(published.map((sense) => sense.senseId)).size !== published.length || new Set(decks.map((deck) => deck.id)).size !== decks.length) {
    throw new SelectionError('INVALID_CANDIDATES', '스냅샷의 의미·단어장 버전이 중복됩니다.');
  }
  const exampleIds = new Set<string>();
  for (const sense of published) for (const example of sense.examples) {
    if (exampleIds.has(example.id) || example.senseRevisionId !== sense.id) {
      throw new SelectionError('INVALID_CANDIDATES', '예문 ID가 중복되거나 의미 버전 참조가 잘못되었습니다.');
    }
    exampleIds.add(example.id);
  }
  const result = new Map<string, PackageCandidate>();
  for (const sense of published) {
    const sources = (selection.source ?? 'catalog') === 'saved'
      ? input.savedSenseIds.includes(sense.senseId) ? [null] : []
      : decks.filter((deck) => deck.status === 'published' && deck.items.some((item) => item.senseId === sense.senseId) &&
        (selection.deckIds === undefined || selection.deckIds.includes(deck.deckId)) &&
        (selection.audienceIds === undefined || intersects(deck.audienceIds, selection.audienceIds)));
    for (const deck of sources) for (const example of sense.examples) {
      const sharedTopics = deck === null ? example.topicIds : example.topicIds.filter((id) => deck.topicIds.includes(id));
      if (sharedTopics.length === 0 || (selection.topicIds !== undefined && !intersects(sharedTopics, selection.topicIds)) ||
          (selection.difficultyMin !== undefined && example.difficulty < selection.difficultyMin) ||
          (selection.difficultyMax !== undefined && example.difficulty > selection.difficultyMax)) continue;
      const candidate: PackageCandidate = { deckRevisionId: deck?.id ?? null, senseId: sense.senseId, senseRevisionId: sense.id,
        exampleRevisionId: example.id, gradingRuleId: example.gradingRule.id };
      result.set(candidateKey(candidate), candidate);
    }
  }
  return [...result.values()].sort((a, b) => compare(candidateKey(a), candidateKey(b)));
}

export type QuestionProgress = ProgressCheckpoint;
export type SelectedQuestion = { kind: 'review' | 'target_check' | 'new'; candidate: PackageCandidate; progress: QuestionProgress | null };

// FNV-1a는 암호·무결성 검사용이 아니다. 입력 순서·런타임에 무관한 작은 출제 순서용 해시다.
function orderHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  return hash;
}

/** 검증된 패키지 안에서 예정 복습 → 목표 확인 대기 → 신규 순으로 선택한다. 현재 시각·제한·seed는 필수 입력이다. */
export function selectQuestions(input: {
  candidates: readonly PackageCandidate[]; progress: readonly QuestionProgress[];
  excludedSenseIds: readonly string[]; conflictingSenseIds: readonly string[]; withdrawnSenseIds: readonly string[];
  limits: { sessionLimit: number; newWordLimit: number }; now: string; seed: string; policyVersion: string;
}): SelectedQuestion[] {
  if (input.policyVersion !== QUESTION_SELECTION_POLICY_VERSION) throw new SelectionError('UNSUPPORTED_POLICY', '지원하지 않는 문항 선택 정책입니다.');
  CardStateSchema.shape.due.unwrap().parse(input.now);
  if (input.seed.length === 0) throw new SelectionError('INVALID_SELECTION', '고정 seed가 필요합니다.');
  const sessionLimit = SessionSettingsSchema.shape.sessionLimit.parse(input.limits.sessionLimit);
  const newWordLimit = SessionSettingsSchema.shape.newWordLimit.parse(input.limits.newWordLimit);
  const progress = new Map<string, QuestionProgress>();
  for (const raw of input.progress) {
    const value = ProgressCheckpointSchema.parse(raw);
    if (progress.has(value.senseId) || value.goal !== 'cloze_recall' || !Number.isSafeInteger(value.progressVersion) || value.progressVersion < 0) {
      throw new SelectionError('INVALID_PROGRESS', '의미별 진도·목표·버전이 잘못되었습니다.');
    }
    // 같은 CardState를 API·브라우저가 사용하므로 due를 따로 재정의하지 않는다.
    progress.set(value.senseId, { ...value, cardState: validateCardState(value.cardState) });
  }
  const excluded = new Set([...input.excludedSenseIds, ...input.conflictingSenseIds, ...input.withdrawnSenseIds]);
  const groups = new Map<string, PackageCandidate[]>();
  const seen = new Set<string>();
  const examples = new Map<string, PackageCandidate>();
  for (const raw of input.candidates) {
    const candidate = PackageCandidateSchema.parse(raw);
    const key = candidateKey(candidate);
    if (seen.has(key)) throw new SelectionError('INVALID_CANDIDATES', '패키지 후보 관계가 중복됩니다.');
    seen.add(key);
    const previousExample = examples.get(candidate.exampleRevisionId);
    if (previousExample && (previousExample.senseId !== candidate.senseId || previousExample.senseRevisionId !== candidate.senseRevisionId ||
        previousExample.gradingRuleId !== candidate.gradingRuleId)) {
      throw new SelectionError('INVALID_CANDIDATES', '같은 예문 ID가 서로 다른 의미·채점 버전을 참조합니다.');
    }
    examples.set(candidate.exampleRevisionId, candidate);
    const group = groups.get(candidate.senseId) ?? [];
    if (group.some((item) => item.senseRevisionId !== candidate.senseRevisionId)) throw new SelectionError('INVALID_CANDIDATES', '한 패키지의 의미 버전이 서로 다릅니다.');
    group.push(candidate); groups.set(candidate.senseId, group);
  }
  const reviews: SelectedQuestion[] = [], targetChecks: SelectedQuestion[] = [], fresh: SelectedQuestion[] = [];
  for (const [senseId, candidates] of groups) {
    if (excluded.has(senseId)) continue;
    candidates.sort((a, b) => compare(candidateKey(a), candidateKey(b)));
    const candidate = candidates[orderHash(`${input.seed}/${senseId}/example`) % candidates.length]!;
    const previous = progress.get(senseId) ?? null;
    const question = { candidate, progress: previous };
    if (previous?.pendingTargetCheck) targetChecks.push({ ...question, kind: 'target_check' });
    else if (previous === null || previous.cardState.state === 'New') fresh.push({ ...question, kind: 'new' });
    else if (Date.parse(previous.cardState.due!) <= Date.parse(input.now)) reviews.push({ ...question, kind: 'review' });
  }
  const tieOrder = (a: SelectedQuestion, b: SelectedQuestion) =>
    orderHash(`${input.seed}/${a.candidate.senseId}`) - orderHash(`${input.seed}/${b.candidate.senseId}`) || compare(a.candidate.senseId, b.candidate.senseId);
  reviews.sort((a, b) => Date.parse(a.progress!.cardState.due!) - Date.parse(b.progress!.cardState.due!) || tieOrder(a, b));
  targetChecks.sort(tieOrder); fresh.sort(tieOrder);
  const selected = [...reviews, ...targetChecks].slice(0, sessionLimit);
  selected.push(...fresh.slice(0, Math.min(newWordLimit, sessionLimit - selected.length)));
  if (selected.length === 0) throw new SelectionError('NO_ELIGIBLE_ITEMS', '이 패키지 안에 현재 학습할 수 있는 문항이 없습니다.');
  return selected;
}
