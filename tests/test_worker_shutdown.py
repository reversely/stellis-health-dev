"""Stopping the server stops the speech worker and the tools it started (#206)."""

from __future__ import annotations

import os
import subprocess
import sys
import time
import unittest

from stellis import processing


class WorkerShutdownTest(unittest.TestCase):
    def test_stop_worker_ends_the_whole_process_group(self) -> None:
        # A stand-in worker that starts a long-running child, like whisper-cli.
        script = "import subprocess, time; subprocess.Popen(['sleep', '60']); time.sleep(60)"
        child = subprocess.Popen([sys.executable, "-c", script], start_new_session=True)
        time.sleep(0.5)
        processing._CHILD = child
        try:
            processing.stop_worker()
            self.assertIsNotNone(child.poll())
            leftovers = subprocess.run(["pgrep", "-g", str(child.pid)], capture_output=True, text=True).stdout.split()
            self.assertEqual(leftovers, [])
        finally:
            processing._CHILD = None
            processing._STOPPING.clear()
            try:
                os.killpg(child.pid, 9)
            except ProcessLookupError:
                pass

    def test_worker_exits_when_its_parent_disappears(self) -> None:
        # The parent shell exits immediately, orphaning the worker it launched.
        code = ("import os, signal, sys, threading, time\n"
                "from stellis import worker\n"
                "sys.argv = ['worker', '00000000-0000-0000-0000-000000000000']\n"
                "worker.processing.run_job = lambda job_id: time.sleep(60)\n"
                "worker.main()\n")
        # The launcher starts the worker in its own group, as the server does, then exits.
        launch = ("import subprocess, sys, time\n"
                  "child = subprocess.Popen([sys.executable, '-c', sys.argv[1]], start_new_session=True,\n"
                  "                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)\n"
                  "print(child.pid, flush=True); time.sleep(1.5)\n")
        launcher = subprocess.run([sys.executable, "-c", launch, code], capture_output=True, text=True, timeout=30)
        pid = int(launcher.stdout.strip())
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.2)
        else:
            os.kill(pid, 9)
            self.fail("orphaned worker kept running")


if __name__ == "__main__":
    unittest.main()
