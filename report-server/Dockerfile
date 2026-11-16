FROM --platform=$BUILDPLATFORM ghcr.io/pnpm/pnpm:12.21.0@sha256:168feba88e6a1684c99a62cbf4fe361d4e683e2a6c920d3b0acde7e15a28b62d AS pnpm

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

FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:767ffb7e2ffa9f4280f1af7b99f7f0a1cafb79d0dcc0e0d3aba43843748008a5
COPY --from=build /app/report-server/dist /app
COPY --from=build --chown=65532:65532 /data /data
USER nonroot
EXPOSE 8080
CMD ["/app/server.js"]
