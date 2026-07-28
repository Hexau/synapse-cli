#!/bin/bash
# Builds @synapse/protocol and @synapse/cli, bundles the protocol package as
# a vendored tarball inside the CLI package (same pattern already used for
# local dev — see vendor/synapse-protocol-*.tgz), then packs the CLI itself
# into a single distributable .tgz.
#
# No npm registry involved (private tooling, not published anywhere) — the
# output .tgz is meant to be shared directly (network drive, Slack, etc.)
# and installed with:
#   npm install -g ./synapse-cli-<version>.tgz
#
# Usage: npm run release   (from synapse-cli/)
set -euo pipefail

# Use Windows-style paths (pwd -W) throughout — this repo runs under
# Git Bash on Windows, and `node -e`/`node -p` invoke the native Windows
# node.exe, which can't resolve POSIX-style /c/... paths bash's plain pwd
# would otherwise produce.
CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -W)"
PROTOCOL_DIR="$(cd "$CLI_DIR/../synapse-protocol" && pwd -W)"
VENDOR_DIR="$CLI_DIR/vendor"

echo "== Building @synapse/protocol =="
(cd "$PROTOCOL_DIR" && npm run compile)

PROTOCOL_VERSION="$(node -p "require('$PROTOCOL_DIR/package.json').version")"
echo "== Packing @synapse/protocol@$PROTOCOL_VERSION into vendor/ =="
mkdir -p "$VENDOR_DIR"
rm -f "$VENDOR_DIR"/synapse-protocol-*.tgz
(cd "$PROTOCOL_DIR" && npm pack --pack-destination "$VENDOR_DIR" --silent)
# npm pack names the file <name>-<version>.tgz using the *unscoped* package
# name segment (synapse-protocol, not @synapse/protocol) — matches what
# package.json's "file:./vendor/..." dependency already expects.

echo "== Pointing @synapse/cli's dependency at the freshly packed tarball =="
node -e "
  const fs = require('fs');
  const path = require('path');
  const pkgPath = path.join('$CLI_DIR', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies['@synapse/protocol'] = 'file:./vendor/synapse-protocol-$PROTOCOL_VERSION.tgz';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
"

echo "== Reinstalling CLI dependencies (picks up the new tarball) =="
# Full reinstall, not just 'npm install' — npm caches file: tarballs by
# filename+version and silently reuses a stale copy otherwise (bit us once
# already during development).
rm -rf "$CLI_DIR/node_modules" "$CLI_DIR/package-lock.json"
(cd "$CLI_DIR" && npm install)

echo "== Building @synapse/cli =="
(cd "$CLI_DIR" && npm run compile)

echo "== Packing @synapse/cli =="
(cd "$CLI_DIR" && npm pack --pack-destination "$CLI_DIR")

CLI_VERSION="$(node -p "require('$CLI_DIR/package.json').version")"
echo ""
echo "Done: synapse-cli-$CLI_VERSION.tgz"
echo "Install with: npm install -g ./synapse-cli-$CLI_VERSION.tgz"
