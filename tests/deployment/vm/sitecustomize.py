"""Test-only pause points, loaded exclusively by the rehearsal activation process."""
import atexit
import os
from pathlib import Path
import signal
import sys

if (len(sys.argv) >= 4 and Path(sys.argv[0]).name == "transaction.py"
        and os.environ.get("FLUXGATE_CUT") and sys.argv[2] in ("api", "ui")):
    action, component, root = sys.argv[1:4]
    window = os.environ["FLUXGATE_CUT"]

    def pause():
        Path(f"/tmp/fluxgate-paused-{component}").write_text(f"{window} {os.getpid()}\n")
        os.kill(os.getpid(), signal.SIGSTOP)

    if window == "prepared" and action == "begin":
        atexit.register(pause)
    elif window == "between-renames" and action == "switch":
        original_rename = os.rename

        def interrupt_rename(src, dst, *args, **kwargs):
            if Path(src).name in ("next", "next.jar"):
                pause()
            return original_rename(src, dst, *args, **kwargs)

        os.rename = interrupt_rename
    elif window == "switched" and action == "switch":
        atexit.register(pause)
    elif window == "healthy-uncommitted" and action == "commit":
        pause()
