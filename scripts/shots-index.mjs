// Emit a markdown gallery for the screenshots directory given as argv[2].
import { readdirSync } from 'node:fs';
import { basename } from 'node:path';
const dir = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
console.log('# Screenshots\n');
console.log(`Captured by \`make shots\` on ${new Date().toISOString().slice(0, 10)}.\n`);
for (const f of files) console.log(`## ${f.replace('.png', '')}\n\n![${f}](${basename(dir)}/${f})\n`);
