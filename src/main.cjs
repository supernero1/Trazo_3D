const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
let win;
let activePath = null;
let dirty = false;
let closing = false;
app.setName('Trazo 3D');
if (process.env.TRAZO_SMOKE)
  app.setPath('userData', path.join(path.dirname(process.env.TRAZO_SMOKE), 'smoke-profile'));
else if (process.env.TRAZO_PREVIEW) app.setPath('userData', process.env.TRAZO_PREVIEW);
if (!process.env.TRAZO_SMOKE && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});
const recoveryPath = () => path.join(app.getPath('userData'), 'recovery.trazo');
const testPath = (extension) =>
  path.join(path.dirname(process.env.TRAZO_SMOKE), 'smoke-file.' + extension);
const filter = [{ name: 'Proyecto Trazo 3D', extensions: ['trazo'] }];
function authorized(event) {
  if (event.sender !== win?.webContents) throw new Error('Origen no permitido');
}
async function safeWrite(file, content) {
  const temp = file + '.tmp';
  await fs.writeFile(temp, content, 'utf8');
  await fs.rename(temp, file);
}
ipcMain.handle('project:save', async (event, content, saveAs) => {
  authorized(event);
  if (typeof content !== 'string' || content.length > 100_000_000)
    throw new Error('Proyecto demasiado grande');
  let file = activePath;
  if (process.env.TRAZO_SMOKE) file = testPath('trazo');
  if (!file || saveAs) {
    const result = await dialog.showSaveDialog(win, {
      title: 'Guardar proyecto',
      defaultPath: file || 'Mi modelo.trazo',
      filters: filter,
    });
    if (result.canceled) return null;
    file = result.filePath;
  }
  await safeWrite(file, content);
  activePath = file;
  dirty = false;
  return { path: file, name: path.basename(file, '.trazo') };
});
ipcMain.handle('project:open', async (event) => {
  authorized(event);
  const result = process.env.TRAZO_SMOKE
    ? { filePaths: [testPath('trazo')] }
    : await dialog.showOpenDialog(win, {
        title: 'Abrir proyecto',
        filters: filter,
        properties: ['openFile'],
      });
  if (result.canceled) return null;
  const file = result.filePaths[0];
  const stat = await fs.stat(file);
  if (stat.size > 100_000_000) throw new Error('Archivo demasiado grande');
  return {
    content: await fs.readFile(file, 'utf8'),
    path: file,
    name: path.basename(file, '.trazo'),
  };
});
ipcMain.handle('project:accept', (event, file) => {
  authorized(event);
  activePath = file;
  dirty = false;
});
ipcMain.handle('project:reset', (event) => {
  authorized(event);
  activePath = null;
  dirty = false;
});
ipcMain.handle('project:dirty', (event, value) => {
  authorized(event);
  dirty = Boolean(value);
});
ipcMain.handle('project:autosave', async (event, content) => {
  authorized(event);
  await safeWrite(recoveryPath(), content);
  return true;
});
ipcMain.handle('project:recovery', async (event) => {
  authorized(event);
  try {
    return await fs.readFile(recoveryPath(), 'utf8');
  } catch {
    return null;
  }
});
ipcMain.handle('project:clearRecovery', async (event) => {
  authorized(event);
  await fs.rm(recoveryPath(), { force: true });
});
ipcMain.handle('file:export', async (event, content, format) => {
  authorized(event);
  const formats = {
    obj: 'Wavefront OBJ',
    stl: 'Malla STL',
    png: 'Imagen PNG',
    dxf: 'Plano CAD DXF',
    svg: 'Plano vectorial SVG',
  };
  if (!formats[format]) throw new Error('Formato no permitido');
  const result = process.env.TRAZO_SMOKE
    ? { filePath: testPath(format) }
    : await dialog.showSaveDialog(win, {
        title: 'Exportar ' + format.toUpperCase(),
        defaultPath: 'Mi modelo.' + format,
        filters: [{ name: formats[format], extensions: [format] }],
      });
  if (result.canceled) return false;
  await fs.writeFile(
    result.filePath,
    format === 'png'
      ? Buffer.from(content.replace(/^data:image\/png;base64,/, ''), 'base64')
      : content,
  );
  return true;
});
ipcMain.handle('file:import', async (event) => {
  authorized(event);
  const result = process.env.TRAZO_SMOKE
    ? { filePaths: [testPath('obj')] }
    : await dialog.showOpenDialog(win, {
        title: 'Importar geometría',
        filters: [{ name: 'OBJ, STL y CAD DXF', extensions: ['obj', 'stl', 'dxf'] }],
        properties: ['openFile'],
      });
  if (result.canceled) return null;
  const file = result.filePaths[0];
  if ((await fs.stat(file)).size > 50_000_000) throw new Error('La malla supera 50 MB');
  const data = await fs.readFile(file);
  return {
    name: path.basename(file),
    extension: path.extname(file).toLowerCase(),
    bytes: [...data],
  };
});
ipcMain.handle('texture:import', async (event) => {
  authorized(event);
  const result = await dialog.showOpenDialog(win, {
    title: 'Importar textura',
    filters: [{ name: 'Imagen PNG, JPEG o WebP', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    properties: ['openFile'],
  });
  if (result.canceled) return null;
  const file = result.filePaths[0];
  if ((await fs.stat(file)).size > 8_000_000) throw new Error('La imagen supera 8 MB.');
  const ext = path.extname(file).toLowerCase(),
    type = ext === '.png' ? 'png' : ext === '.webp' ? 'webp' : 'jpeg';
  return {
    name: path.basename(file),
    data: 'data:image/' + type + ';base64,' + (await fs.readFile(file)).toString('base64'),
  };
});
ipcMain.handle('library:read', async (event) => {
  authorized(event);
  try {
    return JSON.parse(
      await fs.readFile(path.join(app.getPath('userData'), 'library.json'), 'utf8'),
    );
  } catch {
    return [];
  }
});
ipcMain.handle('library:write', async (event, content) => {
  authorized(event);
  if (typeof content !== 'string' || content.length > 50_000_000)
    throw new Error('Biblioteca demasiado grande.');
  await safeWrite(path.join(app.getPath('userData'), 'library.json'), content);
  return true;
});
ipcMain.handle('sheet:pdf', async (event, svg, paper) => {
  authorized(event);
  if (
    typeof svg !== 'string' ||
    svg.length > 10_000_000 ||
    !svg.startsWith('<svg ') ||
    !['A4', 'A3'].includes(paper)
  )
    throw new Error('Lámina inválida.');
  const result = process.env.TRAZO_SMOKE
    ? { filePath: testPath('pdf') }
    : await dialog.showSaveDialog(win, {
        title: 'Guardar plano a escala',
        defaultPath: 'Plano.pdf',
        filters: [{ name: 'Plano PDF', extensions: ['pdf'] }],
      });
  if (result.canceled) return false;
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await printWindow.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><style>@page{size:' +
            paper +
            ' landscape;margin:0}body{margin:0}svg{display:block}</style>' +
            svg,
        ),
    );
    await fs.writeFile(
      result.filePath,
      await printWindow.webContents.printToPDF({
        pageSize: paper,
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      }),
    );
    return true;
  } finally {
    printWindow.destroy();
  }
});
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1100,
    minHeight: 740,
    backgroundColor: '#f5f4ef',
    title: 'Trazo 3D',
    icon: path.join(__dirname, '../assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !process.env.TRAZO_SMOKE,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: /^https?:|^wss?:/i.test(details.url) }),
  );
  if (process.env.TRAZO_SMOKE)
    win.webContents.on('console-message', (_event, ...args) => console.log('renderer:', ...args));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('close', async (event) => {
    if (closing || !dirty) return;
    event.preventDefault();
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Seguir editando', 'Salir sin guardar'],
      defaultId: 0,
      cancelId: 0,
      message: 'Hay cambios sin guardar',
      detail: 'Guarda el proyecto antes de salir para conservar tus cambios.',
    });
    if (response === 1) {
      closing = true;
      win.close();
    }
  });
  if (process.env.TRAZO_SMOKE)
    win.webContents.on('did-finish-load', () =>
      win.webContents
        .executeJavaScript(
          '(async()=>{for(let i=0;i<100;i++){if(window.runSmokeTests)return window.runSmokeTests();await new Promise(r=>setTimeout(r,100));}throw new Error("El módulo del visor no inició");})()',
        )
        .then(async (result) => {
          await fs.writeFile(process.env.TRAZO_SMOKE, JSON.stringify(result, null, 2));
          await fs.writeFile(
            process.env.TRAZO_SMOKE.replace(/\.json$/, '.png'),
            (await win.webContents.capturePage()).toPNG(),
          );
          closing = true;
          app.quit();
        })
        .catch(async (error) => {
          await fs.writeFile(process.env.TRAZO_SMOKE, JSON.stringify({ error: error.stack }));
          closing = true;
          app.exit(1);
        }),
    );
});
app.on('window-all-closed', () => app.quit());
