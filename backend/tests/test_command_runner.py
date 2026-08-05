"""Tests for the shared subprocess result handling used by AppCommands/IOSAppCommands.

Ensures the consolidated try/run/timeout/error-string shape behaves the same
way regardless of which platform command class calls it.
"""

import subprocess

from commands.command_runner import run_and_report


def _proc(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


class TestRunAndReport:
    def test_success_defaults_to_stripped_stdout(self):
        ok, msg = run_and_report(lambda: _proc(returncode=0, stdout="  ok  \n"), "Install")
        assert ok is True
        assert msg == "ok"

    def test_success_with_literal_message(self):
        ok, msg = run_and_report(lambda: _proc(returncode=0), "Launch", success_message="Launched app: foo")
        assert ok is True
        assert msg == "Launched app: foo"

    def test_success_with_callable_message(self):
        ok, msg = run_and_report(
            lambda: _proc(returncode=0, stdout="a\nb"),
            "List",
            success_message=lambda result: result.stdout.replace("\n", ","),
        )
        assert ok is True
        assert msg == "a,b"

    def test_failure_prefers_stderr(self):
        ok, msg = run_and_report(lambda: _proc(returncode=1, stdout="out", stderr="boom"), "Install")
        assert ok is False
        assert msg == "boom"

    def test_failure_falls_back_to_stdout(self):
        ok, msg = run_and_report(lambda: _proc(returncode=1, stdout="out", stderr=""), "Install")
        assert ok is False
        assert msg == "out"

    def test_timeout_reports_action_name(self):
        def raise_timeout():
            raise subprocess.TimeoutExpired(cmd="idb", timeout=10)

        ok, msg = run_and_report(raise_timeout, "Uninstall")
        assert ok is False
        assert msg == "Uninstall command timed out"

    def test_other_exception_reports_action_name(self):
        def raise_error():
            raise RuntimeError("no device")

        ok, msg = run_and_report(raise_error, "Launch")
        assert ok is False
        assert msg == "Launch failed: no device"
