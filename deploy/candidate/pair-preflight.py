#!/usr/bin/env python3
"""Fingerprint quiescent Studio release files. Pins must come from trusted, reviewed builds or backups."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

from artifact_identity import encoded, file_hash, stamp, ui_tree_hash


def capture(api, ui):
    api_info = api.lstat()
    if not api_info.st_size:
        raise ValueError("expected a nonempty API file")
    api_hash = file_hash(api)
    ui_hash = ui_tree_hash(ui)
    if stamp(api.lstat()) != stamp(api_info):
        raise ValueError("API artifact changed during UI inspection")
    digest = hashlib.sha256(encoded(["studio-pair-v1", api_hash, ui_hash])).hexdigest()
    return {"pair_sha256": digest, "api_sha256": api_hash, "ui_tree_sha256": ui_hash}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    record = sub.add_parser("capture", help="read one known-good pair on disk")
    record.add_argument("--api", required=True, type=Path)
    record.add_argument("--ui", required=True, type=Path, help="extracted .next directory")
    verify = sub.add_parser("verify", help="compare retained/staged copies with independent pair pins")
    for side in ("previous", "candidate"):
        verify.add_argument(f"--{side}-pin", required=True, help="independently reviewed pair SHA-256")
        for part in ("api", "ui"):
            verify.add_argument(f"--{side}-{part}", required=True, type=Path)
    verify.add_argument("--inspect", choices=["previous", "candidate"])
    verify.add_argument("--inspect-api", type=Path)
    verify.add_argument("--inspect-ui", type=Path)
    args = parser.parse_args()
    if args.action == "capture":
        result = capture(args.api, args.ui)
    else:
        flags = (args.inspect, args.inspect_api, args.inspect_ui)
        if any(flags) and not all(flags):
            parser.error("--inspect, --inspect-api and --inspect-ui must be given together")
        pins = {"previous": args.previous_pin, "candidate": args.candidate_pin}
        if any(not re.fullmatch("[0-9a-f]{64}", pin) for pin in pins.values()):
            parser.error("pair pins must be lowercase SHA-256 hex")
        if pins["previous"] == pins["candidate"]:
            parser.error("previous and candidate pins are identical")
        result = {}
        for side, pin in pins.items():
            observed = capture(getattr(args, side + "_api"), getattr(args, side + "_ui"))
            if observed["pair_sha256"] != pin:
                raise ValueError(f"{side} artifact pair differs from its reviewed pin")
            result[side] = observed
        if args.inspect:
            observed = capture(args.inspect_api, args.inspect_ui)
            if observed != result[args.inspect]:
                raise ValueError(f"inspected artifacts do not match the {args.inspect} pair")
            result["inspected_pair"] = args.inspect
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        sys.exit(f"pair preflight failed: {error}")
