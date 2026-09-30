# syntax=docker/dockerfile:1

# ---------- build ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Resolve dependencies first so that source-only changes reuse the cached layer.
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
