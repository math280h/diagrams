FROM --platform=$BUILDPLATFORM ghcr.io/pnpm/pnpm:12.23.0@sha256:349c846c6c9dab76b2f6fbf4b2df14d5a8c9b2a0fce92fc7e5c2eec3f437e801 AS pnpm

FROM --platform=$BUILDPLATFORM node:26-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS build
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
