#!/usr/bin/env python3
"""Record and check disk, process, cgroup and HTTP identity in the disposable VM."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.request


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


phase, expected = sys.argv[1:]
result = {"phase": phase, "expected": expected, "boot_id":
          Path("/proc/sys/kernel/random/boot_id").read_text().strip(), "services": {}}
for component, unit, port in (("api", "fluxgate-admin-api", 8081), ("ui", "fluxgate-studio", 3000)):
    root = Path("/srv/fluxgate-rehearsal") / component
    live = root / ("fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar" if component == "api" else ".next")
    marker = root / ".activation-pending"
    data = {"live_exists": live.exists(), "journal": json.loads(marker.read_text()) if marker.exists() else None}
    if live.exists():
        if component == "api":
            data["on_disk"] = sha(live)
        else:
            data["on_disk"] = {str(f.relative_to(live)): sha(f) for f in sorted(live.rglob("*")) if f.is_file()}
    pid = int(run("systemctl", "show", unit, "-p", "MainPID", "--value"))
    data["pid"] = pid
    if pid:
        proc = Path("/proc") / str(pid)
        data["cmdline"] = proc.joinpath("cmdline").read_bytes().decode().strip("\0").split("\0")
        data["cgroup"] = proc.joinpath("cgroup").read_text().strip()
        path = "/fixture-identity"
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as response:
            data["served_identity"] = response.read().decode().strip()
        health_path = "/actuator/health" if component == "api" else "/login"
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{health_path}", timeout=5) as response:
            data["health_status"] = response.status
            data["health_path"] = health_path
            body = response.read().decode()
            assert response.status == 200
            if component == "api":
                assert json.loads(body)["status"] == "UP"
            else:
                assert "<h1>FluxGate Studio</h1>" in body
        assert unit + ".service" in data["cgroup"]
    result["services"][component] = data
    if expected in ("old", "new"):
        assert data["journal"] is None and data["served_identity"] == expected
        assert run("systemctl", "is-active", unit) == "active"
        if component == "api":
            assert data["on_disk"] == sha(root / (expected + ".jar"))
            assert data["cmdline"] == ["/usr/bin/java", "-jar", str(live)]
        else:
            ref = Path("/opt/fluxgate-vm/server.js")
            digest = hashlib.sha256((expected + "\n").encode()).hexdigest()
            assert data["cmdline"] == ["/usr/bin/node", str(live / "standalone/server.js")]
            assert data["on_disk"] == {"standalone/server.js": sha(ref),
                                      "standalone/.next/BUILD_ID": digest,
                                      "standalone/.next/static/asset.js": digest}
    else:
        assert data["journal"] and data["journal"]["component"] == component
        if expected == "prepared":
            assert data["served_identity"] == "old"
        elif expected == "between-renames":
            assert pid == 0 and not live.exists()
        elif expected == "switched":
            assert not pid and live.exists()
        elif expected == "healthy-uncommitted":
            assert data["served_identity"] == "new"
print(json.dumps(result, sort_keys=True))
