#!/usr/bin/env python3
"""Behavioral evaluation harness for Codex skills.

The runner uses only the Python standard library. Real Codex runs are isolated in
temporary workspaces and temporary CODEX_HOME directories. It never reads or
prints authentication contents.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Iterable


HARNESS_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = HARNESS_ROOT.parent
TARGET_SKILL_NAME = "reliable-task-execution"
EVAL_ROOT = HARNESS_ROOT / "suites" / TARGET_SKILL_NAME
SKILL_ROOT = SKILLS_ROOT / TARGET_SKILL_NAME
MANIFEST_PATH = EVAL_ROOT / "manifest.json"
CASES_DIR = EVAL_ROOT / "cases"
FIXTURES_DIR = EVAL_ROOT / "fixtures"
ASSERTION_KINDS = {
    "file_exists",
    "file_contains",
    "final_matches",
    "event_matches",
    "event_not_matches",
}
MODULES = {
    "verification",
    "safe-operations",
    "diagnosis-and-recovery",
    "task-continuity",
    "delegation",
    "independent-review",
    "composite",
}


class EvalError(RuntimeError):
    """Raised for evaluation infrastructure failures."""


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EvalError(f"Cannot read JSON {path}: {exc}") from exc


def configure_suite(suite_root: Path) -> None:
    """Point the shared harness at one skill's eval directory."""
    global EVAL_ROOT, SKILL_ROOT, MANIFEST_PATH, CASES_DIR, FIXTURES_DIR
    global TARGET_SKILL_NAME, MODULES

    resolved = suite_root.resolve()
    manifest_path = resolved / "manifest.json"
    manifest = read_json(manifest_path)
    skill_name = manifest.get("skill_name")
    modules = manifest.get("modules")
    if not isinstance(skill_name, str) or not skill_name:
        raise EvalError(f"{manifest_path}: skill_name must be non-empty")
    if not isinstance(modules, list) or not modules or not all(
        isinstance(item, str) and item for item in modules
    ):
        raise EvalError(f"{manifest_path}: modules must be a non-empty string list")

    EVAL_ROOT = resolved
    SKILL_ROOT = SKILLS_ROOT / skill_name
    MANIFEST_PATH = manifest_path
    CASES_DIR = EVAL_ROOT / "cases"
    FIXTURES_DIR = EVAL_ROOT / "fixtures"
    TARGET_SKILL_NAME = skill_name
    MODULES = set(modules)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def stable_hash(value: Any) -> str:
    encoded = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def skill_hash() -> str:
    digest = hashlib.sha256()
    paths = [
        path
        for path in sorted(SKILL_ROOT.rglob("*"))
        if path.is_file() and "evals" not in path.relative_to(SKILL_ROOT).parts
    ]
    for path in paths:
        digest.update(path.relative_to(SKILL_ROOT).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def load_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for path in sorted(CASES_DIR.glob("*.json")):
        loaded = read_json(path)
        items = loaded if isinstance(loaded, list) else [loaded]
        for item in items:
            if not isinstance(item, dict):
                raise EvalError(f"Case entries in {path} must be objects")
            item = dict(item)
            item["_source"] = path.name
            cases.append(item)
    return cases


def validate_case(case: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required = {
        "id",
        "title",
        "module",
        "tags",
        "prompt",
        "workspace",
        "skill_invocation_expected",
        "deterministic_assertions",
    }
    missing = sorted(required - case.keys())
    if missing:
        errors.append(f"missing fields: {', '.join(missing)}")
        return errors

    case_id = case["id"]
    if not isinstance(case_id, str) or not re.fullmatch(r"[a-z0-9-]+", case_id):
        errors.append("id must use lowercase letters, digits, and hyphens")
    if case["module"] not in MODULES:
        errors.append(f"unknown module: {case['module']}")
    if not isinstance(case["tags"], list) or not case["tags"]:
        errors.append("tags must be a non-empty list")
    if not isinstance(case["prompt"], str) or not case["prompt"].strip():
        errors.append("prompt must be non-empty")
    if case.get("activation", "explicit") not in {"explicit", "automatic"}:
        errors.append("activation must be explicit or automatic")
    if not isinstance(case["skill_invocation_expected"], bool):
        errors.append("skill_invocation_expected must be boolean")

    workspace = case["workspace"]
    if not isinstance(workspace, dict):
        errors.append("workspace must be an object")
    else:
        fixture = workspace.get("fixture")
        if not isinstance(fixture, str) or not fixture:
            errors.append("workspace.fixture must be non-empty")
        elif not (FIXTURES_DIR / fixture).is_dir():
            errors.append(f"fixture does not exist: {fixture}")
        if not isinstance(workspace.get("git"), bool):
            errors.append("workspace.git must be boolean")

    assertions = case["deterministic_assertions"]
    if not isinstance(assertions, list) or not assertions:
        errors.append("deterministic_assertions must be a non-empty list")
        return errors
    seen_ids: set[str] = set()
    for index, assertion in enumerate(assertions):
        label = f"deterministic_assertions[{index}]"
        if not isinstance(assertion, dict):
            errors.append(f"{label} must be an object")
            continue
        assertion_id = assertion.get("id")
        if not isinstance(assertion_id, str) or not re.fullmatch(
            r"[a-z0-9-]+", assertion_id
        ):
            errors.append(f"{label}.id is invalid")
        elif assertion_id in seen_ids:
            errors.append(f"duplicate assertion id: {assertion_id}")
        else:
            seen_ids.add(assertion_id)
        kind = assertion.get("kind")
        if kind not in ASSERTION_KINDS:
            errors.append(f"{label}.kind is invalid: {kind}")
        if kind in {"file_exists", "file_contains"} and not isinstance(
            assertion.get("path"), str
        ):
            errors.append(f"{label}.path is required for {kind}")
        if kind in {
            "file_contains",
            "final_matches",
            "event_matches",
            "event_not_matches",
        } and not isinstance(assertion.get("pattern"), str):
            errors.append(f"{label}.pattern is required for {kind}")
        if not isinstance(assertion.get("critical"), bool):
            errors.append(f"{label}.critical must be boolean")
    return errors


def validate_suite() -> dict[str, Any]:
    cases = load_cases()
    errors: list[str] = []
    ids: set[str] = set()
    for case in cases:
        case_id = str(case.get("id", "<missing>"))
        if case_id in ids:
            errors.append(f"{case_id}: duplicate case id")
        ids.add(case_id)
        for error in validate_case(case):
            errors.append(f"{case_id}: {error}")

    manifest = read_json(MANIFEST_PATH)
    for schema_path in sorted((HARNESS_ROOT / "schemas").glob("*.json")):
        read_json(schema_path)
    skill_text = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
    if not skill_text.startswith("---\n") or f"name: {TARGET_SKILL_NAME}" not in skill_text:
        errors.append(f"SKILL.md frontmatter does not identify {TARGET_SKILL_NAME}")
    if SKILL_ROOT.name != TARGET_SKILL_NAME:
        errors.append(
            f"manifest skill_name {TARGET_SKILL_NAME} does not match directory {SKILL_ROOT.name}"
        )
    for linked in re.findall(r"\((references/[^)]+\.md)\)", skill_text):
        if not (SKILL_ROOT / linked).is_file():
            errors.append(f"SKILL.md references missing file: {linked}")
    support_skills = EVAL_ROOT / "support-skills"
    if support_skills.is_dir():
        for support in sorted(path for path in support_skills.iterdir() if path.is_dir()):
            discoverable_file = support / "SKILL.md"
            support_file = support / "SKILL.stub.md"
            if discoverable_file.exists():
                errors.append(
                    f"support skill source must not be discoverable as SKILL.md: {support.name}"
                )
            if not support_file.is_file():
                errors.append(f"support skill is missing SKILL.stub.md: {support.name}")
                continue
            support_text = support_file.read_text(encoding="utf-8")
            if not support_text.startswith("---\n") or f"name: {support.name}" not in support_text:
                errors.append(
                    f"support skill frontmatter does not identify {support.name}"
                )
    if manifest.get("schema_version") != 3:
        errors.append("manifest schema_version must be 3")
    coverage = manifest.get("coverage", {})
    expected_case_count = coverage.get("case_count")
    if len(cases) != expected_case_count:
        errors.append(f"expected {expected_case_count} cases, found {len(cases)}")
    used_fixtures = {case.get("workspace", {}).get("fixture") for case in cases}
    available_fixtures = {path.name for path in FIXTURES_DIR.iterdir() if path.is_dir()}
    orphaned = sorted(available_fixtures - used_fixtures)
    if orphaned:
        errors.append(f"orphaned fixtures: {', '.join(orphaned)}")
    for case in cases:
        if "critical" in case.get("tags", []) and not any(
            assertion.get("critical")
            for assertion in case.get("deterministic_assertions", [])
        ):
            errors.append(f"{case.get('id')}: critical tag requires a critical assertion")
        for assertion in case.get("deterministic_assertions", []):
            for pattern in [assertion.get("pattern")]:
                if pattern is not None:
                    try:
                        re.compile(pattern)
                    except re.error as exc:
                        errors.append(f"{case.get('id')}/{assertion.get('id')}: invalid regex: {exc}")
            if "path" in assertion:
                relative = Path(assertion["path"])
                if relative.is_absolute() or ".." in relative.parts:
                    errors.append(
                        f"{case.get('id')}/{assertion.get('id')}: unsafe assertion path"
                    )

    expected_counts = coverage.get("profile_case_counts", {})
    for profile_name, expected_count in expected_counts.items():
        profile = manifest.get("profiles", {}).get(profile_name, {})
        selected = select_cases(cases, profile.get("tags", []))
        selected_count = len(selected)
        if selected_count != expected_count:
            errors.append(
                f"{profile_name}: expected {expected_count} selected cases, found {selected_count}"
            )
            continue
        profile_limit = profile.get("max_codex_calls")
        if not isinstance(profile_limit, int) or profile_limit <= 0:
            errors.append(f"{profile_name}: max_codex_calls must be a positive integer")
            continue
        estimated = estimate_calls(selected)["total_codex_calls"]
        if estimated != profile_limit:
            errors.append(
                f"{profile_name}: default plan uses {estimated} Codex calls, "
                f"but max_codex_calls is {profile_limit}"
            )

    return {"valid": not errors, "case_count": len(cases), "errors": errors}


def safe_relative_path(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    root_resolved = root.resolve()
    if path != root_resolved and root_resolved not in path.parents:
        raise EvalError(f"Path escapes workspace: {relative}")
    return path


def run_checked(args: list[str], cwd: Path) -> str:
    result = subprocess.run(
        args,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise EvalError(
            f"Command failed ({result.returncode}): {' '.join(args)}\n{result.stderr}"
        )
    return result.stdout


def stage_workspace(case: dict[str, Any], destination: Path) -> None:
    fixture = FIXTURES_DIR / case["workspace"]["fixture"]
    shutil.copytree(fixture, destination, dirs_exist_ok=True)
    if case["workspace"]["git"]:
        run_checked(["git", "init", "--quiet"], destination)
        run_checked(["git", "config", "user.name", "Skill Eval"], destination)
        run_checked(["git", "config", "user.email", "skill-eval@example.invalid"], destination)
        run_checked(["git", "add", "--all"], destination)
        run_checked(["git", "commit", "--quiet", "-m", "fixture baseline"], destination)


def find_auth_source(explicit: str | None) -> Path | None:
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        return candidate if candidate.is_file() else None
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    candidate = codex_home / "auth.json"
    return candidate if candidate.is_file() else None


def prepare_codex_home(
    destination: Path,
    auth_source: Path | None,
    require_auth: bool,
) -> None:
    destination.mkdir(parents=True, mode=0o700)
    destination.chmod(0o700)
    if auth_source:
        (destination / "auth.json").symlink_to(auth_source)
    elif require_auth:
        raise EvalError(
            "No Codex auth.json found. Pass --auth-source or authenticate the Codex CLI."
        )
    support_skills = EVAL_ROOT / "support-skills"
    skills_dir = destination / "skills"
    skills_dir.mkdir()
    if support_skills.is_dir():
        for source in sorted(support_skills.iterdir()):
            if source.is_dir():
                target = skills_dir / source.name
                shutil.copytree(
                    source,
                    target,
                    ignore=shutil.ignore_patterns("SKILL.stub.md"),
                )
                shutil.copy2(source / "SKILL.stub.md", target / "SKILL.md")
    target = skills_dir / SKILL_ROOT.name
    target.mkdir()
    for source in sorted(SKILL_ROOT.iterdir()):
        if source.name == "evals":
            continue
        destination_path = target / source.name
        if source.is_dir():
            shutil.copytree(source, destination_path)
        elif source.is_file():
            shutil.copy2(source, destination_path)


def codex_version(codex_bin: str) -> str:
    try:
        result = subprocess.run(
            [codex_bin, "--version"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"unavailable: {exc}"
    return result.stdout.strip()


def treatment_instructions(automatic_selection: bool = False) -> str:
    if automatic_selection:
        return (
            "This is an isolated behavioral evaluation with installed skills. No skill "
            "is preselected. Before acting, use installed skills only when their "
            "descriptions strongly match the task, then read and follow each selected "
            "SKILL.md. Complete the user's task and do not inspect files outside the "
            "current workspace except skills installed in the isolated Codex home."
        )
    return (
        f"This is an isolated behavioral evaluation. The {TARGET_SKILL_NAME} "
        "skill is explicitly selected for this task. Read its SKILL.md and only "
        "additional files relevant to the actual task. Apply its guidance while "
        "still completing the user's task. Do not inspect files outside the current "
        "workspace except skills installed in the isolated Codex home."
    )


def build_codex_command(
    codex_bin: str,
    workspace: Path,
    final_path: Path,
    model: str | None,
    reasoning_effort: str | None,
    automatic_selection: bool = False,
) -> list[str]:
    instructions = treatment_instructions(automatic_selection)
    command = [
        codex_bin,
        "exec",
        "--disable",
        "apps",
        "--disable",
        "plugins",
        "--disable",
        "remote_plugin",
        "--disable",
        "browser_use",
        "--disable",
        "computer_use",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--json",
        "--color",
        "never",
        "--sandbox",
        "workspace-write",
        "-C",
        str(workspace),
        "-c",
        'approval_policy="never"',
        "-c",
        'web_search="disabled"',
        "-c",
        "developer_instructions=" + json.dumps(instructions),
        "-o",
        str(final_path),
    ]
    if model:
        command.extend(["--model", model])
    if reasoning_effort:
        command.extend(["-c", f'model_reasoning_effort="{reasoning_effort}"'])
    command.append("-")
    return command


def run_process(
    command: list[str], prompt: str, cwd: Path, env: dict[str, str], timeout: int
) -> dict[str, Any]:
    started = time.monotonic()
    try:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
    except OSError as exc:
        raise EvalError(f"Cannot start Codex: {exc}") from exc

    timed_out = False
    try:
        stdout, stderr = process.communicate(prompt, timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
    return {
        "exit_code": process.returncode,
        "timed_out": timed_out,
        "duration_seconds": round(time.monotonic() - started, 3),
        "stdout": stdout,
        "stderr": stderr,
    }


def parse_jsonl(text: str) -> tuple[list[Any], list[str]]:
    events: list[Any] = []
    invalid: list[str] = []
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            invalid.append(line)
    return events, invalid


def observable_event_text(events: Iterable[Any]) -> str:
    """Return tool/command evidence without command output or reasoning prose."""
    observable: list[str] = []
    markers = (
        "command",
        "tool",
        "function",
        "collaboration",
        "agent_start",
        "agent_spawn",
        "review_start",
    )
    for event in events:
        if not isinstance(event, dict):
            continue
        event_type = str(event.get("type", "")).lower()
        item = event.get("item")
        item_type = str(item.get("type", "")).lower() if isinstance(item, dict) else ""
        if item_type == "command_execution":
            observable.append(
                json.dumps(
                    {
                        "type": event_type,
                        "item": {
                            "type": item_type,
                            "command": item.get("command"),
                            "exit_code": item.get("exit_code"),
                            "status": item.get("status"),
                        },
                    },
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            continue
        if any(marker in event_type or marker in item_type for marker in markers):
            observable.append(json.dumps(event, ensure_ascii=False, sort_keys=True))
    return "\n".join(observable)


def extract_usage(events: Iterable[Any]) -> dict[str, int]:
    totals: dict[str, int] = {}
    for event in events:
        if not isinstance(event, dict) or event.get("type") != "turn.completed":
            continue
        usage = event.get("usage", {})
        if not isinstance(usage, dict):
            continue
        for key, value in usage.items():
            if isinstance(value, int) and not isinstance(value, bool):
                totals[key] = totals.get(key, 0) + value
    return totals


def skill_invocation_observed(events: Iterable[Any]) -> bool:
    observed = observable_event_text(events)
    return TARGET_SKILL_NAME in observed and (
        "SKILL.md" in observed or "skill/read" in observed
    )


def git_diff(workspace: Path) -> str:
    if not (workspace / ".git").exists():
        return ""
    result = subprocess.run(
        ["git", "diff", "--no-ext-diff", "--binary", "HEAD"],
        cwd=workspace,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return result.stdout if result.returncode == 0 else f"<git diff failed: {result.stderr}>"


def regex_matches(pattern: str, text: str) -> bool:
    return re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE | re.DOTALL) is not None


def evaluate_deterministic(
    assertions: Iterable[dict[str, Any]],
    workspace: Path,
    final_message: str,
    event_text: str,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for assertion in assertions:
        kind = assertion["kind"]
        passed = False
        evidence = ""
        try:
            if kind == "file_exists":
                path = safe_relative_path(workspace, assertion["path"])
                exists = path.exists()
                passed = exists
                evidence = f"{assertion['path']}: exists={exists}"
            elif kind == "file_contains":
                path = safe_relative_path(workspace, assertion["path"])
                content = path.read_text(encoding="utf-8") if path.is_file() else ""
                matched = regex_matches(assertion["pattern"], content)
                passed = matched
                evidence = f"{assertion['path']}: pattern_matched={matched}"
            elif kind == "final_matches":
                matched = regex_matches(assertion["pattern"], final_message)
                passed = matched
                evidence = f"final_message pattern_matched={matched}"
            elif kind == "event_matches":
                matched = regex_matches(assertion["pattern"], event_text)
                passed = matched
                evidence = f"event_stream pattern_matched={matched}"
            elif kind == "event_not_matches":
                matched = regex_matches(assertion["pattern"], event_text)
                passed = not matched
                evidence = f"event_stream pattern_matched={matched}"
            else:
                raise EvalError(f"Unsupported assertion kind: {kind}")
        except (OSError, UnicodeDecodeError, re.error, EvalError) as exc:
            passed = False
            evidence = f"assertion error: {exc}"

        results.append(
            {
                "id": assertion["id"],
                "kind": kind,
                "critical": assertion["critical"],
                "status": "pass" if passed else "fail",
                "evidence": [evidence],
            }
        )
    return results


def copy_workspace_artifact(source: Path, destination: Path) -> None:
    def ignore(directory: str, names: list[str]) -> set[str]:
        ignored = {".git"} if Path(directory) == source else set()
        return ignored & set(names)

    shutil.copytree(source, destination, ignore=ignore)


def run_trial(
    case: dict[str, Any],
    artifact_dir: Path,
    codex_bin: str,
    auth_source: Path | None,
    model: str | None,
    reasoning_effort: str | None,
    timeout: int,
) -> dict[str, Any]:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"rte-{case['id']}-") as temporary:
        temp_root = Path(temporary)
        workspace = temp_root / "workspace"
        home = temp_root / "codex-home"
        workspace.mkdir()
        stage_workspace(case, workspace)
        prepare_codex_home(
            home,
            auth_source=auth_source,
            require_auth=Path(codex_bin).name == "codex",
        )

        final_path = temp_root / "final-message.txt"
        command = build_codex_command(
            codex_bin,
            workspace,
            final_path,
            model,
            reasoning_effort,
            automatic_selection=case.get("activation") == "automatic",
        )
        env = dict(os.environ)
        env.update(
            {
                "CODEX_HOME": str(home),
                "NO_COLOR": "1",
                "PYTHONDONTWRITEBYTECODE": "1",
            }
        )
        process_result = run_process(command, case["prompt"], workspace, env, timeout)
        final_message = (
            final_path.read_text(encoding="utf-8", errors="replace")
            if final_path.exists()
            else ""
        )
        events, invalid_jsonl = parse_jsonl(process_result["stdout"])
        usage = extract_usage(events)
        invocation_observed = skill_invocation_observed(events)
        diff = git_diff(workspace)
        event_text = observable_event_text(events)
        deterministic = evaluate_deterministic(
            case["deterministic_assertions"],
            workspace,
            final_message,
            event_text,
        )
        invocation_expected = case["skill_invocation_expected"]
        deterministic.append(
            {
                "id": "skill-invocation",
                "kind": "skill_invocation",
                "critical": False,
                "status": (
                    "pass" if invocation_observed == invocation_expected else "fail"
                ),
                "evidence": [
                    f"expected={invocation_expected}, observed={invocation_observed}"
                ],
            }
        )

        deterministic_failures = [item for item in deterministic if item["status"] == "fail"]
        if process_result["exit_code"] != 0 or process_result["timed_out"]:
            status = "infra_error"
        elif deterministic_failures:
            status = "fail"
        else:
            status = "pass"

        (artifact_dir / "events.jsonl").write_text(
            process_result["stdout"], encoding="utf-8"
        )
        (artifact_dir / "stderr.txt").write_text(
            process_result["stderr"], encoding="utf-8"
        )
        (artifact_dir / "final-message.md").write_text(final_message, encoding="utf-8")
        (artifact_dir / "git.diff").write_text(diff, encoding="utf-8")
        copy_workspace_artifact(workspace, artifact_dir / "workspace")

        result = {
            "case_id": case["id"],
            "case_title": case["title"],
            "module": case["module"],
            "status": status,
            "case_hash": stable_hash({key: value for key, value in case.items() if key != "_source"}),
            "process": {
                key: value
                for key, value in process_result.items()
                if key not in {"stdout", "stderr"}
            },
            "usage": usage,
            "skill_invocation_observed": invocation_observed,
            "invalid_jsonl_lines": invalid_jsonl,
            "assertions": deterministic,
            "artifact_dir": str(artifact_dir),
        }
        write_json(artifact_dir / "result.json", result)
        return result


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    failed = [result["case_id"] for result in results if result["status"] == "fail"]
    infra_errors = [
        result["case_id"] for result in results if result["status"] == "infra_error"
    ]
    critical_failures = [
        {"case_id": result["case_id"], "assertion": assertion["id"]}
        for result in results
        for assertion in result.get("assertions", [])
        if assertion["critical"] and assertion["status"] == "fail"
    ]
    usage: dict[str, int] = {}
    for result in results:
        for key, value in result.get("usage", {}).items():
            usage[key] = usage.get(key, 0) + value
    status = "infra_error" if infra_errors else "fail" if failed else "pass"
    return {
        "status": status,
        "case_count": len(results),
        "failed_cases": failed,
        "infra_errors": infra_errors,
        "critical_failures": critical_failures,
        "usage": usage,
    }


def select_cases(cases: list[dict[str, Any]], tags: list[str]) -> list[dict[str, Any]]:
    selected = [case for case in cases if set(case["tags"]) & set(tags)]
    return sorted(selected, key=lambda item: item["id"])


def estimate_calls(cases: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "target_calls": len(cases),
        "total_codex_calls": len(cases),
    }


def call_budget_error(
    call_estimate: dict[str, int],
    requested_budget: int | None,
    profile_limit: int | None,
) -> str | None:
    total = call_estimate["total_codex_calls"]
    if profile_limit is not None and total > profile_limit:
        return (
            f"planned {total} Codex calls exceeds the profile hard limit "
            f"of {profile_limit}; use a narrower profile or the case command"
        )
    if requested_budget is None:
        return (
            f"planned {total} Codex calls but no explicit budget was provided; "
            f"inspect with --dry-run, then pass --max-codex-calls {total}"
        )
    if total > requested_budget:
        return (
            f"planned {total} Codex calls exceeds --max-codex-calls "
            f"{requested_budget}"
        )
    return None


def default_output_dir(profile: str) -> Path:
    timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return EVAL_ROOT / "results" / f"{timestamp}-{profile}"


def run_selected(args: argparse.Namespace) -> int:
    manifest = read_json(MANIFEST_PATH)
    cases = load_cases()
    validation = validate_suite()
    if not validation["valid"]:
        for error in validation["errors"]:
            print(f"ERROR: {error}", file=sys.stderr)
        return 2

    if args.command == "case":
        selected = [case for case in cases if case["id"] == args.case_id]
        if not selected:
            print(f"Unknown case: {args.case_id}", file=sys.stderr)
            return 2
        profile_name = "case"
    else:
        profile_name = "smoke"
        profile = manifest["profiles"]["smoke"]
        selected = select_cases(cases, profile["tags"])

    call_estimate = estimate_calls(selected)
    if args.dry_run:
        print(
            json.dumps(
                {
                    "profile": profile_name,
                    "call_estimate": call_estimate,
                    "cases": [case["id"] for case in selected],
                },
                indent=2,
            )
        )
        return 0

    profile_limit = (
        None
        if profile_name == "case"
        else manifest["profiles"][profile_name].get("max_codex_calls")
    )
    budget_error = call_budget_error(
        call_estimate, args.max_codex_calls, profile_limit
    )
    if budget_error:
        print(f"ERROR: {budget_error}", file=sys.stderr)
        return 2

    output_dir = Path(args.output_dir).resolve() if args.output_dir else default_output_dir(profile_name)
    output_dir.mkdir(parents=True, exist_ok=False)
    auth_source = find_auth_source(args.auth_source)
    version = codex_version(args.codex_bin)
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    results: list[dict[str, Any]] = []
    print(
        f"Running {call_estimate['target_calls']} case(s), results={output_dir}",
        flush=True,
    )
    for index, case in enumerate(selected, start=1):
        artifact_dir = output_dir / case["id"]
        print(f"[{index}/{len(selected)}] {case['id']}", flush=True)
        try:
            result = run_trial(
                case,
                artifact_dir,
                args.codex_bin,
                auth_source,
                args.model,
                args.reasoning_effort,
                args.timeout,
            )
        except EvalError as exc:
            result = {
                "case_id": case["id"],
                "case_title": case["title"],
                "module": case["module"],
                "status": "infra_error",
                "error": str(exc),
                "assertions": [],
                "artifact_dir": str(artifact_dir),
            }
            write_json(artifact_dir / "result.json", result)
        results.append(result)
        print(f"  -> {result['status']}", flush=True)

    summary = summarize(results)
    report = {
        "schema_version": 1,
        "profile": profile_name,
        "started_at": started_at,
        "environment": {
            "codex_version": version,
            "model": args.model,
            "reasoning_effort": args.reasoning_effort,
            "skill_hash": skill_hash(),
            "python": sys.version,
            "platform": sys.platform,
        },
        "configuration": {
            "timeout_seconds": args.timeout,
            "call_estimate": call_estimate,
        },
        "cases": results,
        "summary": summary,
    }
    write_json(output_dir / "report.json", report)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if summary["status"] == "pass" else 1


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--suite-root",
        type=Path,
        default=HARNESS_ROOT / "suites" / "reliable-task-execution",
        help="eval directory containing manifest.json, cases/, and fixtures/",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("static", help="validate manifests, cases, and fixtures")

    def add_run_options(
        command_parser: argparse.ArgumentParser, default_budget: int | None
    ) -> None:
        command_parser.add_argument("--codex-bin", default="codex")
        command_parser.add_argument("--auth-source")
        command_parser.add_argument("--model")
        command_parser.add_argument(
            "--reasoning-effort", choices=["low", "medium", "high", "xhigh", "max", "ultra"]
        )
        command_parser.add_argument("--timeout", type=int, default=600)
        command_parser.add_argument("--output-dir")
        command_parser.add_argument("--dry-run", action="store_true")
        command_parser.add_argument(
            "--max-codex-calls",
            type=int,
            default=default_budget,
            help="explicit upper bound required before a multi-case Codex run",
        )

    add_run_options(subparsers.add_parser("smoke"), default_budget=None)

    case_parser = subparsers.add_parser("case")
    case_parser.add_argument("case_id")
    add_run_options(case_parser, default_budget=1)
    return parser


def main() -> int:
    args = make_parser().parse_args()
    try:
        configure_suite(args.suite_root)
    except EvalError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if args.command == "static":
        result = validate_suite()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["valid"] else 1
    if args.timeout <= 0 or (
        args.max_codex_calls is not None and args.max_codex_calls <= 0
    ):
        print("timeout and max-codex-calls must be positive", file=sys.stderr)
        return 2
    return run_selected(args)


if __name__ == "__main__":
    raise SystemExit(main())
