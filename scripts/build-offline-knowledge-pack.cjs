/* Converts a rights-reviewed, manually structured JSON manifest into a checksum-pinned
   read-only knowledge pack. No PDF scraping, cloud API calls or background training. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {verifyPack, digest} = require('../public/offline-knowledge-pack.js');

async function build(manifest) {
 if (!manifest || !Array.isArray(manifest.passages)) throw Error('Passage manifest required');
 const passages = [];
 for (const passage of manifest.passages) {
  if (!passage || typeof passage.text !== 'string') throw Error('Each passage needs already-extracted, rights-cleared text');
  passages.push({...passage, sha256:await digest(passage.text)});
 }
 const pack = {...manifest, passages};
 verifyPack(pack);
 return pack;
}

async function main(args) {
 if (args.length !== 2) throw Error('Usage: node scripts/build-offline-knowledge-pack.cjs <manifest.json> <new-pack.json>');
 const inputPath = path.resolve(args[0]), outputPath = path.resolve(args[1]);
 if (inputPath === outputPath) throw Error('Input and output must be different files');
 const manifest = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
 const pack = await build(manifest);
 fs.writeFileSync(outputPath, JSON.stringify(pack, null, 2) + '\n', {flag:'wx', mode:0o600});
 process.stdout.write(`Created ${pack.id}@${pack.version}: ${pack.sources.length} sources, ${pack.passages.length} passages\n`);
}
if (require.main === module) main(process.argv.slice(2)).catch(error => {console.error(error.message); process.exitCode = 1});
module.exports = {build};
