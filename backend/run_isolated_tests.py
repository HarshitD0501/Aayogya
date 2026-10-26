"""
Batch 8 Isolated Test Runner:
Executes each test suite in an independent Python subprocess to prevent global environment
mutation and singleton cache pollution between test suites (ERR-031, Batch 8).
"""

import os
import sys
import time
import subprocess
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
TESTS_DIR = BACKEND_DIR / "tests"


def discover_test_files():
    """Discover all test_*.py files in backend/tests, sorted alphabetically."""
    test_files = sorted(TESTS_DIR.glob("test_*.py"))
    return test_files


import shutil

PYTEST_BIN = shutil.which("pytest") or "pytest"


def run_test_file_isolated(test_path: Path):
    """Run a single test file in an isolated Python process."""
    cmd = [
        PYTEST_BIN,
        str(test_path),
        "-v",
        "-o", "filterwarnings=ignore::DeprecationWarning",
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(PROJECT_ROOT)

    start_time = time.perf_counter()
    proc = subprocess.run(
        cmd,
        cwd=str(PROJECT_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    duration = time.perf_counter() - start_time
    return proc.returncode == 0, duration, proc.stdout


def main():
    test_files = discover_test_files()
    if not test_files:
        print("[ERROR] No test files found in backend/tests")
        sys.exit(1)

    print("=" * 70)
    print("AAYOGYA ISOLATED TEST RUNNER (BATCH 8 CI)")
    print(f"Found {len(test_files)} test suites in {TESTS_DIR}")
    print("=" * 70)

    results = []
    total_start = time.perf_counter()

    for idx, test_file in enumerate(test_files, 1):
        rel_name = test_file.name
        print(f"[{idx:02d}/{len(test_files):02d}] Running {rel_name}...", end=" ", flush=True)

        passed, duration, output = run_test_file_isolated(test_file)
        if passed:
            print(f"PASS ({duration:.2f}s)")
            results.append((rel_name, True, duration, ""))
        else:
            print(f"FAIL ({duration:.2f}s)")
            results.append((rel_name, False, duration, output))

    total_duration = time.perf_counter() - total_start

    print("\n" + "=" * 70)
    print("TEST SUITE EXECUTION SUMMARY")
    print("=" * 70)

    passed_count = sum(1 for _, ok, _, _ in results if ok)
    failed_count = sum(1 for _, ok, _, _ in results if not ok)

    for name, ok, dur, _ in results:
        status_str = "[PASS]" if ok else "[FAIL]"
        print(f"  {status_str} {name:<35} {dur:>6.2f}s")

    print("-" * 70)
    print(f"Total: {len(results)} suites | Passed: {passed_count} | Failed: {failed_count} | Elapsed: {total_duration:.2f}s")
    print("=" * 70)

    if failed_count > 0:
        print("\nFAILURE DETAILS:")
        for name, ok, _, output in results:
            if not ok:
                print(f"\n--- {name} ---")
                print(output)
        sys.exit(1)
    else:
        print("\nAll isolated test suites completed successfully.")
        sys.exit(0)


if __name__ == "__main__":
    main()
