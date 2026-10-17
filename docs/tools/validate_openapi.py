"""OpenAPI 원본의 문법과 문서 구조만 검사한다."""
from pathlib import Path

import yaml
from openapi_spec_validator import validate_spec

ROOT = Path(__file__).resolve().parents[2]
spec = yaml.safe_load((ROOT / "docs/api/openapi.yaml").read_text(encoding="utf-8"))
validate_spec(spec)
print("OpenAPI 검증 통과")
