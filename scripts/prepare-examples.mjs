import fs from 'node:fs';
import { demoProject } from '../src/model.mjs';
fs.mkdirSync('examples', { recursive: true });
fs.writeFileSync('examples/Casa patio.trazo', JSON.stringify(demoProject(), null, 2));
let notices = 'Trazo 3D — Avisos de terceros\n\n';
for (const name of ['three', 'three-bvh-csg', 'three-mesh-bvh', 'dxf-parser', 'loglevel']) {
  const file = ['LICENSE', 'LICENSE.txt', 'LICENSE-MIT']
    .map((f) => 'node_modules/' + name + '/' + f)
    .find((f) => fs.existsSync(f));
  notices +=
    '\n' +
    name +
    '\n' +
    (file ? fs.readFileSync(file, 'utf8') : 'Ver licencia en el paquete de la biblioteca') +
    '\n';
}
fs.writeFileSync('THIRD-PARTY-NOTICES.txt', notices.trimEnd() + '\n');
