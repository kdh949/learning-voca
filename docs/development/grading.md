# 채점 계약과 순수 규칙

첫 착수 작업 2의 범위다. `contracts`는 전송·콘텐츠·기록의 구조를 검증하고 타입을 제공하며, `learning-core`는 같은 판정 로직을 브라우저와 Node에서 실행한다. 이후 순수 상태 전이·최초/재연습 분리·복습 매핑은 [세션·복습 개발 안내](./session-and-review.md)에 구현했다. DB 저장·인증·제품 API·화면은 아직 연결하지 않았다.

## 호출 경계

호출자는 입력을 해당 Zod schema로 먼저 파싱한 뒤 순수 함수에 전달한다. 예를 들어 예문은 `ExampleRevisionSchema`, 규칙만 받는 편집 입력은 `GradingRuleInputSchema`로 검사한다. `validateGradingRule`은 구조 검사 이후에 지원 버전·공백뿐인 답·정규화 후 답 중복·첫 글자 힌트를 확인한다.

```ts
import { ExampleRevisionSchema } from '@learning-voca/contracts';
import { gradeAnswer } from '@learning-voca/learning-core';

const example = ExampleRevisionSchema.parse(content);
const result = gradeAnswer(example.gradingRule, rawAnswer, storedHintUsed);
```

`storedHintUsed`는 먼저 저장한 힌트 이벤트·세션 상태에서 얻어야 한다. 답안 payload의 `hintUsed`, `outcome`, `userId`, `nextReviewAt`는 허용하지 않는다. 실제 서버의 인증·소유권·이벤트 순서·버전 참조 검증은 서버 이벤트 수신 작업에서 추가한다. UUID가 올바른 형식이라는 사실은 참조 권한을 증명하지 않는다.

## 구현한 버전과 판정

- `nfkc-space-case-v1`: NFKC, 앞뒤 공백 제거, 연속 공백 축소, ASCII 영문 A–Z의 대소문자 통일. 아포스트로피·하이픈·문장부호·제로폭 문자·어미는 임의 삭제하지 않는다.
- `exact-answers-v1`: 목표 답·검수된 목표 동등 표기는 `target_correct`, 검수된 대체 표현은 `valid_alternative`, 명시한 형태 오류는 `form_error`, 나머지는 `incorrect`다. 어간·편집 거리로 정답을 추론하지 않는다.
- 힌트 없는 목표 답은 `Good`, 힌트 사용 목표 답·형태 오류·오답은 `Again`, 대체 표현은 rating 없이 평가를 보류한다. `scheduleEffect`는 적용 정책이며 실제 DB·FSRS 일정 반영을 뜻하지 않는다.
- 알 수 없는 버전은 현재 규칙으로 대체하지 않고 `GradingError.code`로 거절한다. 같은 버전의 동작을 바꾸지 않으며 향후 변경은 새 버전을 추가한다.

`gradeAnswer`의 빈 답은 `EMPTY_ANSWER`다. 모르겠어요는 `answer.given_up`으로 구분하며 `FirstAttempt`에 원문·정규화 답의 `null`을 보존한다. 해당 이벤트의 최초 시도 생성·복습 매핑은 순수 세션 reducer에서 처리하며 실제 저장은 이후 DB 작업 범위다.

`getHint`는 이 규칙 버전에서 목표 답 첫 글자만 반환한다. 힌트 이벤트를 저장하기 전에 사용자에게 공개하면 안 되며 이 순수 함수 자체는 저장·공개를 수행하지 않는다.

`getPracticeFeedback`은 목표 답·동등 표기·대체 표현의 접두사를 인정한다. 목표 답·동등 표기에 도달해야 `targetCompleted=true`이며 대체 표현 입력은 목표 재연습 완료가 아니다. `postpone`는 `postponed`의 입력 중 접두사이므로 제출 전에 형태 오류를 확정하지 않는다. IME 조합 중에는 완료·오류를 확정하지 않는다. 입력을 삭제하거나 다음 문항으로 이동하지 않으며 rating·최초 평가 값을 반환하지 않는다. 순수 reducer가 최초/재연습 상태를 분리하며 저장의 유일성은 이후 DB 작업에서 강제한다.

## 검증 데이터와 실행

[grading.json](../../content/fixtures/grading.json)은 직접 작성한 검증 데이터다. `postponed / postpone / delayed / put off`, 명사·동사 `book`, 동등 표기의 아포스트로피와 보존할 하이픈을 포함한다. `published`는 schema 검증용 상태이며 실제 서버 게시 콘텐츠가 아니다. 앱·서버 실행 코드는 fixture를 읽지 않는다.

```sh
pnpm exec playwright install chromium
pnpm test

# 이미 build를 실행한 경우 공통 패키지를 다시 빌드하지 않고 검사한다.
pnpm test:unit
pnpm test:browser
pnpm check:contracts
```

`test:unit`·`test:browser`·`check:contracts` 전에 공통 패키지의 `dist/`가 필요하다. `pnpm test`는 공통 패키지를 먼저 빌드한다. OpenAPI 비교 도구는 기존 Python 검증 환경을 사용하며 자세한 준비는 루트 README를 따른다.

루트 `pnpm typecheck`는 의존 대상인 contracts의 타입 선언을 먼저 만든다. 이 준비가 없으면 깨끗한 checkout에서 learning-core의 타입 참조가 실패하며 기존 `dist/`가 문제를 가릴 수 있다. CI는 설치 직후 build보다 typecheck를 먼저 실행해 이 실패의 재발을 확인한다.

단위 테스트는 실제 공개 함수·경계 스키마의 판정과 거절 조건을 검사한다. Playwright는 검증용 Vite 페이지에서 실제 빌드된 workspace 패키지를 읽고 전체 fixture의 판정·안내·힌트·재연습 결과를 Node와 비교한다. root의 공통 패키지 devDependency와 검증 전용 `optimizeDeps`는 이 패키지 소비 경계를 검증하기 위한 것이다. 제품 앱의 mock 서버나 대체 학습 기능은 만들지 않았다. 대상은 자동화된 데스크톱 Chromium이며 실제 휴대폰·오프라인·다른 브라우저 검증을 대신하지 않는다.

## OpenAPI 비교 범위

`check:contracts`는 구현한 학습 schema를 [Zod JSON Schema 변환](https://zod.dev/json-schema)으로 얻어 OpenAPI의 필드·필수값·타입·허용값·범위를 비교한다. 단순 nullable·단일 enum·빈 required 배열의 같은 표현과 문서 주석 차이는 정리한다. Zod의 UUID·날짜 format 정규식과 JavaScript 안전 정수 상한은 런타임 보강으로 취급한다. OpenAPI가 별도로 명시한 정규식·범위는 비교에 남긴다.

예문의 `{answer}` 정확히 한 개, 주제 ID 중복 금지, 정규화 후 답 중복 등 의미 검증은 런타임 테스트로 확인한다. 이 비교는 전체 LearningEvent·전체 API 계약·DB 관계·권한·서버 동작의 검증이 아니다.
