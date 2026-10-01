# syntax=docker/dockerfile:1
#
# TierDecay advisor and MCP server for Linux production use (CI gates,
# shared runners, containerised agents). Zero runtime dependencies: the image
# is the Node.js runtime plus the engine, nothing else. It runs as the
# distroless `nonroot` user, works with a read-only root filesystem, and never
# needs network access. Mount the project to inspect at /work.
#
#   docker build -t tierdecay .
#   docker run --rm --read-only -v "$PWD:/work:ro" tierdecay doctor
#   docker run --rm -i -v "$PWD:/work:ro" tierdecay mcp          # MCP over stdio
#
# Base images are pinned by digest; Dependabot proposes updates.

FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS verify
WORKDIR /opt/tierdecay
COPY package.json LICENSE ./
COPY bin ./bin
COPY core ./core
# Fail the build if the CLI cannot start or a template is unparsable.
RUN node bin/tierdecay.js --version \
 && node -e "const m=require('./core/engine/markdown');const fs=require('fs');m.parsePlaybook(fs.readFileSync('core/playbook.template.md','utf8'));m.parseLedger(fs.readFileSync('core/ledger.template.md','utf8'))"

FROM gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e
LABEL org.opencontainers.image.title="TierDecay" \
      org.opencontainers.image.description="Per-repo learning layer for AI coding model routers: deterministic advisor and MCP server" \
      org.opencontainers.image.source="https://github.com/alebgl77/tierdecay" \
      org.opencontainers.image.licenses="MIT"
COPY --from=verify /opt/tierdecay /opt/tierdecay
WORKDIR /work
USER nonroot
ENTRYPOINT ["/nodejs/bin/node", "/opt/tierdecay/bin/tierdecay.js"]
CMD ["--help"]
