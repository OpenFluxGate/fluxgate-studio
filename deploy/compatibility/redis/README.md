# Disposable Redis rule-reapplication regression probe

Run `JAVA_HOME=/path/to/jdk21 bash run-redis-probe.sh` from this directory. Requires Docker, Git, Python 3, network access to the official GitHub/Maven repositories, and JDK 21. The runner clones core source pinned to `39a1789acfc481e416e7363dc6e9dd3817b147b5` (0.5.0) into a new temporary directory and uses a separate Maven cache. It never edits an existing checkout.

The runner creates a fresh official `redis:7` container with persistence disabled, no host data volume and a random port bound only to 127.0.0.1. It inserts a random UUID fixture token. The test rejects non-loopback URI strings, missing explicit disposable opt-in, or a mismatched fixture token before performing bucket writes/resets. It deliberately tests a full bucket reset, so never manually point it at an existing Redis. EXIT cleanup removes only the container created by that invocation. Source/build logs remain in the temporary workspace printed on completion.

## What is actually tested

A 3-token/1-hour rule is exhausted in the actual RedisRateLimiter. Reconstructing the identical rule and rule set preserves the exhausted bucket. A targeted RuleReloadEvent dispatched to the actual RedisBucketResetHandler resets that rule set only; a full event resets the other rule set too.

The handler is production source from `fluxgate-spring-boot3-starter/src/main/java/org/fluxgate/spring/reload/handler/RedisBucketResetHandler.java`. The runner copies it unchanged to the identical package under the Redis module's `src/test/java`, then copies RuleReapplyProbeTest.java into that module's test sources. The handler has no Spring runtime dependencies. This validates its real logic without starting a Spring ApplicationContext. It is NOT the end-to-end Studio HTTP → signed Pub/Sub → SDK listener path and does not establish the deployed application's listener configuration.

## Recorded evidence

Mac ARM64, Zulu JDK 21.0.8; Redis image resolved to 7.4.11, image ID sha256:4fa24486b8bcca8eec45ee0eb166edc674795e53a2b53d1a9ef263eecebaac85. The runner records the actual image and version for each run because the redis:7 tag may change.

The initial isolated proof plus existing RedisRateLimiterIntegrationTest (6), RedisRateLimiterCrossRuleIntegrationTest (12), and RedisTokenBucketStoreIntegrationTest (8) passed 27 tests with zero failures/errors/skips. The standalone runner executes just the new regression probe. The independent fresh-clone run passed one test with zero failures, errors, or skips; rerun the script to generate a new result.log.

No production data, AWS resource, operating service, existing container, or remote branch was modified. This is a synthetic local compatibility test, not evidence that production datasets or configurations are upgrade-safe.
