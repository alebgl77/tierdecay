#!/usr/bin/env node
'use strict';

// Minimal CycloneDX 1.5 SBOM for a release archive. TierDecay has zero
// runtime dependencies, so the bill of materials is the component itself plus
// the archive hash; the Node.js runtime is declared as a required platform.
//   node scripts/sbom.js <version> <archive.tar.gz>  > tierdecay-<version>.cdx.json
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const [version, archive] = process.argv.slice(2);
if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version || '') || !archive) {
  process.stderr.write('usage: sbom.js <version> <archive>\n');
  process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
if (pkg.version !== version) {
  process.stderr.write(`package.json version ${pkg.version} != ${version}\n`);
  process.exit(2);
}
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
const ref = `pkg:github/alebgl77/tierdecay@v${version}`;
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${[sha256.slice(0, 8), sha256.slice(8, 12), `5${sha256.slice(13, 16)}`, `8${sha256.slice(17, 20)}`, sha256.slice(20, 32)].join('-')}`,
  version: 1,
  metadata: {
    component: {
      type: 'application',
      'bom-ref': ref,
      name: 'tierdecay',
      version,
      description: pkg.description,
      licenses: [{ license: { id: pkg.license } }],
      purl: ref,
      externalReferences: [{ type: 'vcs', url: 'https://github.com/alebgl77/tierdecay' }],
      hashes: [{ alg: 'SHA-256', content: sha256 }]
    },
    properties: [
      { name: 'tierdecay:runtime-dependencies', value: '0' },
      { name: 'tierdecay:requires', value: `node ${pkg.engines.node}` },
      { name: 'tierdecay:archive', value: path.basename(archive) }
    ]
  },
  components: [],
  dependencies: [{ ref, dependsOn: [] }]
};
process.stdout.write(`${JSON.stringify(sbom, null, 2)}\n`);
