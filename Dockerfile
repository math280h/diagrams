FROM --platform=$BUILDPLATFORM ghcr.io/pnpm/pnpm:12.16.1@sha256:33081d3d2c96ba582d316cfd630f0f43961d9c60ff919b50edd1835a1462976b AS pnpm

FROM ghcr.io/static-web-server/static-web-server:2.44.2@sha256:23be6c04d474979d6e738081918f5874f88502a150d1123fd000719101a0f05c AS server

FROM --platform=$BUILDPLATFORM node:26-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS build
COPY --from=pnpm /opt/pnpm /opt/pnpm
ENV PATH=/opt/pnpm:$PATH
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
# The hosted builder accepts only the cache mount ID s/<service ID>-<target>, without variables.
RUN --mount=type=cache,id=s/e3f64b02-d3db-4aa3-afd2-acf19f1d664f-/root/.local/share/pnpm/store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
ARG VITE_RELEASE_CHANNEL
ARG DIAGRAMS_WEBSITE=
ARG DIAGRAMS_REPOSITORY=
ARG DIAGRAMS_REPORT_URL=
ARG DIAGRAMS_REPORT_KEYS=
RUN pnpm build

FROM build AS sbom-build
ARG VERSION=dev
RUN pnpm sbom --sbom-format cyclonedx --sbom-type application --sbom-spec-version 1.6 --prod --out /tmp/pnpm.cdx.json \
    && node scripts/image-sbom.ts /tmp/pnpm.cdx.json "$VERSION" /diagrams-website.cdx.json

FROM scratch AS sbom
COPY --from=sbom-build /diagrams-website.cdx.json /

FROM gcr.io/distroless/static-debian13:nonroot@sha256:aafe993665bf6200db38a02c11a9351e782a84b6a45e7f33b6695638c88e3931
COPY --from=server /static-web-server /usr/local/bin/static-web-server
ADD --chmod=644 --checksum=sha256:65a16095f3a6e1385664ecd3629d2442928aab83b55326e88ea953bcecd127f3 \
    https://raw.githubusercontent.com/static-web-server/static-web-server/v2.44.1/LICENSE-MIT \
    /usr/share/doc/static-web-server/LICENSE-MIT
ADD --chmod=644 --checksum=sha256:a60eea817514531668d7e00765731449fe14d059d3249e0bc93b36de45f759f2 \
    https://raw.githubusercontent.com/static-web-server/static-web-server/v2.44.1/LICENSE-APACHE \
    /usr/share/doc/static-web-server/LICENSE-APACHE
COPY docker/sws.toml /etc/static-web-server/sws.toml
COPY --from=build /app/dist /srv
ENV SERVER_PORT=8080 \
    SERVER_ROOT=/srv \
    SERVER_CONFIG_FILE=/etc/static-web-server/sws.toml \
    SERVER_CACHE_CONTROL_HEADERS=false \
    SERVER_HEALTH=true
USER nonroot
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/static-web-server"]
