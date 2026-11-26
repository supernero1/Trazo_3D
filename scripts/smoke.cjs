const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const exe = process.argv[2] ? path.resolve(process.argv[2]) : require('electron');
fs.mkdirSync(path.join(root, 'work'), { recursive: true });
const report = path.join(root, 'work', 'smoke-' + Date.now() + '.json');
const env = { ...process.env, TRAZO_SMOKE: report };
delete env.ELECTRON_RUN_AS_NODE;
const args = process.argv[2] ? [] : [root];
const child = spawn(exe, args, { env, cwd: root, stdio: 'inherit', windowsHide: false });
const timer = setTimeout(() => {
  console.error('El proceso de prueba no terminó en 90 segundos.');
  child.kill();
  process.exitCode = 1;
}, 90000);
child.on('error', (error) => {
  clearTimeout(timer);
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  clearTimeout(timer);
  try {
    const result = JSON.parse(fs.readFileSync(report, 'utf8'));
    console.log(JSON.stringify(result, null, 2));
    console.log('Informe:', report);
    if (result.passed < 43 || result.error) process.exitCode = 1;
  } catch (error) {
    console.error('No se pudo leer el resultado:', error.message);
    process.exitCode = 1;
  }
  if (code) process.exitCode = code;
});
