# learning-voca

영단어 학습 앱, 관리자·운영팀 앱, NestJS API의 개발 기반과 공통 채점·세션·출제·복습 규칙을 구현했다. 학습·인증·콘텐츠·동기화의 화면·제품 API와 DB 테이블은 아직 구현 전이다.

## 준비와 실행

Node.js **24.21.0**(`.nvmrc`), pnpm **10.34.6**(`packageManager`), Docker Compose v2를 사용한다. 직접 의존성은 정확한 버전, 전이 의존성은 `pnpm-lock.yaml`로 고정한다. Node 24 LTS는 [Vite 실행 조건](https://vite.dev/guide/)과 [NestJS 실행 조건](https://docs.nestjs.com/first-steps)을 충족한다.

```sh
# nvm을 사용하는 경우
nvm install
nvm use

# Corepack을 사용하는 경우 packageManager의 pnpm 버전이 선택된다.
corepack pnpm install --frozen-lockfile
```

아래 `pnpm` 명령은 pnpm 10.34.6을 사용한다. pnpm 실행 파일을 설치하지 않았다면 `corepack pnpm`으로 대신 실행한다.

```sh
cp infra/.env.example infra/.env
cp apps/api/.env.example apps/api/.env
pnpm db:up
pnpm dev
```

환경 파일이 이미 있으면 복사로 덮어쓰지 않는다. API는 환경 파일 없이도 기본 host·port로 실행된다. DB가 아직 API와 연결되지 않았으므로 앱 실행 자체에는 DB가 필요하지 않다.

| 대상 | 개별 실행 | 주소 |
| --- | --- | --- |
| 학습 앱 | `pnpm dev:web` | `http://127.0.0.1:5173/app/` |
| 관리자 앱 | `pnpm dev:admin` | `http://127.0.0.1:5174/admin/` |
| API | `pnpm dev:api` | `http://127.0.0.1:3000/health` |

`GET /health`는 공개된 프로세스 응답 확인용으로 `{"status":"ok"}`를 반환한다. DB 연결·인증·학습 준비 상태를 검증하지 않는다. [OpenAPI](docs/api/openapi.yaml)의 `/api/v1` 제품 API는 아직 구현하지 않았다. CORS·프록시·인증은 실제 API 연결 작업에서 추가한다.

프론트의 기본 경로는 `/app/`, `/admin/`이다. Service Worker는 아직 없으며 도입 시 학습용 범위는 `/app/`로 제한한다. 최소 실행 화면은 Figma의 기본 색상·간격·표면·글꼴만 반영했다. 로그인 화면이나 전체 화면 구현은 아니다. 글꼴은 설치한 Fontsource 패키지에서 번들에 포함해 원격 폰트 요청 없이 사용한다.

## 검사와 빌드

```sh
pnpm typecheck
pnpm build
python3 -m venv .venv
.venv/bin/python -m pip install -r docs/tools/requirements.txt
.venv/bin/python docs/tools/validate_openapi.py
```

`pnpm check:openapi`는 해당 패키지가 설치된 `python3`를 사용한다. 가상환경을 활성화한 뒤 실행할 수 있다. Python은 기존 문서 검증 도구에만 사용한다.

빌드 결과는 각 패키지의 `dist/`에 생성된다. `pnpm --filter @learning-voca/api start`로 빌드된 API를 실행하고, `pnpm --filter @learning-voca/web preview`와 `pnpm --filter @learning-voca/admin preview`로 프론트 빌드를 확인한다. preview 주소는 개발 주소와 같다.

```sh
pnpm exec playwright install chromium
pnpm test
pnpm check:contracts
```

`pnpm test`는 공통 패키지 빌드·Node 단위 테스트·실제 Chromium과 Node의 결과 비교를 수행한다. `check:contracts`는 빌드한 Zod schema와 OpenAPI의 학습 계약을 비교하며 위 Python 검증 환경을 사용한다. 세부 규칙·검증 범위는 [채점 개발 안내](docs/development/grading.md)와 [세션·복습 개발 안내](docs/development/session-and-review.md)를 따른다. CI는 frozen 설치·typecheck·build·단위·브라우저 비교·OpenAPI 구조 및 학습 계약 검사를 수행한다.

## 로컬 DB

PostgreSQL **17.11-bookworm**을 `127.0.0.1:5432`에 제공하고 이름 있는 볼륨에 데이터를 보관한다. 기본 접속 값은 `infra/.env.example`을 따른다. 포트가 사용 중이면 `infra/.env`의 `POSTGRES_PORT`를 변경한다.

```sh
# 실제 DB에 연결해 조회한다. 테이블·migration은 아직 없다.
docker compose --env-file infra/.env -f infra/compose.yaml exec postgres \
  psql -U learning_voca -d learning_voca -c 'SELECT current_database(), version();'
pnpm db:down
```

`db:down`은 볼륨을 보존한다. 볼륨 생성 후 사용자·비밀번호·DB 환경변수를 변경해도 기존 DB가 재초기화되지 않는다. 새 값이 필요하면 기존 DB에서 변경하며 데이터를 지우기 위해 `down -v`를 관성적으로 실행하지 않는다.

## 구조와 다음 범위

`apps/web`과 `apps/admin`은 각각 React + Vite, `apps/api`는 NestJS다. `packages/contracts`는 Zod 4.6.5의 학습 schema와 타입, `packages/learning-core`는 정규화·채점·힌트·재연습·세션 상태·선택·통계와 ts-fsrs 5.4.2의 복습 계산을 제공한다. 브라우저 비교에만 Playwright 1.64.0을 사용한다. 앱에 사용처 없는 의존 연결은 추가하지 않았다.

공유 개발 안내와 CI는 로컬 전용 디자인·로드맵·다이어그램에 의존하지 않는다. 기존 `.git/info/exclude`는 보존한다. 다음 작업은 실제 PostgreSQL의 최소 migration·서버 이벤트 수신·재채점·중복 방지·진도 transaction이다.
