# 세션·출제·복습 개발 안내

첫 착수 작업 3의 순수 규칙이다. 실제 제품 API·DB 저장·IndexedDB·학습 화면은 아직 연결하지 않았다. 모든 ID·시각·설정·seed는 호출자가 제공하며 시스템 현재 시각을 읽지 않는다.

## 고정 버전과 설정

- 콘텐츠 후보: `topic-selection-v1`. 같은 배열 조건은 OR, 조건 사이는 AND다. catalog는 단어장·예문·선택 주제의 교집합, saved는 고정 저장 목록과 예문 주제를 사용한다. 난이도는 예문 값으로 검사한다.
- 세션 출제: `review-target-new-v1`. 2026-10-09에 확정한 **예정된 복습 → 목표 확인 대기 → 신규** 순서다. 같은 의미·목표를 한 번만 고르며 예문·출처 선택은 정렬한 후보와 고정 seed로 결정한다.
- 복습: `ts-fsrs 5.4.2`, `fsrs-review-v1`, FSRS-6. [공식 배포](https://github.com/open-spaced-repetition/ts-fsrs/releases/tag/v5.4.2)와 설치 패키지의 타입·코드를 확인했다. Node 24와 실제 Chromium에서 같은 카드 결과를 검증했다.

FSRS의 전체 가중치·유지율·최대 간격·단기 단계 설정을 명시한다. 누락·fuzz·지원하지 않는 버전·라이브러리의 자동 가중치 보정·과거로 역행하는 복습 시각을 거절한다. 이 버전의 단기 단계는 증가하는 양의 정수 분 단위이며 하루 미만이다. 설정의 내용 hash·ID별 불변성·접근 권한은 실제 저장 경계에서 검증해야 한다.

[review.json](../../content/fixtures/review.json)의 유지율 0.9, 학습 `1m, 10m`, 재학습 `10m`과 세션 검사에서 사용한 20문항·신규 5개는 명시적 검증 설정이다. 제품 기본값·최대 허용 범위는 확정하지 않았다. fixture의 configHash는 libraryVersion·policyVersion·parameters 객체를 키 정렬한 공백 없는 JSON의 SHA-256이며 실제 설정 저장 기능을 대신하지 않는다.

## 호출 순서

1. `selectContentCandidates`에 하나의 카탈로그 스냅샷·선택 조건·등록 난이도·고정 저장 목록을 제공한다. 서버는 활성 사전·saved 소유권·게시 상태를 확인해야 한다. 빈 콘텐츠 후보는 패키지 생성 단계에서 `CONTENT_SELECTION_EMPTY`로 매핑한다.
2. `selectQuestions`에 검증된 패키지 후보·진도 checkpoint·제외/충돌/인지한 중단 목록·제한·시각·seed를 제공한다. 패키지 범위 밖으로 확장하지 않으며 선택할 문항이 없으면 `SelectionError.code=NO_ELIGIBLE_ITEMS`다. 신규 카드의 baseline checkpoint와 ID는 저장 계층에서 발급한다.
3. 선택 결과로 `SessionItemSeed`를 만들고 예문·checkpoint·세션 설정·schedulerConfig를 `createSession`에 제공한다. 문항 순서·의미 중복·신규 제한·복습 예정 시각·채점/콘텐츠/진도/설정 참조를 검사하고 입력을 복사해서 버전을 고정한다.
4. `applySessionEvent`에 이벤트를 순서대로 적용한다. 새 상태·이벤트·outbox·진도는 이후 저장 계층에서 같은 transaction에 저장해야 한다. 저장 성공 전에 화면에서 저장 완료·다음 문항을 표시하지 않는다.

`LearningSessionState`는 공통 규칙을 위한 내부 상태이며 OpenAPI의 `LearningSession` 응답을 대체하지 않는다. 내부 `questionPolicyVersion`은 출제 순서 버전이며 API·패키지의 콘텐츠 후보 `selectionPolicyVersion`과 구분한다. 로드한 상태는 이 함수로 생성한 상태와 동등하게 검증해야 한다. API의 사용자/기기/패키지 소유권·진도 분기·이전 진도 이벤트 연결은 이후 서버 수신 작업의 책임이다.

## 최초 답안과 재연습

```text
answering → feedback → practicing → done
                 └───────────────→ done
미답안은 제외·게시 중단을 인지하면 skipped
모든 문항이 done/skipped가 된 뒤 명시적으로 session.completed
```

최초 제출 또는 모르겠어요가 최초 답안과 복습 카드를 한 번만 만든다. 피드백에서 정답을 공개하므로 최초 기록의 `answerRevealed=true`다. 힌트는 answering에서만 적용한다. 목표 답 무힌트 정답은 Good, 힌트 목표 정답·형태 오류·오답·모르겠어요는 Again이다. 모르겠어요는 원문·정규화 답의 null을 보존한다.

대체 표현은 기존 카드 전체를 보존하고 `pendingTargetCheck=true`로 표시한다. 다음 새 세션에서 별도 목표 확인 후보가 된다. 재연습은 practiceAttempts에만 추가하며 최초 답안·카드·대기 표시를 바꾸지 않는다. 재연습 완료 여부는 기존 `getPracticeFeedback`으로 확인한다. 성공해도 자동 이동하지 않으며 사용자의 다음 이동은 `item.advanced`다. 2026-10-09에 재연습을 선택으로 확정했으며 피드백에서도 다음 버튼으로 이동할 수 있다.

같은 이벤트의 동일 내용 재전송은 같은 상태를 반환한다. 같은 ID의 다른 내용, 순서·시각 역행, 다른 세션·문항·규칙·checkpoint 참조와 최초 재답변은 거절한다. 순번은 기기 스트림 전체의 값이므로 세션 내 연속 번호를 강제하지 않는다. 이미 제출한 문항에 중단을 적용해도 최초 답안·일정을 되돌리지 않는다.

이 검증은 DB의 unique 제약·동시성·rollback·응답 유실을 증명하지 않는다. 해당 보호는 첫 착수 작업 4에서 실제 PostgreSQL로 구현·검증한다.

## 통계와 검사

`getStudyDate`는 세션에 고정한 시간대로 답한 날짜를 만든다. `calculateStatistics`는 저장된 최초 시도만 집계한다. 자정을 넘긴 세션의 하루 통계는 studyDate로 나누고, 세션 결과는 전체 기록을 집계한다. 완료하지 않은 세션의 저장된 답안도 하루 통계에 포함한다.

정답률은 무힌트 목표 정답 / (최초 시도 - 대체 표현)이다. 17문항에서 무힌트 12·힌트 정답 2·오답 2·대체 표현 1이면 12/16=75%다. 분모 0은 null이다. 같은 이벤트 재전송은 한 번만 집계하고 동일 문항의 다른 답안·변조된 재전송은 거절한다.

```sh
pnpm typecheck
pnpm build
pnpm test
pnpm check:openapi
pnpm check:contracts
```

준비는 루트 README를 따른다. 기존 자동 브라우저 비교에 세션 전이·FSRS·출제·시간대·통계를 추가했으며 별도 E2E 도구를 도입하지 않았다. 실제 휴대폰·오프라인·DB·원격 CI 검증은 별개다.

learning-core는 FSRS 타입 정의의 ESM과 호환되도록 ES modules로 빌드한다. 공개 패키지는 `import * as core from '@learning-voca/learning-core'` 또는 named import로 소비한다. contracts는 기존 CommonJS 빌드를 유지한다. 실제 Chromium/Node 공개 패키지 비교와 깨끗한 설치 후 typecheck로 이 연결 경계를 검사한다. 검증 전용 Vite는 시작할 때 패키지를 다시 변환한다. lockfile이 같으면 이전 dist의 변환 캐시를 재사용하는 실패를 재현했으며 최신 빌드를 읽도록 수정했다.
