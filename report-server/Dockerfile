FROM --platform=$BUILDPLATFORM ghcr.io/pnpm/pnpm:12.16.1@sha256:33081d3d2c96ba582d316cfd630f0f43961d9c60ff919b50edd1835a1462976b AS pnpm

FROM --platform=$BUILDPLATFORM node:26-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS build
COPY --from=pnpm /opt/pnpm /opt/pnpm
ENV PATH=/opt/pnpm:$PATH \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY report-server/package.json report-server/
COPY patches patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm report-server:build && mkdir -p /data/reports

FROM build AS sbom-build
ARG VERSION=dev
RUN pnpm sbom --filter report-server --sbom-format cyclonedx --sbom-type application --sbom-spec-version 1.6 --prod \
        --out /tmp/pnpm.cdx.json \
    && node scripts/report-server-sbom.ts /tmp/pnpm.cdx.json "$VERSION" /diagrams-report-server.cdx.json

FROM scratch AS sbom
COPY --from=sbom-build /diagrams-report-server.cdx.json /

FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:1d736cf8b5716c07a245301f92717143215d248fd55771ee1936ef4b3302e531
COPY --from=build /app/report-server/dist /app
COPY --from=build --chown=65532:65532 /data /data
USER nonroot
EXPOSE 8080
CMD ["/app/server.js"]
