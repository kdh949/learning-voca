# learning-voca

학습용 React + Vite 앱, 관리자 앱, NestJS API와 공통 패키지의 개발 기반이다. 제품 기능과 DB 연결은 아직 구현하지 않았다.

## 실행

Node.js 24.21.0과 pnpm 10.34.6, Docker Compose v2를 사용한다.

```sh
pnpm install --frozen-lockfile
cp infra/.env.example infra/.env
cp apps/api/.env.example apps/api/.env
pnpm db:up
pnpm dev
```

환경 파일이 이미 있으면 덮어쓰지 않는다. 학습 앱은 `http://127.0.0.1:5173/app/`, 관리자 앱은 `http://127.0.0.1:5174/admin/`, API는 `http://127.0.0.1:3000/health`에서 실행한다. `/health`는 프로세스 응답만 검사한다.

```sh
pnpm typecheck
pnpm build
pnpm db:down
```

`db:down`은 PostgreSQL 볼륨을 보존한다. 기본 접속 값은 `infra/.env.example`을 따른다. CI는 고정 lockfile 설치, 타입 검사와 전체 빌드를 수행한다. 빌드 결과와 환경 파일은 커밋하지 않는다.
