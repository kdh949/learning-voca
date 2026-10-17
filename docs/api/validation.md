# OpenAPI 검증 안내

[OpenAPI YAML](./openapi.yaml)의 문법과 문서 구조를 확인하는 최소 검증이다. 실행 결과의 과거 이력은 이 문서에 보관하지 않는다.

## 실행 방법

저장소 루트에서 실행한다. 필요한 Python 패키지는 [requirements.txt](../tools/requirements.txt)에 고정한 PyYAML 6.0.3과 openapi-spec-validator 0.9.0이다. 문서 검증용이며 서비스 백엔드는 NestJS를 사용한다.

~~~sh
python3 docs/tools/validate_openapi.py
~~~

패키지가 없으면 임시 가상환경에 설치해 실행한다.

~~~sh
python3 -m venv /tmp/learning-voca-openapi-validation
/tmp/learning-voca-openapi-validation/bin/python -m pip install -r docs/tools/requirements.txt
/tmp/learning-voca-openapi-validation/bin/python docs/tools/validate_openapi.py
~~~

성공하면 `OpenAPI 검증 통과`를 출력한다. 실패하면 오류를 확인하고 YAML 원본을 수정한 뒤 다시 실행한다.

## 검증 한계

YAML 로딩과 OpenAPI 문서 구조를 검사한다. API 개수, 다른 문서와의 경로 일치, 예시 데이터의 채점·통계·금지 입력, 도메인 규칙은 별도로 검사하지 않는다.

이 검사는 서버·브라우저·DB의 실제 동작을 확인하지 않는다. 인증·소유권·CSRF, 동기화 중복 처리, 콘텐츠 관계, 백업 보관 상한·파일 무결성, 오프라인 저장·복원은 해당 기능 구현 후 테스트해야 한다.

공유 명세의 원본은 YAML이다. 읽기용 Markdown 생성과 Mermaid 문법 검사는 공유 작업 흐름에 포함하지 않는다. 구현 단계에서는 공통 계약 schema에서 OpenAPI를 생성하도록 전환한다.
