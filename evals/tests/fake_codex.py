#!/usr/bin/env python3
"""Deterministic Codex stand-in for the minimal integration cases."""

import json
import sys
from pathlib import Path


def argument_value(name):
    index = sys.argv.index(name)
    return sys.argv[index + 1]


if "--version" in sys.argv:
    print("fake-codex 1.0")
    raise SystemExit(0)

workspace = Path(argument_value("-C"))
output = Path(argument_value("-o"))
prompt = sys.stdin.read()
events = []


def command_event(command, exit_code=None):
    item = {
        "type": "command_execution",
        "command": command,
        "status": "completed",
    }
    if exit_code is not None:
        item["exit_code"] = exit_code
    events.append({"type": "item.completed", "item": item})


if (workspace / "CONTEXT.md").is_file():
    command_event("sed -n 1,200p codex-home/skills/brainstorming/SKILL.md")
    command_event("sed -n 1,200p CONTEXT.md")
    if "durable Full Design" in prompt:
        final_message = (
            "Use one governing design for the shared contract, define task dependency "
            "order, and finish with end-to-end integration acceptance."
        )
    else:
        final_message = "Use SQLite: it satisfies the offline and single-process constraints."
elif (workspace / "Component.jsx").is_file():
    if "Use using-superpowers" in prompt:
        command_event("sed -n 1,200p codex-home/skills/using-superpowers/SKILL.md")
        command_event("sed -n 1,200p codex-home/skills/react-performance/SKILL.md")
        final_message = "Use the React performance skill and virtualize the slow list."
    elif "loses keyboard focus" in prompt:
        command_event("sed -n 1,200p codex-home/skills/react-accessibility/SKILL.md")
        final_message = "Preserve keyboard focus with stable row identity and managed focus."
    elif "do not know whether" in prompt:
        command_event("sed -n 1,200p codex-home/skills/using-superpowers/SKILL.md")
        command_event("sed -n 1,200p codex-home/skills/react-performance/SKILL.md")
        command_event("sed -n 1,200p codex-home/skills/react-accessibility/SKILL.md")
        final_message = "Inspect rendering latency and keyboard focus before selecting both relevant skills."
    elif "keyboard accessibility" in prompt:
        command_event("sed -n 1,200p codex-home/skills/react-performance/SKILL.md")
        command_event("sed -n 1,200p codex-home/skills/using-superpowers/SKILL.md")
        command_event("sed -n 1,200p codex-home/skills/react-accessibility/SKILL.md")
        final_message = "Virtualize the list and preserve keyboard accessibility with managed focus."
    else:
        command_event("sed -n 1,200p codex-home/skills/react-performance/SKILL.md")
        final_message = "Memoize rows or virtualize the list to reduce unnecessary renders."
elif (workspace / "notes.txt").is_file():
    final_message = "The note asks the team to ship the focused fix after tests pass."
elif (workspace / "SKILL_CATALOG.txt").is_file():
    final_message = "The performance skill covers rendering speed; the accessibility skill covers keyboard and focus behavior."
elif (workspace / "algorithm.py").is_file():
    command_event("sed -n 1,200p algorithm.py")
    final_message = "The function is O(n); using a set keeps the local implementation linear."
elif (workspace / "PROPOSAL.md").is_file():
    command_event("sed -n 1,220p PROPOSAL.md")
    final_message = "The proposal is clear overall, but its rollout section needs explicit success criteria."
elif (workspace / "change.diff").is_file():
    command_event("sed -n 1,220p codex-home/skills/code-review/SKILL.md")
    if "focused security" in prompt:
        command_event("node codex-home/skills/code-review/scripts/review.mjs prepare --repo . --file app.py")
        command_event("sed -n 1,220p codex-home/skills/code-review/references/focused-review.md")
        command_event("sed -n 1,220p codex-home/skills/code-review/references/security-reliability.md")
        command_event("node codex-home/skills/code-review/scripts/review.mjs mark --run /tmp/review --item fixture-item --status reviewed")
        command_event("node codex-home/skills/code-review/scripts/review.mjs validate --run /tmp/review --input /tmp/findings.json")
        command_event("node codex-home/skills/code-review/scripts/review.mjs finalize --run /tmp/review --conclusion REQUEST_CHANGES")
        final_message = "REQUEST_CHANGES: shell=True makes user-controlled input command-injectable."
    elif "missing-ref" in prompt:
        command_event("sed -n 1,220p codex-home/skills/code-review/references/acceptance-review.md")
        final_message = "The Git baseline missing-ref is invalid and cannot be resolved, so no comparison conclusion is issued."
    elif "final acceptance" in prompt:
        command_event("node codex-home/skills/code-review/scripts/review.mjs prepare --repo . --file app.py")
        command_event("sed -n 1,220p codex-home/skills/code-review/references/acceptance-review.md")
        command_event("sed -n 1,220p codex-home/skills/code-review/references/spec-compliance.md")
        command_event("node codex-home/skills/code-review/scripts/review.mjs mark --run /tmp/review --item fixture-item --status reviewed")
        command_event("node codex-home/skills/code-review/scripts/review.mjs validate --run /tmp/review --input /tmp/findings.json")
        command_event("node codex-home/skills/code-review/scripts/review.mjs finalize --run /tmp/review --conclusion REQUEST_CHANGES")
        final_message = "REQUEST_CHANGES: shell=True violates SPEC.md; without a baseline, historical change attribution is unavailable."
    else:
        command_event("node codex-home/skills/code-review/scripts/review.mjs prepare --repo . --file app.py")
        command_event("sed -n 1,220p codex-home/skills/code-review/references/routine-review.md")
        command_event("sed -n 1,220p codex-home/skills/code-review/references/correctness-quality.md")
        command_event("node codex-home/skills/code-review/scripts/review.mjs mark --run /tmp/review --item fixture-item --status reviewed")
        command_event("node codex-home/skills/code-review/scripts/review.mjs validate --run /tmp/review --input /tmp/findings.json")
        command_event("node codex-home/skills/code-review/scripts/review.mjs finalize --run /tmp/review --conclusion REQUEST_CHANGES")
        final_message = "REQUEST_CHANGES: the proposed shell=True call permits command injection."
elif (workspace / "calc.py").is_file():
    calc = workspace / "calc.py"
    calc.write_text(
        calc.read_text(encoding="utf-8").replace(
            "min(value, lower)", "min(value, upper)"
        ),
        encoding="utf-8",
    )
    command_event(
        "sed -n 1,200p codex-home/skills/reliable-task-execution/SKILL.md"
    )
    command_event("python3 -m unittest test_calc.py", exit_code=0)
    final_message = "Fixed clamp() and verified the existing tests pass."
elif (workspace / "module.py").is_file():
    if "not asking for TDD" in prompt:
        final_message = "Add one integration test that exercises greet() through its caller-facing interface."
    else:
        command_event("sed -n 1,200p codex-home/skills/tdd/SKILL.md")
        final_message = "Red: add the smallest failing behavior test. Green: implement only enough to pass it."
elif (workspace / "api_layer.py").is_file():
    if "complete scope" in prompt:
        final_message = "Make the requested local change only in local_target.py."
    else:
        command_event("sed -n 1,240p codex-home/skills/repo-map-first/SKILL.md")
        final_message = "Resolve ownership at the API/data module boundary before choosing placement."
else:
    command_event(
        "sed -n 1,200p codex-home/skills/reliable-task-execution/SKILL.md"
    )
    final_message = "Which files count as old, and what retention date should I use?"

print(json.dumps({"type": "thread.started", "thread_id": "fake"}))
for event in events:
    print(json.dumps(event))
output.write_text(final_message + "\n", encoding="utf-8")
print(
    json.dumps(
        {
            "type": "turn.completed",
            "usage": {"input_tokens": 100, "output_tokens": 20},
        }
    )
)
