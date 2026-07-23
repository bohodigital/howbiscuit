#!/usr/bin/env python3
"""Resolve one fixed broker record and run bounded How Biscuit provider operations."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


REFERENCE = "local1.public-data-provider-credentials.primary"
REPO_PATH = Path(__file__).resolve().parents[2]
ALLOWED_REPO_ROOTS = (
    Path("/srv/local1/repos/sites/howbiscuit-site"),
    Path("/srv/local1/worktrees"),
)
VAULT_PATH = Path("/srv/local1/secrets/broker/local1-agent-secrets.kdbx")
KEY_FILE_PATH = Path("/srv/local1/secrets/broker/local1-agent-secrets.keyfile")
KEEPASSXC_CLI = "/usr/bin/keepassxc-cli"
FIELD_BINDINGS = {
    "eia_api_key": ("eia", "HOWBISCUIT_EIA_API_KEY"),
    "hud_api_key": ("hud-usps", "HOWBISCUIT_HUD_USPS_ACCESS_TOKEN"),
    "bestbuy_api_key": ("best-buy", "HOWBISCUIT_BESTBUY_API_KEY"),
    "kroger_oauth_client_id": ("kroger", "HOWBISCUIT_KROGER_CLIENT_ID"),
    "kroger_oauth_client_secret": ("kroger", "HOWBISCUIT_KROGER_CLIENT_SECRET"),
}
INVALID_SENTINELS = {"null", "none", "undefined", "placeholder", "changeme"}
SCAN_ROOTS = (
    REPO_PATH,
    Path("/srv/local1/runtime/howbiscuit"),
    Path("/etc/systemd/system"),
)
SCAN_SUFFIXES = {
    ".js", ".mjs", ".cjs", ".json", ".yaml", ".yml", ".toml", ".md",
    ".html", ".css", ".map", ".service", ".timer", ".log",
}
MAX_SCAN_FILE_BYTES = 8 * 1024 * 1024


class BrokerConsumerError(RuntimeError):
    """A credential-free error safe for ordinary output."""


def read_record() -> dict[str, Any]:
    if not any(REPO_PATH == root or REPO_PATH.is_relative_to(root) for root in ALLOWED_REPO_ROOTS):
        raise BrokerConsumerError("provider wrapper is outside an approved Pi checkout")
    if not (REPO_PATH / ".git").exists():
        raise BrokerConsumerError("provider wrapper is not inside a Git checkout")
    result = subprocess.run(
        [
            KEEPASSXC_CLI,
            "show",
            "--quiet",
            "--no-password",
            "--key-file",
            str(KEY_FILE_PATH),
            "--show-protected",
            "--attributes",
            "Password",
            str(VAULT_PATH),
            REFERENCE,
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
        check=False,
    )
    if result.returncode != 0:
        raise BrokerConsumerError("provider credential record is missing or unreadable")
    try:
        record: Any = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise BrokerConsumerError("provider credential record has an invalid format") from exc
    result.stdout = ""
    fields = record.get("fields") if isinstance(record, dict) else None
    if record.get("reference") != REFERENCE or not isinstance(fields, dict):
        raise BrokerConsumerError("provider credential record does not match the fixed reference")
    for field_id in FIELD_BINDINGS:
        value = fields.get(field_id)
        if not isinstance(value, str) or not value or any(ord(character) < 32 for character in value):
            raise BrokerConsumerError(f"provider credential field is missing: {field_id}")
    return record


def clean_environment(record: dict[str, Any]) -> tuple[dict[str, str], list[str]]:
    fields = record["fields"]
    environment = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("HOWBISCUIT_", "BEST_BUY_", "KROGER_"))
    }
    secrets: list[str] = []
    for field_id, (_provider, binding) in FIELD_BINDINGS.items():
        value = fields[field_id]
        environment[binding] = value
        secrets.append(value)
    environment["HOWBISCUIT_SECRET_BROKER_INJECTED"] = "1"
    environment["HOWBISCUIT_LIVE_PROVIDER_TESTS"] = "1"
    return environment, secrets


def sanitize(text: str, secret_values: list[str]) -> str:
    sanitized = text
    for value in secret_values:
        sanitized = sanitized.replace(value, "[REDACTED]")
    return sanitized


def doctor(record: dict[str, Any]) -> int:
    fields = record["fields"]
    providers = {}
    for field_id, (provider, _binding) in FIELD_BINDINGS.items():
        providers.setdefault(provider, True)
        value = fields.get(field_id)
        providers[provider] = providers[provider] and bool(value) and value.strip().lower() not in INVALID_SENTINELS
    print(json.dumps({
        "ok": all(providers.values()),
        "reference": REFERENCE,
        "providers": {
            provider: {"credentialPresent": present}
            for provider, present in sorted(providers.items())
        },
    }, separators=(",", ":")))
    return 0 if all(providers.values()) else 1


def smoke(record: dict[str, Any], provider: str) -> int:
    selected = set(FIELD_BINDINGS[field_id][0] for field_id in FIELD_BINDINGS) if provider == "all" else {provider}
    for field_id, (field_provider, _binding) in FIELD_BINDINGS.items():
        value = record["fields"][field_id]
        if field_provider in selected and value.strip().lower() in INVALID_SENTINELS:
            print(json.dumps({
                "ok": False,
                "provider": field_provider,
                "errorCategory": "credential-invalid",
            }, separators=(",", ":")))
            return 1
    environment, secrets = clean_environment(record)
    args = ["node", "scripts/providers/smoke.mjs"]
    args.extend(["--all"] if provider == "all" else ["--provider", provider])
    result = subprocess.run(
        args,
        cwd=REPO_PATH,
        env=environment,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=180,
        check=False,
    )
    output = sanitize(result.stdout, secrets).strip()
    error = sanitize(result.stderr, secrets).strip()
    if output:
        print(output)
    elif error:
        print(json.dumps({"ok": False, "errorCategory": "provider-runner-failed"}, separators=(",", ":")))
    record.clear()
    fields = {}
    secrets.clear()
    return result.returncode


def refresh(record: dict[str, Any], provider: str) -> int:
    if provider not in {"eia", "hud-usps"}:
        raise BrokerConsumerError("only passing data-source refreshes are enabled")
    environment, secrets = clean_environment(record)
    switch = "EIA_CONTEXT_ENABLED" if provider == "eia" else "HUD_USPS_ENABLED"
    environment[switch] = "true"
    result = subprocess.run(
        ["node", "scripts/providers/refresh.mjs", "--provider", provider],
        cwd=REPO_PATH,
        env=environment,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=180,
        check=False,
    )
    output = sanitize(result.stdout, secrets).strip()
    print(output or json.dumps({"ok": False, "errorCategory": "refresh-runner-failed"}, separators=(",", ":")))
    record.clear()
    secrets.clear()
    return result.returncode


def scan(record: dict[str, Any]) -> int:
    secrets_by_provider: dict[str, list[bytes]] = {}
    for field_id, (provider, _binding) in FIELD_BINDINGS.items():
        secrets_by_provider.setdefault(provider, []).append(record["fields"][field_id].encode())
    counts = {provider: {"repository": 0, "runtime": 0, "systemd": 0} for provider in secrets_by_provider}
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        file_class = "repository" if root == REPO_PATH else "systemd" if root == SCAN_ROOTS[-1] else "runtime"
        for path in root.rglob("*"):
            try:
                if not path.is_file() or path.suffix.lower() not in SCAN_SUFFIXES:
                    continue
                if path.stat().st_size > MAX_SCAN_FILE_BYTES:
                    continue
                data = path.read_bytes()
            except OSError:
                continue
            for provider, values in secrets_by_provider.items():
                counts[provider][file_class] += sum(data.count(value) for value in values)
    passed = all(count == 0 for provider in counts.values() for count in provider.values())
    print(json.dumps({
        "ok": passed,
        "reference": REFERENCE,
        "providers": {
            provider: {"fileClasses": file_counts, "pass": not any(file_counts.values())}
            for provider, file_counts in sorted(counts.items())
        },
    }, separators=(",", ":")))
    return 0 if passed else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="mode", required=True)
    subparsers.add_parser("doctor")
    smoke_parser = subparsers.add_parser("smoke")
    smoke_parser.add_argument("--provider", choices=("eia", "hud-usps", "best-buy", "kroger", "all"), required=True)
    refresh_parser = subparsers.add_parser("refresh")
    refresh_parser.add_argument("--provider", choices=("eia", "hud-usps"), required=True)
    subparsers.add_parser("scan")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        record = read_record()
        if args.mode == "doctor":
            return doctor(record)
        if args.mode == "scan":
            return scan(record)
        if args.mode == "refresh":
            return refresh(record, args.provider)
        return smoke(record, args.provider)
    except (BrokerConsumerError, OSError, subprocess.TimeoutExpired):
        print(json.dumps({"ok": False, "errorCategory": "broker-unavailable"}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
