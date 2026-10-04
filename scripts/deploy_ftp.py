#!/usr/bin/env python3
"""Mirror this repository to the hosting FTP account and verify the result.

The GitHub Actions deploy uploads with lftp and reported success even when
almost nothing reached the server. This script does the same job from a
machine you control, then downloads a few files back over HTTP and compares
them byte for byte, so a partial upload is impossible to miss.

    FTP_PASSWORD='...' python3 scripts/deploy_ftp.py --user younas@gopangitsolution.com
    FTP_PASSWORD='...' python3 scripts/deploy_ftp.py --user ... --dry-run
    FTP_PASSWORD='...' python3 scripts/deploy_ftp.py --user ... --delete

Mirrors the same set of files as .github/workflows/main.yml: everything git
tracks, minus .git*, .github/**, api/uploads/ and api/data/.
"""

from __future__ import annotations

import argparse
import fnmatch
import ftplib
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EXCLUDE_DIRS = ("api/uploads", "api/data")
EXCLUDE_GLOBS = (".git*", ".github/**")
EXCLUDE_NAMES = ("api/config.local.php",)

# Downloaded after the mirror to prove the site really serves the new bytes.
VERIFY = (
    ("home.html", "/"),
    ("assets/css/premium.css", "/assets/css/premium.css"),
    ("student-projects/index.html", "/student-projects/"),
)
SITE = "https://gopangitsolution.com"


def tracked_files() -> list[Path]:
    """Local files git tracks, minus what must never be deployed."""
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
    ).stdout.split(b"\0")

    files = []
    for raw in out:
        if not raw:
            continue
        rel = raw.decode()
        posix = rel.replace(os.sep, "/")
        if posix in EXCLUDE_NAMES:
            continue
        if any(posix.startswith(d + "/") for d in EXCLUDE_DIRS):
            continue
        if any(fnmatch.fnmatch(posix, g) for g in EXCLUDE_GLOBS):
            continue
        path = ROOT / rel
        if path.is_file():
            files.append(path)
    return sorted(files)


def ensure_dirs(ftp: ftplib.FTP, dirs: set[str]) -> None:
    """Walk the tree once so every file's directory exists on the server."""
    cwd = ftp.pwd()
    for parts in sorted(dirs):
        ftp.cwd("/")
        walked = []
        for part in parts.split("/"):
            if part in walked:
                continue
            walked.append(part)
            try:
                ftp.cwd(part)
            except ftplib.error_perm:
                ftp.mkd(part)
                ftp.cwd(part)
        ftp.cwd(cwd)


def mirror(ftp: ftplib.FTP, files: list[Path], dry_run: bool, delete: bool) -> int:
    dirs = {os.path.dirname(os.path.relpath(f, ROOT)).replace(os.sep, "/") for f in files}
    dirs.discard(".")
    if not dry_run:
        ensure_dirs(ftp, dirs)

    uploaded = skipped = 0
    for path in files:
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        if dry_run:
            uploaded += 1
            continue
        try:
            with open(path, "rb") as fh:
                ftp.storbinary(f"STOR {rel}", fh)
            uploaded += 1
        except ftplib.all_errors as exc:
            print(f"  FAILED {rel}: {exc}", file=sys.stderr)
            skipped += 1

    deleted = 0
    if delete and not dry_run:
        wanted = {os.path.relpath(f, ROOT).replace(os.sep, "/") for f in files}
        wanted |= {d for d in dirs if d} | {d + "/" for d in dirs if d}
        for remote in list(remote_files(ftp, "/")):
            if remote not in wanted and not any(
                remote.startswith(d + "/") for d in EXCLUDE_DIRS
            ):
                try:
                    ftp.delete(remote)
                    deleted += 1
                except ftplib.all_errors as exc:
                    print(f"  could not delete {remote}: {exc}", file=sys.stderr)

    print(f"uploaded={uploaded} failed={skipped} deleted={deleted}")
    return skipped


def remote_files(ftp: ftplib.FTP, path: str) -> list[str]:
    """Every file under path, as absolute FTP paths."""
    found: list[str] = []
    cwd = ftp.pwd()
    stack = ["/"]
    while stack:
        here = stack.pop()
        ftp.cwd(here)
        for name, facts in ftp.mlsd(here, facts=["type"]):
            full = (here.rstrip("/") + "/" + name)
            if facts["type"] in ("dir", "cdir", "pdir"):
                stack.append(full)
            elif facts["type"] == "file":
                found.append(full.lstrip("/"))
    ftp.cwd(cwd)
    return found


def verify(stamp: str) -> list[str]:
    """Compare the live site against the repo. Returns a list of problems."""
    problems = []
    for rel, url in VERIFY:
        local = ROOT / rel
        try:
            with urllib.request.urlopen(f"{SITE}{url}?cb={stamp}", timeout=60) as resp:
                live = resp.read()
        except Exception as exc:  # noqa: BLE001 - report anything that goes wrong
            problems.append(f"{rel}: could not download {url} ({exc})")
            continue
        if live == local.read_bytes():
            print(f"  OK   {url} matches {rel}")
        else:
            problems.append(
                f"{url}: live is {len(live)} bytes, repo is {local.stat().st_size} bytes"
            )

    try:
        with urllib.request.urlopen(f"{SITE}/portfolio", timeout=60) as resp:
            body = resp.read().decode("utf-8", "replace")
        if "Our Projects" in body:
            print("  OK   /portfolio serves the portfolio page")
        else:
            problems.append("/portfolio does not serve the portfolio page")
    except Exception as exc:  # noqa: BLE001
        problems.append(f"/portfolio: {exc}")

    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="ftp.gopangitsolution.com")
    ap.add_argument("--user", default=os.environ.get("FTP_USERNAME", "younas@gopangitsolution.com"))
    ap.add_argument("--password", default=os.environ.get("FTP_PASSWORD", ""))
    ap.add_argument("--dry-run", action="store_true", help="list files, do not connect")
    ap.add_argument("--delete", action="store_true", help="also remove remote files that are gone locally")
    ap.add_argument("--skip-verify", action="store_true")
    args = ap.parse_args()

    files = tracked_files()
    total = sum(f.stat().st_size for f in files)
    print(f"{len(files)} files, {total / 1e6:.1f} MB to mirror")

    if args.dry_run:
        for f in files[:5]:
            print("  ", os.path.relpath(f, ROOT))
        print("   ...")
        return 0

    if not args.password:
        print("error: set FTP_PASSWORD or pass --password", file=sys.stderr)
        return 2

    try:
        ftp = ftplib.FTP(args.host, timeout=60)
        print(ftp.connect())
        print(ftp.login(args.user, args.password))
        ftp.set_pasv(True)
    except ftplib.all_errors as exc:
        print(f"error: cannot log in to {args.host} as {args.user}: {exc}", file=sys.stderr)
        return 3

    try:
        ftp.cwd("/")
        failed = mirror(ftp, files, args.dry_run, args.delete)
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            pass

    if failed:
        print(f"error: {failed} file(s) failed to upload", file=sys.stderr)

    if args.skip_verify:
        return 1 if failed else 0

    print("verifying the live site...")
    problems = verify(str(os.getpid()))
    for p in problems:
        print(f"  FAIL {p}", file=sys.stderr)
    if problems:
        print("deploy did NOT fully reach the server", file=sys.stderr)
        return 1
    print("deploy verified")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
