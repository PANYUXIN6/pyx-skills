import importlib.util
import http.client
import io
import json
import os
import subprocess
import tempfile
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path


RUNNER_PATH = Path(__file__).resolve().parents[1] / "scripts" / "run_eval.py"
HARNESS_ROOT = RUNNER_PATH.parents[1]
SKILLS_ROOT = HARNESS_ROOT.parent
SUITES_ROOT = HARNESS_ROOT / "suites"
SPEC = importlib.util.spec_from_file_location("skill_eval_runner", RUNNER_PATH)
runner = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(runner)


class SuiteValidationTests(unittest.TestCase):
    def tearDown(self):
        runner.configure_suite(SUITES_ROOT / "reliable-task-execution")

    def test_minimal_suites_are_valid_and_bounded(self):
        expected = {
            "brainstorming": 2,
            "using-superpowers": 8,
            "reliable-task-execution": 2,
            "tdd": 2,
            "repo-map-first": 2,
            "code-review": 6,
        }
        for skill_name, count in expected.items():
            runner.configure_suite(SUITES_ROOT / skill_name)
            result = runner.validate_suite()
            self.assertTrue(result["valid"], result["errors"])
            self.assertEqual(result["case_count"], count)
            manifest = runner.read_json(runner.MANIFEST_PATH)
            selected = runner.select_cases(
                runner.load_cases(), manifest["profiles"]["smoke"]["tags"]
            )
            self.assertEqual(len(selected), count)
            self.assertEqual(
                runner.estimate_calls(selected)["total_codex_calls"], count
            )
            self.assertEqual(
                manifest["profiles"]["smoke"]["max_codex_calls"], count
            )

    def test_only_required_support_skill_stubs_remain(self):
        runner.configure_suite(SUITES_ROOT / "using-superpowers")
        source_catalog = runner.EVAL_ROOT / "support-skills"
        self.assertFalse(any(source_catalog.rglob("SKILL.md")))
        self.assertEqual(
            sorted(
                path.relative_to(source_catalog).as_posix()
                for path in source_catalog.rglob("SKILL.stub.md")
            ),
            [
                "react-accessibility/SKILL.stub.md",
                "react-performance/SKILL.stub.md",
            ],
        )


class IsolationTests(unittest.TestCase):
    def tearDown(self):
        runner.configure_suite(SUITES_ROOT / "reliable-task-execution")

    def test_runtime_skill_trees_exclude_development_artifacts(self):
        for skill_name in (
            "brainstorming",
            "using-superpowers",
            "reliable-task-execution",
            "tdd",
            "repo-map-first",
            "code-review",
        ):
            skill_root = SKILLS_ROOT / skill_name
            self.assertFalse((skill_root / "evals").exists())
            self.assertFalse(any(skill_root.rglob(".DS_Store")))
            self.assertEqual(
                [
                    path.relative_to(skill_root).as_posix()
                    for path in skill_root.rglob("SKILL.md")
                ],
                ["SKILL.md"],
            )

    def test_brainstorming_server_scripts_are_directly_executable(self):
        skill_root = SKILLS_ROOT / "brainstorming"
        for name in ("start-server.sh", "stop-server.sh"):
            self.assertTrue(os.access(skill_root / "scripts" / name, os.X_OK))
        guide = (skill_root / "visual-companion.md").read_text(encoding="utf-8")
        self.assertIn("<skill-dir>/scripts/start-server.sh", guide)
        self.assertIn("<skill-dir>/scripts/stop-server.sh", guide)

    def test_brainstorming_coordinates_only_dependent_full_design_tasks(self):
        skill = (SKILLS_ROOT / "brainstorming" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("Coordinate Dependent Implementation Tasks", skill)
        self.assertIn("one governing design", skill)
        self.assertIn("not task chronology", skill)
        self.assertIn("before treating dependent child-task designs as final", skill)
        self.assertIn("Skip this coordination", skill)

    def test_repo_map_first_preserves_explicit_and_bootstrap_contracts(self):
        skill_root = SKILLS_ROOT / "repo-map-first"
        skill = (skill_root / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("explicit requests always complete the map workflow", skill)
        self.assertIn("Stay in explicit map mode", skill)
        self.assertIn("Repository-Context Bootstrap", skill)
        self.assertIn("Repository-Context Validation", skill)
        self.assertIn("authority_status: observed", skill)
        self.assertTrue((skill_root / "references" / "placement-analysis.md").is_file())
        self.assertFalse(
            (skill_root / "references" / "pre-code-analysis-template.md").exists()
        )

    def test_code_review_uses_a_deterministic_runtime_contract(self):
        skill_root = SKILLS_ROOT / "code-review"
        skill = (skill_root / "SKILL.md").read_text(encoding="utf-8")
        protocol = (
            skill_root / "references" / "review-runtime-protocol.md"
        ).read_text(encoding="utf-8")
        self.assertIn("scripts/review.mjs", skill)
        self.assertIn("never issue `APPROVE`", skill)
        self.assertIn("existing_code", skill)
        self.assertIn("does not require Git, a diff, or a baseline", skill)
        self.assertIn("cannot prove that an Agent understood an item", skill)
        self.assertIn("the user explicitly asks to find defects or risks", skill)
        self.assertIn('"检查一下" is not review intent by itself', skill)
        self.assertIn("do not invoke the Runner or create Finding artifacts", skill)
        self.assertIn("Do not use to review prose documents themselves", skill)
        self.assertIn("current_input_drift", protocol)
        self.assertIn("queue_path", skill)
        self.assertIn("only when a command fails", skill)
        self.assertIn("8 MiB", protocol)
        self.assertTrue((skill_root / "scripts" / "review.mjs").is_file())
        self.assertTrue((skill_root / "references" / "findings.schema.json").is_file())
        self.assertFalse(
            (skill_root / "references" / "review-manifest.schema.json").exists()
        )

    def test_design_review_discovers_declared_authority_and_discloses_coverage(self):
        skill_root = SKILLS_ROOT / "review-design-contracts"
        skill = (skill_root / "SKILL.md").read_text(encoding="utf-8")
        protocol = (
            skill_root / "references" / "review-protocol.md"
        ).read_text(encoding="utf-8")
        role = (skill_root / "references" / "self-consistency-role.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("authority precheck", skill)
        self.assertIn("unambiguous non-observed governing design", skill)
        self.assertIn("--discovered-authority", skill)
        self.assertIn(
            "proximity, numbering, chronology, or semantic similarity", skill
        )
        self.assertIn("repository-context validation mode", skill)
        self.assertIn("explicit authorities", skill)
        self.assertIn("conflicting candidates remain", protocol)
        self.assertIn(
            "user-specified authority paths, automatically discovered authority paths",
            protocol,
        )
        self.assertIn("undefined or cyclic prerequisites", role)
        self.assertIn("incompatible upstream outputs and downstream inputs", role)

    @unittest.skipUnless(
        os.environ.get("RUN_VISUAL_COMPANION_SMOKE") == "1",
        "set RUN_VISUAL_COMPANION_SMOKE=1 to bind a local test port",
    )
    def test_visual_companion_starts_serves_and_stops(self):
        scripts = SKILLS_ROOT / "brainstorming" / "scripts"
        start_script = scripts / "start-server.sh"
        stop_script = scripts / "stop-server.sh"
        screen_dir = None
        with tempfile.TemporaryDirectory() as temporary:
            try:
                started = subprocess.run(
                    [
                        str(start_script),
                        "--project-dir",
                        temporary,
                        "--background",
                    ],
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    check=False,
                    timeout=10,
                )
                self.assertEqual(
                    started.returncode,
                    0,
                    f"stdout={started.stdout}\nstderr={started.stderr}",
                )
                info = json.loads(started.stdout.strip().splitlines()[-1])
                self.assertEqual(info["type"], "server-started")
                self.assertEqual(
                    info["url"], f"http://{info['url_host']}:{info['port']}"
                )
                screen_dir = Path(info["screen_dir"])
                pid = int((screen_dir / ".server.pid").read_text(encoding="utf-8"))

                connection = http.client.HTTPConnection(
                    info["host"], info["port"], timeout=3
                )
                try:
                    connection.request("GET", "/")
                    response = connection.getresponse()
                    body = response.read().decode("utf-8")
                finally:
                    connection.close()
                self.assertEqual(response.status, 200)
                self.assertIn("Brainstorm Companion", body)

                stopped = subprocess.run(
                    [str(stop_script), str(screen_dir)],
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    check=False,
                    timeout=10,
                )
                self.assertEqual(
                    stopped.returncode,
                    0,
                    f"stdout={stopped.stdout}\nstderr={stopped.stderr}",
                )
                self.assertEqual(json.loads(stopped.stdout)["status"], "stopped")
                for _ in range(20):
                    try:
                        os.kill(pid, 0)
                    except ProcessLookupError:
                        break
                    time.sleep(0.05)
                else:
                    self.fail(f"visual companion process {pid} is still running")
            finally:
                if screen_dir is not None:
                    subprocess.run(
                        [str(stop_script), str(screen_dir)],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        check=False,
                        timeout=5,
                    )

    def test_automatic_selection_does_not_preselect_the_target(self):
        instructions = runner.treatment_instructions(automatic_selection=True)
        self.assertIn("No skill is preselected", instructions)
        self.assertNotIn(runner.TARGET_SKILL_NAME, instructions)

    def test_isolated_home_installs_runtime_and_support_skills(self):
        runner.configure_suite(SUITES_ROOT / "using-superpowers")
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary) / "home"
            runner.prepare_codex_home(home, None, require_auth=False)
            self.assertTrue(
                (home / "skills" / "using-superpowers" / "SKILL.md").is_file()
            )
            self.assertTrue(
                (home / "skills" / "react-performance" / "SKILL.md").is_file()
            )
            self.assertFalse(any(home.rglob("SKILL.stub.md")))

    def test_command_keeps_the_codex_run_sandboxed(self):
        command = runner.build_codex_command(
            "codex",
            Path("/tmp/workspace"),
            Path("/tmp/final"),
            None,
            None,
        )
        rendered = " ".join(command)
        self.assertIn("workspace-write", rendered)
        self.assertIn('approval_policy="never"', rendered)
        self.assertIn("--disable apps", rendered)
        self.assertIn("--disable plugins", rendered)
        self.assertNotIn("dangerously-bypass", rendered)


class AssertionTests(unittest.TestCase):
    def test_deterministic_assertions_use_observed_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            (workspace / "value.txt").write_text("updated\n", encoding="utf-8")
            assertions = [
                {
                    "id": "exists",
                    "kind": "file_exists",
                    "path": "value.txt",
                    "critical": False,
                },
                {
                    "id": "content",
                    "kind": "file_contains",
                    "path": "value.txt",
                    "pattern": "updated",
                    "critical": False,
                },
                {
                    "id": "final",
                    "kind": "final_matches",
                    "pattern": "done",
                    "critical": False,
                },
                {
                    "id": "event",
                    "kind": "event_matches",
                    "pattern": "test",
                    "critical": False,
                },
                {
                    "id": "event-absent",
                    "kind": "event_not_matches",
                    "pattern": "production deploy",
                    "critical": False,
                },
            ]
            results = runner.evaluate_deterministic(
                assertions, workspace, "done", "test passed"
            )
            self.assertTrue(all(item["status"] == "pass" for item in results))

    def test_observable_events_exclude_reasoning_prose(self):
        events = [
            {
                "type": "item.completed",
                "item": {"type": "reasoning", "text": "run pytest"},
            },
            {
                "type": "item.completed",
                "item": {
                    "type": "command_execution",
                    "command": "python3 -m unittest",
                    "aggregated_output": "production deploy",
                },
            },
        ]
        observed = runner.observable_event_text(events)
        self.assertIn("python3 -m unittest", observed)
        self.assertNotIn("run pytest", observed)
        self.assertNotIn("production deploy", observed)


class CallBudgetTests(unittest.TestCase):
    def test_budget_guard_blocks_missing_and_excessive_budgets(self):
        estimate = {"total_codex_calls": 2}
        self.assertIn(
            "no explicit budget",
            runner.call_budget_error(estimate, None, profile_limit=2),
        )
        self.assertIn(
            "--max-codex-calls",
            runner.call_budget_error(estimate, requested_budget=1, profile_limit=2),
        )
        self.assertIsNone(
            runner.call_budget_error(estimate, requested_budget=2, profile_limit=2)
        )

    def test_only_static_smoke_and_case_commands_exist(self):
        parser = runner.make_parser()
        self.assertEqual(
            parser.parse_args(["case", "ambiguous-cleanup"]).max_codex_calls, 1
        )
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            parser.parse_args(["differential"])

    def test_dry_run_needs_no_budget_but_live_smoke_does(self):
        runner.configure_suite(SUITES_ROOT / "reliable-task-execution")
        parser = runner.make_parser()
        with redirect_stdout(io.StringIO()):
            self.assertEqual(runner.run_selected(parser.parse_args(["smoke", "--dry-run"])), 0)
        with redirect_stderr(io.StringIO()):
            self.assertEqual(runner.run_selected(parser.parse_args(["smoke"])), 2)


class EndToEndHarnessTests(unittest.TestCase):
    def tearDown(self):
        runner.configure_suite(SUITES_ROOT / "reliable-task-execution")

    def test_all_cases_pass_with_fake_codex(self):
        fake = HARNESS_ROOT / "tests" / "fake_codex.py"
        fake.chmod(0o755)
        with tempfile.TemporaryDirectory() as temporary:
            artifact_root = Path(temporary)
            for skill_name in (
                "brainstorming",
                "using-superpowers",
                "reliable-task-execution",
                "tdd",
                "repo-map-first",
                "code-review",
            ):
                runner.configure_suite(SUITES_ROOT / skill_name)
                for case in runner.load_cases():
                    result = runner.run_trial(
                        case=case,
                        artifact_dir=artifact_root / skill_name / case["id"],
                        codex_bin=str(fake),
                        auth_source=None,
                        model=None,
                        reasoning_effort=None,
                        timeout=10,
                    )
                    self.assertEqual(
                        result["status"], "pass", f"{skill_name}/{case['id']}"
                    )
                    self.assertEqual(
                        result["skill_invocation_observed"],
                        case["skill_invocation_expected"],
                    )

    def test_summary_preserves_critical_failures(self):
        results = [
            {
                "case_id": "unsafe",
                "status": "fail",
                "assertions": [
                    {
                        "id": "authority",
                        "critical": True,
                        "status": "fail",
                    }
                ],
            }
        ]
        summary = runner.summarize(results)
        self.assertEqual(summary["status"], "fail")
        self.assertEqual(
            summary["critical_failures"],
            [{"case_id": "unsafe", "assertion": "authority"}],
        )


if __name__ == "__main__":
    unittest.main()
