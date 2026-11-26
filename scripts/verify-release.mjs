import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import asar from '@electron/asar';
const root = path.resolve(import.meta.dirname, '..'),
  pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const source = process.argv[2],
  portable = process.argv[3];
if (!source || !portable)
  throw new Error(
    'Uso: node scripts/verify-release.mjs informe-paquete.json informe-portable.json',
  );
const read = (file) => JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8'));
const reports = [read(source), read(portable)];
for (const r of reports)
  if (r.error || r.passed < 43 || !r.userAgent.includes('/' + pkg.version))
    throw new Error('Informe insuficiente o de otra versión.');
const runtime = path.join(root, 'dist/win-unpacked/resources/app.asar');
for (const file of [
  'src/main.cjs',
  'src/preload.cjs',
  'src/app.bundle.js',
  'src/index.html',
  'src/style.css',
])
  if (!asar.extractFile(runtime, file).equals(fs.readFileSync(path.join(root, file))))
    throw new Error('Fuente distinta del paquete: ' + file);
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = [
  `dist/Trazo3D-Portable-${pkg.version}.exe`,
  `dist/Trazo3D-Instalador-${pkg.version}.exe`,
  'dist/win-unpacked/resources/app.asar',
];
const hashes = Object.fromEntries(files.map((f) => [f, sha(path.join(root, f))]));
const manifest = {
  application: pkg.build.productName,
  version: pkg.version,
  platform: 'Windows x64',
  checkedAt: new Date().toISOString(),
  primaryExecutable: files[0],
  packagedDesktopChecks: reports[0].passed,
  portableDesktopChecks: reports[1].passed,
  sourceEqualsPackage: true,
  sha256: hashes,
  reports: [source, portable].map((file) => path.basename(file)),
  checks: reports[1].checks,
};
fs.writeFileSync(path.join(root, 'dist', 'validation.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
