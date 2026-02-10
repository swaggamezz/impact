#!/usr/bin/env python3
"""
Small API health test for Impact Energy extraction setup.

What it can test:
1) Direct Groq Cloud API key + JSON response parsing (via OpenAI SDK)
2) Optional local extraction endpoint (default: http://localhost:5173/api/extract)

Usage examples:
  python scripts/test_api_health.py
  python scripts/test_api_health.py --test-local
  python scripts/test_api_health.py --api-key gsk_... --model openai/gpt-oss-20b
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

try:
    from openai import OpenAI as OpenAIClient
except Exception:
    OpenAIClient = None

# Intentionally empty to avoid committing secrets.
DEFAULT_GROQ_API_KEY = ""


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key and key not in os.environ:
            os.environ[key] = value


def mask_secret(value: str) -> str:
    if len(value) <= 10:
        return "*" * len(value)
    return f"{value[:6]}...{value[-4:]}"


def http_post_json(
    url: str,
    payload: dict[str, Any],
    headers: Optional[dict[str, str]] = None,
    timeout: float = 30.0,
) -> tuple[int, dict[str, Any] | str]:
    request_headers = {"Content-Type": "application/json"}
    if headers:
        request_headers.update(headers)

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url=url, data=data, headers=request_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            status = response.getcode()
            try:
                return status, json.loads(body)
            except json.JSONDecodeError:
                return status, body
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = body
        return err.code, parsed


def parse_json_from_text(text: str) -> Optional[dict[str, Any]]:
    if not text.strip():
        return None

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fenced:
        try:
            parsed = json.loads(fenced.group(1))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    first = text.find("{")
    last = text.rfind("}")
    if first >= 0 and last > first:
        try:
            parsed = json.loads(text[first : last + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return None
    return None


def extract_responses_text(body: dict[str, Any]) -> str:
    output_text = body.get("output_text")
    if isinstance(output_text, str):
        return output_text.strip()

    output = body.get("output")
    if not isinstance(output, list):
        return ""

    collected: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str):
                collected.append(text)
                continue
            if isinstance(text, dict):
                value = text.get("value")
                if isinstance(value, str):
                    collected.append(value)
    return "\n".join(collected).strip()


@dataclass
class CheckResult:
    ok: bool
    name: str
    details: str


def check_groq(api_key: str, model: str, timeout: float) -> CheckResult:
    prompt = 'Return exactly JSON: {"ok": true, "source": "groq"}'

    if OpenAIClient is not None:
        try:
            client = OpenAIClient(
                api_key=api_key,
                base_url="https://api.groq.com/openai/v1",
                timeout=timeout,
            )

            response = client.responses.create(
                model=model,
                input=prompt,
                temperature=0,
            )

            output_text = getattr(response, "output_text", "") or ""
            parsed = parse_json_from_text(output_text)
            if not parsed or parsed.get("ok") is not True:
                return CheckResult(
                    ok=False,
                    name="Groq key test",
                    details=f"Model response not parseable as expected JSON. output_text={output_text!r}",
                )

            return CheckResult(
                ok=True,
                name="Groq key test",
                details=f"SDK call ok, model={model}, parsed JSON ok=true",
            )
        except Exception as err:
            return CheckResult(
                ok=False,
                name="Groq key test",
                details=f"SDK call failed: {err}",
            )

    # Fallback for old openai package versions without OpenAI client.
    status, body = http_post_json(
        url="https://api.groq.com/openai/v1/responses",
        payload={
            "model": model,
            "input": prompt,
            "temperature": 0,
        },
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=timeout,
    )
    if status != 200:
        return CheckResult(
            ok=False,
            name="Groq key test",
            details=f"REST fallback failed (HTTP {status}): {body}",
        )
    if not isinstance(body, dict):
        return CheckResult(
            ok=False,
            name="Groq key test",
            details=f"REST fallback response type invalid: {type(body).__name__}",
        )

    output_text = extract_responses_text(body)
    parsed = parse_json_from_text(output_text)
    if not parsed or parsed.get("ok") is not True:
        return CheckResult(
            ok=False,
            name="Groq key test",
            details=f"REST fallback JSON parse failed. output_text={output_text!r}",
        )

    return CheckResult(
        ok=True,
        name="Groq key test",
        details=f"REST fallback ok (old openai package), model={model}, parsed JSON ok=true",
    )


def check_local_extract(local_url: str, timeout: float) -> CheckResult:
    payload = {
        "inputType": "text",
        "text": (
            "EAN: 123456789012345678\n"
            "Product: Elektra\n"
            "Tenaamstelling: Test BV\n"
            "KvK: 12345678\n"
            "IBAN: NL91ABNA0417164300\n"
            "Telemetriecode: ONBEKEND\n"
            "Leveringsadres: Stationsstraat 12 A\n"
            "Postcode: 1234 AB\n"
            "Plaats: Utrecht\n"
            "Marktsegment: KV\n"
        ),
        "options": {
            "source": "OCR_PHOTO",
            "allowMultiple": False,
            "splitMode": "none",
        },
    }

    status, body = http_post_json(local_url, payload, timeout=timeout)
    if status != 200:
        return CheckResult(
            ok=False,
            name="Local /api/extract test",
            details=f"HTTP {status} response: {body}",
        )

    if not isinstance(body, dict):
        return CheckResult(
            ok=False,
            name="Local /api/extract test",
            details=f"Unexpected response body type: {type(body).__name__}",
        )

    connections = body.get("connections")
    if not isinstance(connections, list) or not connections:
        return CheckResult(
            ok=False,
            name="Local /api/extract test",
            details=f"No connections in response: {body}",
        )

    first = connections[0] if isinstance(connections[0], dict) else {}
    ean = str(first.get("eanCode", "")).replace(" ", "")
    if not re.fullmatch(r"\d{18}", ean):
        return CheckResult(
            ok=False,
            name="Local /api/extract test",
            details=f"Connection returned but EAN invalid: {first}",
        )

    return CheckResult(
        ok=True,
        name="Local /api/extract test",
        details=f"HTTP 200, connections={len(connections)}, first EAN valid",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Test Groq key (+ optional local extract endpoint)")
    parser.add_argument(
        "--api-key",
        default=None,
        help="Groq API key (fallback: GROQ_API_KEY or in-file default)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Groq model (fallback: GROQ_MODEL or openai/gpt-oss-20b)",
    )
    parser.add_argument(
        "--local-url",
        default="http://localhost:5173/api/extract",
        help="Local extraction endpoint URL",
    )
    parser.add_argument("--test-local", action="store_true", help="Also run local /api/extract test")
    parser.add_argument("--timeout", type=float, default=45.0, help="HTTP timeout in seconds")
    args = parser.parse_args()

    load_env_file(Path(".env"))

    api_key = args.api_key or os.getenv("GROQ_API_KEY") or DEFAULT_GROQ_API_KEY
    model = args.model or os.getenv("GROQ_MODEL") or "openai/gpt-oss-20b"

    if not api_key:
        print("ERROR: No API key found. Set GROQ_API_KEY or pass --api-key.", file=sys.stderr)
        return 2

    print(f"Using key: {mask_secret(api_key)}")
    print(f"Using model: {model}")

    results: list[CheckResult] = []
    results.append(check_groq(api_key=api_key, model=model, timeout=args.timeout))

    if args.test_local:
        results.append(check_local_extract(local_url=args.local_url, timeout=args.timeout))

    failed = False
    print("\nResults:")
    for result in results:
        prefix = "PASS" if result.ok else "FAIL"
        print(f"- {prefix} | {result.name}: {result.details}")
        if not result.ok:
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
