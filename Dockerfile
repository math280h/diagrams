FROM --platform=$BUILDPLATFORM ghcr.io/pnpm/pnpm:12.16.1@sha256:33081d3d2c96ba582d316cfd630f0f43961d9c60ff919b50edd1835a1462976b AS pnpm

FROM ghcr.io/static-web-server/static-web-server:2.44.1@sha256:94618e3d17802265a21926217e6f9e7832b311b6fbf5933684001739fafed06a AS server

FROM --platform=$BUILDPLATFORM node:26-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS build
COPY --from=pnpm /opt/pnpm /opt/pnpm
ENV PATH=/opt/pnpm:$PATH
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
ARG DIAGRAMS_WEBSITE=
ARG DIAGRAMS_REPOSITORY=
RUN pnpm build

FROM build AS sbom-build
ARG VERSION=dev
RUN pnpm sbom --sbom-format cyclonedx --sbom-type application --sbom-spec-version 1.6 --prod --out /tmp/pnpm.cdx.json \
    && node scripts/image-sbom.ts /tmp/pnpm.cdx.json "$VERSION" /diagrams-website.cdx.json

FROM scratch AS sbom
COPY --from=sbom-build /diagrams-website.cdx.json /

FROM gcr.io/distroless/static-debian13:nonroot@sha256:25ac8f0c3b2334a9eb05452266bd4697864a8c8ef0ef71e5e6480d7f92868329
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
