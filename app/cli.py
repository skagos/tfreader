from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.security_analyzer import SecurityAnalyzer
from app.terraform_parser import parse_tf_content, parse_tf_directory, parse_tf_from_zip

_SEVERITY_RANK = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}


def _parse_resources(target: Path):
    if target.is_dir():
        resources = parse_tf_directory(target)
        return resources, target

    if target.is_file():
        if target.suffix == ".tf":
            content = target.read_text(encoding="utf-8")
            resources = parse_tf_content(content, str(target))
            return resources, target.parent
        if target.suffix == ".zip":
            payload = target.read_bytes()
            resources = parse_tf_from_zip(payload)
            return resources, None

    raise ValueError("Target must be a Terraform directory, .tf file, or .zip archive.")


def _should_fail(findings: list[dict], threshold: str) -> bool:
    if threshold == "none":
        return False
    threshold_rank = _SEVERITY_RANK[threshold]
    return any(_SEVERITY_RANK.get(str(item.get("severity", "low")), 1) >= threshold_rank for item in findings)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tfreader",
        description="Terraform resource and security scanner CLI",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan = subparsers.add_parser("scan", help="Scan a Terraform path and evaluate findings.")
    scan.add_argument(
        "context_or_path",
        help=(
            "Optional context label or Terraform path. "
            "Examples: 'scan ./infra' or 'scan putana ./infra'."
        ),
    )
    scan.add_argument(
        "path",
        nargs="?",
        help="Terraform path when a context label is provided first.",
    )
    scan.add_argument(
        "--fail-on",
        choices=("none", "low", "medium", "high", "critical"),
        default="none",
        help="Fail with exit code 1 if any finding meets/exceeds this severity.",
    )
    scan.add_argument("--out-json", help="Write full security analysis to JSON file.")
    scan.add_argument("--out-md", help="Write security report markdown file.")
    return parser


def _run_scan(args: argparse.Namespace) -> int:
    # Backward compatible forms:
    # 1) tfreader scan ./infra
    # 2) tfreader scan putana ./infra
    target_arg = args.path if args.path else args.context_or_path
    target = Path(target_arg).expanduser().resolve()
    if not target.exists():
        print(f"[ERROR] Path not found: {target}", file=sys.stderr)
        return 2

    try:
        resources, scan_dir = _parse_resources(target)
        security = SecurityAnalyzer().analyze(resources, scan_dir=scan_dir)
    except ValueError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 2
    except Exception as exc: 
        print(f"[ERROR] Runtime failure: {exc}", file=sys.stderr)
        return 3

    findings_payload = [item.model_dump() for item in security.findings]
    print(security.summary)
    print(
        "Severity counts: "
        + ", ".join(
            f"{sev}={security.score.by_severity.get(sev, 0)}"
            for sev in ("critical", "high", "medium", "low")
        )
    )

    if args.out_json:
        json_path = Path(args.out_json).expanduser().resolve()
        json_path.parent.mkdir(parents=True, exist_ok=True)
        payload = security.model_dump(mode="json")
        json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"Wrote JSON report: {json_path}")

    if args.out_md:
        md_path = Path(args.out_md).expanduser().resolve()
        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(security.report_markdown, encoding="utf-8")
        print(f"Wrote Markdown report: {md_path}")

    if _should_fail(findings_payload, args.fail_on):
        print(f"Policy gate failed: findings at or above '{args.fail_on}' were detected.")
        return 1

    return 0


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if args.command == "scan":
        return _run_scan(args)
    parser.print_help()
    return 2


def cli_entrypoint() -> None:
    raise SystemExit(main())


if __name__ == "__main__":
    cli_entrypoint()
