#!/usr/bin/env python3
"""Local-only live Studio publication proof; requires an existing isolated fixture.

Required environment: FLUXGATE_MONGO_URI, FLUXGATE_AUTHZ_URLS (two comma-separated
HTTPS port forwards), FLUXGATE_TLS_DIR, FLUXGATE_PROOF_API_KEY. Optional:
FLUXGATE_STUDIO_JAR, JAVA_HOME, FLUXGATE_PROOF_EVIDENCE_DIR, FLUXGATE_RULE_SET_ID.
Starts only its own Studio/JWKS processes, disables reload notification, preserves
the current rules/counter epoch, and restores the initial ACL in a finally block.
No credentials, JWTs, private keys, or request headers are printed or recorded.
"""

import base64
import copy
import http.client
import http.server
import json
import os
import pathlib
import socket
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


class ProofFailure(RuntimeError):
    """Contains only a fixed check label or HTTP status, never transport details."""


def require(condition, message):
    if not condition:
        raise ProofFailure(message)


def b64(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def required(name):
    value = os.environ.get(name)
    require(bool(value), "Missing required environment: " + name)
    return value


def free_port(port):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", port))


class ForwardedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, port, context, server_name):
        super().__init__(host, port, timeout=8, context=context)
        self.server_name = server_name

    def connect(self):
        raw = socket.create_connection((self.host, self.port), self.timeout)
        self.sock = self._context.wrap_socket(raw, server_hostname=self.server_name)


def main():
    root = pathlib.Path(__file__).resolve().parents[1]
    jar = pathlib.Path(os.environ.get("FLUXGATE_STUDIO_JAR", str(root / "fluxgate-studio-admin-api/target/fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar")))
    require(jar.is_file(), "Build the fresh Studio executable jar first")
    mongo = required("FLUXGATE_MONGO_URI")
    require(urllib.parse.urlsplit(mongo).hostname in ("127.0.0.1", "localhost"), "Mongo proof must use a local port forward")
    urls = [urllib.parse.urlsplit(value.strip()) for value in required("FLUXGATE_AUTHZ_URLS").split(",")]
    require(len(urls) == 2 and all(url.scheme == "https" and url.hostname in ("127.0.0.1", "localhost") for url in urls), "Provide two local HTTPS authz Pod port forwards")
    require(len({url.port or 443 for url in urls}) == 2, "Authz Pod port forwards must use distinct local ports")
    tls_dir = pathlib.Path(required("FLUXGATE_TLS_DIR"))
    api_key = required("FLUXGATE_PROOF_API_KEY")
    server_name = os.environ.get("FLUXGATE_TLS_SERVER_NAME", "fluxgate-authz.fluxgate-enterprise.svc.cluster.local")
    rule_set = os.environ.get("FLUXGATE_RULE_SET_ID", "default-limits")
    tls = ssl.create_default_context(cafile=str(tls_dir / "server-ca.crt"))
    tls.load_cert_chain(str(tls_dir / "client.crt"), str(tls_dir / "client.key"))
    for port in (8099, 18199):
        free_port(port)
    evidence = []
    base = "http://127.0.0.1:8099/api/rule-sets/" + urllib.parse.quote(rule_set, safe="")
    issuer = "http://127.0.0.1:18199/local-proof"
    audience = "fluxgate-studio-admin-api"
    actor = "local-proof-admin-" + uuid.uuid4().hex[:12]
    java = str(pathlib.Path(os.environ["JAVA_HOME"]) / "bin/java") if os.environ.get("JAVA_HOME") else "java"
    with tempfile.TemporaryDirectory(prefix="fluxgate-studio-live-") as directory:
        private = pathlib.Path(directory) / "signing.key"
        subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(private)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        private.chmod(0o600)
        modulus = subprocess.run(["openssl", "rsa", "-in", str(private), "-noout", "-modulus"], check=True, capture_output=True).stdout.decode().strip().split("=", 1)[1]
        n = bytes.fromhex(modulus)
        jwks = {"keys": [{"kty": "RSA", "kid": "local-proof", "use": "sig", "alg": "RS256", "n": b64(n), "e": b64((65537).to_bytes(3, "big"))}]}

        class JWKS(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path != "/jwks":
                    self.send_error(404)
                    return
                data = json.dumps(jwks).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 18199), JWKS)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        def token(role="admin", aud=audience, unsigned=False):
            now = int(time.time())
            head = b64(json.dumps({"alg": "none" if unsigned else "RS256", "kid": "local-proof", "typ": "JWT"}, separators=(",", ":")).encode())
            body = b64(json.dumps({"iss": issuer, "aud": aud, "sub": actor if role == "admin" else "local-proof-reader", "iat": now, "exp": now + 120, "realm_access": {"roles": [role]}}, separators=(",", ":")).encode())
            signing = (head + "." + body).encode()
            signature = b"" if unsigned else subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(private)], input=signing, check=True, capture_output=True).stdout
            return signing.decode() + "." + b64(signature)

        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        def api(path, payload=None, role="admin", aud=audience, unsigned=False, anonymous=False):
            headers = {"Content-Type": "application/json"}
            if not anonymous:
                headers["Authorization"] = "Bearer " + token(role, aud, unsigned)
            request = urllib.request.Request(base + path, data=None if payload is None else json.dumps(payload).encode(), headers=headers)
            try:
                response = opener.open(request, timeout=10)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None

        def expect(label, status, actual):
            require(actual[0] == status, label + ": unexpected HTTP status " + str(actual[0]))
            evidence.append({"check": label, "status": status})
            return actual[1]

        def active():
            return expect("read-active", 200, api("/active"))

        def payload(snapshot, acl):
            return {"expectedRevision": snapshot["revision"], "operationId": str(uuid.uuid4()), "rules": copy.deepcopy(snapshot["rules"]), "accessControl": copy.deepcopy(acl), "resetCounters": False}

        def authz(expected):
            for index, url in enumerate(urls):
                connection = ForwardedHTTPS(url.hostname, url.port or 443, tls, server_name)
                try:
                    connection.request("GET", url.path or "/authz/api/items", headers={"x-api-key": api_key})
                    response = connection.getresponse()
                    response.read()
                    require(response.status in expected, "authz Pod " + str(index + 1) + ": unexpected HTTP status " + str(response.status))
                    evidence.append({"check": "authz-pod-" + str(index + 1), "status": response.status})
                finally:
                    connection.close()

        env = os.environ.copy()
        env.update({"SERVER_ADDRESS": "127.0.0.1", "SERVER_PORT": "8099", "KEYCLOAK_ISSUER_URI": issuer, "KEYCLOAK_JWK_SET_URI": "http://127.0.0.1:18199/jwks", "STUDIO_JWT_VALIDATE_AUDIENCE": "true", "STUDIO_JWT_AUDIENCE": audience, "SPRING_AUTOCONFIGURE_EXCLUDE": "org.fluxgate.control.autoconfigure.ControlSupportAutoConfiguration", "FLUXGATE_MONGO_URI": mongo, "LOGGING_LEVEL_ORG_FLUXGATE": "INFO"})
        initial = None
        mutated = False
        with (pathlib.Path(directory) / "studio.log").open("wb") as log:
            process = subprocess.Popen([java, "-jar", str(jar)], env=env, stdout=log, stderr=log)
            try:
                for attempt in range(90):
                    require(process.poll() is None, "Studio process exited before readiness")
                    try:
                        status, snapshot = api("/active")
                        if status == 200:
                            initial = snapshot
                            break
                    except (OSError, urllib.error.URLError):
                        pass
                    time.sleep(1)
                require(initial is not None, "Studio active policy did not become ready")
                epoch = initial["counterEpoch"]
                expect("anonymous-rejected", 401, api("/active", anonymous=True))
                expect("unsigned-rejected", 401, api("/active", unsigned=True))
                expect("wrong-audience-rejected", 401, api("/active", aud="unrelated-api"))
                deny = copy.deepcopy(initial["accessControl"])
                deny["deniedIps"] = ["0.0.0.0/0", "::/0"]
                publication = payload(initial, deny)
                expect("reader-cannot-publish", 403, api("/publish", publication, role="user"))
                spoof = dict(publication, actor="caller-supplied-actor")
                expect("actor-spoof-rejected", 400, api("/publish", spoof))
                mutated = True
                denied = expect("admin-publishes-complete-generation", 200, api("/publish", publication))
                require(denied["actor"] == actor and denied["counterEpoch"] == epoch, "Publication actor or counter epoch mismatch")
                authz({403})
                replay = expect("operation-replay", 200, api("/publish", publication))
                require(replay["snapshotId"] == denied["snapshotId"] and replay["revision"] == denied["revision"], "Replay changed the active pointer")
                expect("stale-cas-rejected", 409, api("/publish", payload(initial, initial["accessControl"])))
                invalid = payload(denied, {"deniedIps": ["definitely-not-a-cidr"]})
                expect("invalid-acl-rejected", 400, api("/publish", invalid))
                unchanged = active()
                require(unchanged["snapshotId"] == denied["snapshotId"], "Rejected publication changed active pointer")
                rollback = {"expectedRevision": denied["revision"], "targetRevision": initial["revision"], "operationId": str(uuid.uuid4()), "resetCounters": False}
                restored = expect("rollback-publishes-new-revision", 200, api("/rollback", rollback))
                require(restored["revision"] == denied["revision"] + 1 and restored["counterEpoch"] == epoch and restored["accessControl"] == initial["accessControl"], "Rollback revision, epoch or ACL mismatch")
            finally:
                try:
                    if mutated and initial is not None:
                        restored = expect("restore-initial-acl", 200, api("/publish", payload(active(), initial["accessControl"])))
                        require(restored["counterEpoch"] == initial["counterEpoch"], "Restoration changed counter epoch")
                        authz({200, 429})
                finally:
                    process.terminate()
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                    server.shutdown()
                    server.server_close()
        result = {"result": "pass", "notification": "disabled", "checks": evidence}
        destination = os.environ.get("FLUXGATE_PROOF_EVIDENCE_DIR")
        if destination:
            path = pathlib.Path(destination)
            path.mkdir(parents=True, exist_ok=True)
            (path / "studio-policy-live.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except ProofFailure as error:
        print("Studio live policy proof failed: " + str(error), flush=True)
        raise SystemExit(1)
    except Exception as error:
        # Never print exception objects: transport exceptions can contain sensitive URIs.
        print("Studio live policy proof failed (" + type(error).__name__ + "); no success evidence emitted.", flush=True)
        raise SystemExit(1)
