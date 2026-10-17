"""구현한 학습 계약의 필드·필수값·타입·허용값을 OpenAPI와 비교한다."""
import json
from pathlib import Path
import subprocess

import yaml

ROOT = Path(__file__).resolve().parents[2]
spec = yaml.safe_load((ROOT / "docs/api/openapi.yaml").read_text(encoding="utf-8"))
generated = json.loads(subprocess.check_output(
    ["node", "scripts/export-grading-schemas.mjs"], cwd=ROOT, text=True,
))


def canonical(schema, generated=False):
    """참조·순서·문서 주석 차이를 제거하되 검증 구조는 유지한다."""
    if isinstance(schema, list):
        return [canonical(value, generated) for value in schema]
    if not isinstance(schema, dict):
        return schema
    if "$ref" in schema:
        name = schema["$ref"].removeprefix("#/components/schemas/")
        return canonical(spec["components"]["schemas"][name])
    result = {}
    for key, value in schema.items():
        if key in {"$schema", "description", "example", "examples", "title"}:
            continue
        # Zod의 표준 format 정규식·JS 안전 정수 상한은 런타임 방어를 보강한다.
        # OpenAPI의 format 자체·별도 명시된 범위와 일반 pattern은 비교에서 유지한다.
        if generated and key == "pattern" and schema.get("format") in {"uuid", "date-time", "date"}:
            continue
        if generated and key == "maximum" and value == 9007199254740991:
            continue
        result[key] = canonical(value, generated)
    if "enum" in result and len(result["enum"]) == 1:
        result["const"] = result.pop("enum")[0]
    # type 배열과 anyOf의 단순 타입 나열은 같은 nullable 계약을 표현한다.
    if isinstance(result.get("type"), list):
        result["anyOf"] = [{"type": item} for item in result.pop("type")]
    if isinstance(result.get("const"), int) and not isinstance(result["const"], bool):
        result["type"] = "integer"
    for key in ("required", "enum"):
        if key in result:
            result[key] = sorted(result[key])
    if result.get("required") == []:
        del result["required"]
    return result


failures = []
for name, schema in generated.items():
    expected = canonical(spec["components"]["schemas"][name])
    actual = canonical(schema, generated=True)
    if actual != expected:
        failures.append(name)
        print(f"계약 불일치: {name}")
        print("OpenAPI:", json.dumps(expected, ensure_ascii=False, sort_keys=True))
        print("구현:", json.dumps(actual, ensure_ascii=False, sort_keys=True))
if failures:
    raise SystemExit(1)
print(f"구현한 학습 계약 {len(generated)}종과 OpenAPI 구조 일치")
