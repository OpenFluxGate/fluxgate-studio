# Deployment verification

Run the workflow, staging, pair-identity, activation and recovery tests with Python 3 and PyYAML. The local suite uses temporary files and controlled systemd/HTTP substitutes.

```sh
python3 -B -m unittest discover -s tests/deployment -p 'test_*.py' -v
```

Exercise GNU filesystem tools in a read-only, network-isolated Linux container.

```sh
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 64 --memory 128m --cpus 1 \
  --tmpfs /tmp:rw,exec,nosuid,size=32m -v "$PWD:/src:ro" \
  --entrypoint /bin/bash python:3.12-slim /src/tests/deployment/linux-filesystem-smoke.sh
```

The [VM rehearsal](vm/README.md) uses actual systemd services, distinct Java and Node payloads, kernel boot IDs and host-driven power cuts on a disposable guest. The [MongoDB rehearsal](test_audit_retention.sh) checks the two audit collections and restores synthetic data and indexes into a fresh database. Read the [operator procedure](../../deploy/candidate/README.en.md) for application version compatibility, target checks and cutover order.
