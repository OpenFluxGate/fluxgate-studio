# syntax=docker/dockerfile:1

# ---------- build ----------
# The bundled wrapper treats MAVEN_CONFIG as CLI flags; the Maven image sets it to a directory.
FROM maven:3.9-eclipse-temurin-21 AS build
ENV MAVEN_CONFIG=""
WORKDIR /core

# The paired policy APIs are not published yet. A named context supplies the pinned core source
# (Compose uses Git by default; FLUXGATE_CORE_SOURCE selects a matching local checkout).
# Copy only reactor descriptors and required production source, never checkout state or test output.
COPY --from=fluxgate_core /mvnw ./
COPY --from=fluxgate_core /.mvn/ ./.mvn/
COPY --from=fluxgate_core /pom.xml ./pom.xml
COPY --from=fluxgate_core /fluxgate-benchmarks/pom.xml ./fluxgate-benchmarks/pom.xml
COPY --from=fluxgate_core /fluxgate-control-support/pom.xml ./fluxgate-control-support/pom.xml
COPY --from=fluxgate_core /fluxgate-core/pom.xml ./fluxgate-core/pom.xml
COPY --from=fluxgate_core /fluxgate-envoy-extauth/pom.xml ./fluxgate-envoy-extauth/pom.xml
COPY --from=fluxgate_core /fluxgate-mongo-adapter/pom.xml ./fluxgate-mongo-adapter/pom.xml
COPY --from=fluxgate_core /fluxgate-redis-ratelimiter/pom.xml ./fluxgate-redis-ratelimiter/pom.xml
COPY --from=fluxgate_core /fluxgate-samples/fluxgate-sample-api/pom.xml ./fluxgate-samples/fluxgate-sample-api/pom.xml
COPY --from=fluxgate_core /fluxgate-samples/fluxgate-sample-filter/pom.xml ./fluxgate-samples/fluxgate-sample-filter/pom.xml
COPY --from=fluxgate_core /fluxgate-samples/fluxgate-sample-mongo/pom.xml ./fluxgate-samples/fluxgate-sample-mongo/pom.xml
COPY --from=fluxgate_core /fluxgate-samples/fluxgate-sample-redis/pom.xml ./fluxgate-samples/fluxgate-sample-redis/pom.xml
COPY --from=fluxgate_core /fluxgate-samples/fluxgate-sample-standalone-java11/pom.xml ./fluxgate-samples/fluxgate-sample-standalone-java11/pom.xml
COPY --from=fluxgate_core /fluxgate-samples/fluxgate-sample-standalone-java21/pom.xml ./fluxgate-samples/fluxgate-sample-standalone-java21/pom.xml
COPY --from=fluxgate_core /fluxgate-samples/pom.xml ./fluxgate-samples/pom.xml
COPY --from=fluxgate_core /fluxgate-spring-boot2-starter/pom.xml ./fluxgate-spring-boot2-starter/pom.xml
COPY --from=fluxgate_core /fluxgate-spring-boot3-starter/pom.xml ./fluxgate-spring-boot3-starter/pom.xml
COPY --from=fluxgate_core /fluxgate-testkit/pom.xml ./fluxgate-testkit/pom.xml
COPY --from=fluxgate_core /fluxgate-core/src/main/ ./fluxgate-core/src/main/
COPY --from=fluxgate_core /fluxgate-mongo-adapter/src/main/ ./fluxgate-mongo-adapter/src/main/
COPY --from=fluxgate_core /fluxgate-redis-ratelimiter/src/main/ ./fluxgate-redis-ratelimiter/src/main/
COPY --from=fluxgate_core /fluxgate-spring-boot3-starter/src/main/ ./fluxgate-spring-boot3-starter/src/main/
COPY --from=fluxgate_core /fluxgate-control-support/src/main/ ./fluxgate-control-support/src/main/
RUN ./mvnw -B -ntp -pl fluxgate-spring-boot3-starter,fluxgate-control-support -am \
    -Dmaven.test.skip=true -Djacoco.skip=true -Dspotless.skip=true install

WORKDIR /build
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B -ntp -DskipTests dependency:resolve dependency:resolve-plugins

COPY src ./src
RUN ./mvnw -B -ntp -DskipTests -Djacoco.skip=true -Dspotless.check.skip=true package

# ---------- runtime ----------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN addgroup -S fluxgate && adduser -S fluxgate -G fluxgate
COPY --from=build /build/target/fluxgate-studio-admin-api-*.jar /app/app.jar
USER fluxgate

EXPOSE 8090
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
