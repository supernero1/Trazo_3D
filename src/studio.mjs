import * as THREE from 'three';
import { clone, uid, normal, prism, pushPull } from './model.mjs';
import {
  polyline,
  arcPoints,
  offsetFace,
  syncComponent,
  autofold,
  pullRegion,
  mergeObjects,
  sweepProfile,
  matrixOf,
  vec,
  groupDescendants,
  libraryModel,
  resolveAnchor,
  dimensionGeometry,
  dissolveEdge,
  rebindAnchors,
} from './modeling.mjs';
import { exportDXF, importDXF, technicalSheet } from './exchange.mjs';
import { combineSolids } from './boolean.mjs';
import { parseLength, parseMeasures, formatLength, unitFactor } from './measure.mjs';
import { icon, hydrateIcons } from './icons.mjs';
export const STUDIO_TOOLS = {
  line: 'Línea abierta',
  arc: 'Arco de 3 puntos',
  offset: 'Offset',
  dimension: 'Cota permanente',
};
export const STUDIO_HINTS = {
  line: 'Clic para añadir puntos · Enter termina · vuelve al inicio para crear una cara',
  arc: 'Marca inicio, final y un punto por donde pasa el arco',
  offset: 'Selecciona una cara · mueve el ratón o escribe distancia · positivo hacia dentro',
  dimension: 'Marca dos puntos y después la posición de la cota',
};
const $ = (id) => document.getElementById(id);
export function installStudio(api) {
  const view = api.viewport;
  let mode = 'object',
    op = null,
    context = null,
    library = [],
    axisLock = null,
    textureId = '';
  const project = api.getProject,
    selected = () => project().objects.filter((o) => api.getSelected().has(o.id));
  const safe =
    (fn) =>
    async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        console.error(e);
        api.toast(e.message, true);
      }
    };
  const inject = (parent, html) => {
    const el = document.createElement('div');
    el.innerHTML = html;
    hydrateIcons(el);
    parent.append(...el.childNodes);
  };
  inject(
    document.querySelector('.tools .tool-section'),
    '<button class="tool" data-tool="line" data-icon="pen" title="Línea abierta (L)"></button><button class="tool" data-tool="arc" data-icon="orbit" title="Arco de tres puntos (A)"></button><button class="tool" data-tool="offset" data-icon="rectangle" title="Offset (F)"></button><button class="tool" data-tool="dimension" data-icon="ruler" title="Cota permanente (K)"></button>',
  );
  const bar = document.createElement('div');
  bar.className = 'studio-bar';
  bar.innerHTML =
    '<span>EDITAR</span><button data-mode="object" class="active">Objeto</button><button data-mode="vertex">Vértice</button><button data-mode="edge">Arista</button><button data-mode="face">Cara</button><span id="group-context"></span><button id="exit-context" hidden>Salir del grupo ↗</button>';
  view.element.append(bar);
  const menu = document.createElement('div');
  menu.className = 'dropdown studio-menu';
  menu.innerHTML =
    '<button id="model-menu-button">Modelar ⌄</button><div class="dropdown-menu" id="model-menu" hidden><button data-action="component">Crear componente vinculado</button><button data-action="unique">Hacer único</button><button data-action="follow">Seguir recorrido: perfil + línea</button><button data-action="face">Crear cara desde línea cerrada</button><button data-action="reverse">Invertir cara</button><button data-action="mirror">Reflejar en X</button><button data-action="save-library">Guardar selección en biblioteca</button></div>';
  document.querySelector('.view-group').prepend(menu);
  const panel = document.createElement('section');
  panel.className = 'studio-inspector';
  panel.innerHTML = `
  <details open><summary>Geometría y componentes <span class="new-badge">2.0</span></summary><div class="details-body"><p id="geometry-status" class="small-note">Selecciona un vértice, arista o cara para editar con M / Q / S.</p><label class="field-label">Desplazar geometría X;Y;Z<input id="vertex-delta" placeholder="0;0.5;0"></label><button id="apply-vertex" class="studio-button">Aplicar desplazamiento</button><div class="button-pair"><button data-action="component">Crear componente</button><button data-action="unique">Hacer único</button></div><label class="field-label">Etiqueta del objeto<select id="object-tag"><option value="">Sin etiqueta</option></select></label></div></details>
  <details><summary>Biblioteca local</summary><div class="details-body"><div class="library-grid">${[
    ['table', 'Mesa'],
    ['chair', 'Silla'],
    ['door', 'Puerta'],
    ['window', 'Ventana'],
    ['stairs', 'Escalera'],
    ['planter', 'Jardinera'],
  ]
    .map(
      ([id, name]) =>
        `<button data-asset="${id}" class="asset-card">${icon('box')}<span>${name}</span></button>`,
    )
    .join(
      '',
    )}</div><div id="custom-library"></div><button class="studio-button" data-action="save-library">Guardar selección como componente</button><p class="small-note">Cada inserción de un componente comparte su geometría. Edita sus vértices para actualizar todas sus copias.</p></div></details>
  <details><summary>Etiquetas y visibilidad</summary><div class="details-body"><div class="inline-input"><input id="tag-name" placeholder="Nombre de etiqueta"><button id="add-tag">+</button></div><div id="tag-list"></div></div></details>
  <details><summary>Cotas permanentes</summary><div class="details-body"><button class="studio-button" id="dimension-start">Añadir cota · K</button><div id="dimension-list"></div><p class="small-note">Las cotas ajustadas a vértices siguen las transformaciones y los cambios de geometría.</p></div></details>
  <details><summary>Secciones y visualización</summary><div class="details-body"><label class="field-label">Plano de corte<select id="section-axis"><option value="">Desactivado</option><option value="y">Horizontal · Y</option><option value="x">Vertical · X</option><option value="z">Vertical · Z</option></select></label><div class="inline-input"><input id="section-value" type="number" step=".1" value="1.2" aria-label="Posición del plano de sección"><label><input id="section-flip" type="checkbox">Invertir</label></div><label class="field-label">Estilo<select id="display-style"><option value="solid">Sólido con materiales</option><option value="mono">Monocromo</option><option value="wire">Alambre</option><option value="xray">Rayos X</option></select></label><label class="field-label">Dirección del sol<input type="range" id="sun-angle" min="0" max="360" value="135"></label></div></details>
  <details><summary>Láminas y CAD</summary><div class="details-body"><label class="field-label">Vista de plano<select id="sheet-view"><option value="top">Planta</option><option value="front">Alzado frontal</option><option value="right">Alzado lateral</option></select></label><div class="button-pair"><label>Escala 1:<input id="sheet-scale" type="number" min="1" max="10000" value="100"></label><label>Hoja<select id="sheet-paper"><option>A4</option><option>A3</option></select></label></div><div class="button-pair"><button id="sheet-pdf">Guardar PDF</button><button id="sheet-svg">Guardar SVG</button></div><button id="cad-export" class="studio-button">Exportar DXF 3D con cotas</button><p class="small-note">Lámina vectorial a escala física. Usa el plano de sección para definir el corte. Impresión al 100%.</p></div></details>`;
  document.querySelector('.inspector-heading').after(panel);
  const textures = document.createElement('div');
  textures.className = 'texture-controls';
  textures.innerHTML =
    '<label class="field-label">Textura<select id="texture-picker"><option value="">Sin textura</option><option value="wood">Madera</option><option value="brick">Ladrillo</option><option value="tile">Cerámica</option><option value="concrete">Hormigón</option></select></label><div class="button-pair"><button id="texture-import">Importar imagen…</button><button id="texture-apply">Aplicar</button></div><label class="field-label">Tamaño del patrón (m)<input id="texture-size" type="number" value="1" min=".01" step=".1"></label><label class="field-label">Opacidad<input id="material-opacity" type="range" min=".05" max="1" step=".05" value="1"></label>';
  document.querySelector('.materials-panel').append(textures);
  const merge = document.createElement('label');
  merge.innerHTML =
    '<input type="checkbox" id="merge-drawing" checked> Integrar dibujo sobre sólidos';
  document.querySelector('.settings-panel').append(merge);
  const inspector = document.querySelector('.inspector'),
    tabs = document.createElement('div'),
    objectArea = document.createElement('div'),
    projectArea = document.createElement('div'),
    geometryDetails = panel.querySelector('details');
  tabs.className = 'inspector-tabs';
  tabs.innerHTML =
    '<button data-inspector-tab="object" class="active">Objeto y materiales</button><button data-inspector-tab="project">Proyecto</button>';
  objectArea.className = 'object-inspector studio-inspector';
  projectArea.className = 'project-inspector';
  projectArea.hidden = true;
  geometryDetails.open = false;
  objectArea.append(
    document.querySelector('.properties-panel'),
    geometryDetails,
    document.querySelector('.materials-panel'),
  );
  projectArea.append(
    panel,
    document.querySelector('.objects-panel'),
    document.querySelector('.scenes-panel'),
    document.querySelector('.settings-panel'),
  );
  inspector.append(tabs, objectArea, projectArea);
  tabs.querySelectorAll('button').forEach(
    (b) =>
      (b.onclick = () => {
        const object = b.dataset.inspectorTab === 'object';
        objectArea.hidden = !object;
        projectArea.hidden = object;
        tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      }),
  );
  $('model-menu-button').onclick = () => ($('model-menu').hidden = !$('model-menu').hidden);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.studio-menu')) $('model-menu').hidden = true;
  });
  const changeMode = (value) => {
    mode = value;
    view.setSubSelection(null);
    api.setTool('select');
    geometryDetails.open = value !== 'object';
    updateUI();
  };
  document
    .querySelectorAll('[data-mode]')
    .forEach((b) => (b.onclick = () => changeMode(b.dataset.mode)));
  $('exit-context').onclick = () => {
    context = project().groups.find((g) => g.id === context)?.parent || null;
    api.selectObjects([]);
    api.render();
  };
  const add = (o) => {
    o.group = context;
    api.addObject(o);
  };
  const geometricChange = (o) => {
    const next = autofold(o);
    Object.assign(o, next);
    syncComponent(project(), o);
  };
  const component = () => {
    const objects = selected();
    if (!objects.length || objects.some((o) => o.locked))
      throw new Error('Selecciona objetos desbloqueados.');
    let o;
    if (objects.length === 1) {
      o = objects[0];
      o.componentId ??= uid();
    } else {
      o = mergeObjects(objects, 'Componente');
      o.group = context;
      project().objects = project().objects.filter((p) => !objects.includes(p));
      project().objects.push(o);
    }
    api.selectObjects([o.id]);
    api.commit('Componente vinculado creado. Ctrl+D conserva el vínculo.');
    api.render();
  };
  const insert = (entry) => {
    const p = project(),
      o = clone(entry.object),
      known = p.objects.find((o) => o.componentId === entry.object.componentId);
    if (known) {
      o.vertices = clone(known.vertices);
      o.faces = clone(known.faces);
      o.faceColors = clone(known.faceColors);
    }
    o.id = uid();
    for (const t of entry.textures || [])
      if (!p.textures.some((x) => x.id === t.id)) p.textures.push(clone(t));
    add(o);
    api.setTool('move');
    view.fit();
  };
  const actions = {
    component,
    unique() {
      const objects = selected();
      objects.forEach((o) => {
        if (!o.locked) o.componentId = null;
      });
      api.commit('Selección convertida en geometría independiente');
      api.render();
    },
    follow() {
      const objects = selected(),
        profile = objects.find((o) => o.faces.length === 1),
        path = objects.find((o) => o.kind === 'line');
      if (objects.length !== 2 || !profile || !path || objects.some((o) => o.locked))
        throw new Error('Selecciona un perfil plano y una línea de recorrido con Ctrl.');
      add(sweepProfile(profile, path));
    },
    face() {
      const objects = selected();
      if (objects.length !== 1 || objects[0].kind !== 'line' || objects[0].locked)
        throw new Error('Selecciona una línea cerrada.');
      const o = clone(objects[0]);
      if (vec(o.vertices[0]).distanceTo(vec(o.vertices.at(-1))) > 1e-5)
        throw new Error('La línea debe estar cerrada.');
      o.vertices.pop();
      o.faces = [o.vertices.map((_, i) => i)];
      o.kind = 'surface';
      const n = vec(normal(o.vertices, o.faces[0])),
        a = vec(o.vertices[0]);
      if (o.vertices.some((p) => Math.abs(vec(p).sub(a).dot(n)) > 1e-5))
        throw new Error('El contorno no es plano.');
      Object.assign(objects[0], o);
      api.commit('Cara creada');
      api.render();
    },
    reverse() {
      const sub = view.subSelection,
        o = project().objects.find((o) => o.id === sub?.id);
      if (!o || sub.type !== 'face' || o.locked)
        throw new Error('Activa Cara y selecciona una cara.');
      o.faces[sub.faceIndex].reverse();
      syncComponent(project(), o);
      api.commit('Orientación de cara invertida');
      api.render();
    },
    mirror() {
      for (const o of selected()) {
        if (o.locked) continue;
        const xs = o.vertices.map((p) => p[0]),
          center = (Math.min(...xs) + Math.max(...xs)) / 2;
        o.vertices = o.vertices.map((p) => [2 * center - p[0], p[1], p[2]]);
        o.faces = o.faces.map((f) => [...f].reverse());
        syncComponent(project(), o);
      }
      api.commit('Selección reflejada en X local');
      api.render();
    },
    async 'save-library'() {
      if (!selected().length) throw new Error('Selecciona geometría para guardar.');
      const object =
        selected().length === 1
          ? clone(selected()[0])
          : mergeObjects(selected(), 'Componente guardado');
      object.componentId ??= uid();
      object.group = null;
      object.position = [0, 0, 0];
      const entry = { id: uid(), object, textures: clone(project().textures) };
      library.push(entry);
      await window.desktop.writeLibrary(JSON.stringify(library));
      updateUI();
      api.toast('Componente guardado en la biblioteca local');
    },
  };
  document.querySelectorAll('[data-action]').forEach(
    (b) =>
      (b.onclick = safe(async () => {
        $('model-menu').hidden = true;
        api.cancelOperation();
        await actions[b.dataset.action]();
      })),
  );
  const builtins = new Map();
  document.querySelectorAll('[data-asset]').forEach(
    (b) =>
      (b.onclick = safe(() => {
        const key = b.dataset.asset;
        if (!builtins.has(key)) builtins.set(key, libraryModel(key));
        insert({ object: builtins.get(key) });
      })),
  );
  window.desktop
    .readLibrary()
    .then((entries) => {
      library = Array.isArray(entries) ? entries : [];
      updateUI();
    })
    .catch((e) => api.toast(e.message, true));
  $('apply-vertex').onclick = safe(() => {
    const sub = view.subSelection,
      o = project().objects.find((o) => o.id === sub?.id);
    if (!o || o.locked) throw new Error('Selecciona vértices, una arista o una cara.');
    const d = parseMeasures($('vertex-delta').value, project().units);
    if (d.length !== 3) throw new Error('Introduce X;Y;Z.');
    const inverse = matrixOf(o).invert(),
      delta = vec(d).transformDirection(inverse);
    const origin = vec([0, 0, 0]).applyMatrix4(inverse),
      local = vec(d).applyMatrix4(inverse).sub(origin);
    for (const i of sub.indices) o.vertices[i] = vec(o.vertices[i]).add(local).toArray();
    geometricChange(o);
    api.commit('Geometría modificada');
    api.render();
  });
  $('add-tag').onclick = () => {
    const name = $('tag-name').value.trim();
    if (!name) return;
    const id = uid();
    project().tags.push({ id, name, visible: true });
    selected().forEach((o) => {
      if (!o.locked) o.tag = id;
    });
    $('tag-name').value = '';
    api.commit('Etiqueta creada');
    api.render();
  };
  $('object-tag').onchange = () => {
    selected().forEach((o) => {
      if (!o.locked) o.tag = $('object-tag').value;
    });
    api.commit();
    api.render();
  };
  $('dimension-start').onclick = () => api.setTool('dimension');
  const section = () => {
    const axis = $('section-axis').value;
    project().section = axis
      ? {
          axis,
          value: Number($('section-value').value) * unitFactor(project().units),
          flip: $('section-flip').checked,
        }
      : null;
    api.commit();
    api.render();
  };
  $('section-axis').onchange = $('section-value').onchange = $('section-flip').onchange = section;
  $('display-style').onchange = () => {
    project().displayStyle = $('display-style').value;
    api.commit();
    api.render();
  };
  $('sun-angle').oninput = () => {
    const a = (+$('sun-angle').value * Math.PI) / 180;
    view.sun.position.set(Math.cos(a) * 15, 16, Math.sin(a) * 15);
  };
  const sheet = () =>
    technicalSheet(project(), {
      view: $('sheet-view').value,
      scale: +$('sheet-scale').value,
      paper: $('sheet-paper').value,
    });
  $('sheet-pdf').onclick = safe(async () => {
    if (await window.desktop.exportPDF(sheet(), $('sheet-paper').value))
      api.toast('Plano PDF guardado a escala');
  });
  $('sheet-svg').onclick = safe(() => window.desktop.export(sheet(), 'svg'));
  $('cad-export').onclick = safe(() => window.desktop.export(exportDXF(project()), 'dxf'));
  $('texture-picker').onchange = () => {
    textureId = $('texture-picker').value;
  };
  const applyTexture = () => {
    for (const o of selected())
      if (!o.locked) {
        o.textureId = textureId;
        o.faceTextures = {};
        o.textureScale = +$('texture-size').value || 1;
        syncComponent(project(), o);
      }
    api.commit('Textura aplicada');
    api.render();
  };
  $('texture-apply').onclick = applyTexture;
  $('texture-size').onchange = applyTexture;
  $('texture-import').onclick = safe(async () => {
    const t = await window.desktop.importTexture();
    if (!t) return;
    t.id = uid();
    project().textures.push(t);
    textureId = t.id;
    updateUI();
    applyTexture();
  });
  $('material-opacity').oninput = () => {
    selected().forEach((o) => {
      if (!o.locked) {
        o.opacity = +$('material-opacity').value;
        syncComponent(project(), o);
      }
    });
    api.render();
  };
  $('material-opacity').onchange = () => api.commit();
  const updateOptions = (el, entries, value) => {
    const signature = JSON.stringify(entries);
    if (el.dataset.signature !== signature) {
      el.replaceChildren(
        ...entries.map(([id, name]) => {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = name;
          return option;
        }),
      );
      el.dataset.signature = signature;
    }
    el.value = value;
  };
  function updateUI() {
    const p = project(),
      sub = view.subSelection,
      object = selected()[0];
    document
      .querySelectorAll('[data-mode]')
      .forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('group-context').textContent = context
      ? ' / ' + (p.groups.find((g) => g.id === context)?.name || 'Grupo')
      : '';
    $('exit-context').hidden = !context;
    $('geometry-status').textContent = sub
      ? `${sub.type === 'vertex' ? 'Vértice' : sub.type === 'edge' ? 'Arista' : 'Cara'} · ${sub.indices.length} vértices · arrastra con M / Q / S`
      : object?.componentId
        ? `Componente vinculado · ${p.objects.filter((o) => o.componentId === object.componentId).length} instancias`
        : 'Activa Vértice, Arista o Cara para editar la geometría.';
    updateOptions(
      $('object-tag'),
      [['', 'Sin etiqueta'], ...p.tags.map((t) => [t.id, t.name])],
      object?.tag || '',
    );
    updateOptions(
      $('texture-picker'),
      [
        ['', 'Sin textura'],
        ['wood', 'Madera'],
        ['brick', 'Ladrillo'],
        ['tile', 'Cerámica'],
        ['concrete', 'Hormigón'],
        ...p.textures.map((t) => [t.id, t.name]),
      ],
      textureId,
    );
    $('section-axis').value = p.section?.axis || '';
    if (document.activeElement !== $('section-value'))
      $('section-value').value = (p.section?.value ?? 1.2) / unitFactor(p.units);
    $('section-flip').checked = !!p.section?.flip;
    $('display-style').value = p.displayStyle || 'solid';
    const tags = $('tag-list');
    tags.replaceChildren();
    for (const t of p.tags) {
      const row = document.createElement('label');
      row.className = 'tag-row';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = t.visible !== false;
      check.onchange = () => {
        t.visible = check.checked;
        api.commit();
        api.render();
      };
      row.append(check, document.createTextNode(t.name));
      tags.append(row);
    }
    const dims = $('dimension-list');
    dims.replaceChildren();
    for (const d of p.dimensions) {
      const row = document.createElement('div');
      row.className = 'dimension-row';
      const g = dimensionGeometry(d, p),
        del = document.createElement('button');
      del.textContent = '×';
      del.title = 'Eliminar cota';
      del.onclick = () => {
        p.dimensions = p.dimensions.filter((x) => x !== d);
        api.commit();
        api.render();
      };
      row.append(document.createTextNode(formatLength(g.length, p.units)), del);
      dims.append(row);
    }
    const shelf = $('custom-library');
    shelf.replaceChildren();
    for (const entry of library) {
      const b = document.createElement('button');
      b.className = 'studio-button';
      b.textContent = entry.object?.name || 'Componente';
      b.onclick = safe(() => insert(entry));
      shelf.append(b);
    }
  }
  function clearOp() {
    op = null;
    axisLock = null;
    view.clearPreview();
  }
  function finishLine(close = false) {
    if (!op || op.points.length < 2) throw new Error('Marca al menos dos puntos.');
    if (close) {
      const f = op.frame,
        local = op.points.map((p) => api.toLocal(p, f)),
        o = api.transformToFrame(prism(local, 0, 'Polígono', api.getColor()), f);
      add(o);
    } else
      add(
        polyline(
          op.points.map((p) => p.toArray()),
          op.type === 'arc' ? 'Arco' : 'Línea',
          api.getColor(),
        ),
      );
    clearOp();
  }
  function pickPoint(event, frame) {
    return api.pointOnFrame(event, frame);
  }
  function anchor(point) {
    return view.lastInference?.anchor && view.lastInference.point.distanceTo(point) < 1e-5
      ? clone(view.lastInference.anchor)
      : { point: point.toArray() };
  }
  function handleClick(event, hit) {
    const tool = api.getTool();
    if (!STUDIO_TOOLS[tool]) return false;
    if (tool === 'offset') {
      if (!op) {
        if (hit?.faceIndex == null || hit.object.locked)
          throw new Error('Selecciona una cara desbloqueada.');
        op = {
          type: tool,
          object: clone(hit.object),
          faceIndex: hit.faceIndex,
          startY: event.clientY,
          distance: 0,
        };
        api.hint('Mueve para el offset · escribe distancia + Enter');
      } else if (op.distance) {
        add(offsetFace(op.object, op.faceIndex, op.distance));
        clearOp();
      }
      return true;
    }
    if (tool === 'dimension') {
      const point =
        op?.phase === 'offset'
          ? view.ray(event).intersectPlane(op.plane, new THREE.Vector3())
          : api.freePoint(event);
      if (!point) return true;
      if (!op) {
        op = { type: tool, points: [point], anchors: [anchor(point)] };
        api.hint('Marca el segundo punto de la cota');
      } else if (op.points.length === 1) {
        if (point.distanceTo(op.points[0]) < 1e-5)
          throw new Error('La cota necesita dos puntos distintos.');
        op.points.push(point);
        op.anchors.push(anchor(point));
        const direction = point.clone().sub(op.points[0]).normalize(),
          camera = view.camera.getWorldDirection(new THREE.Vector3()),
          n = new THREE.Vector3()
            .crossVectors(direction, new THREE.Vector3().crossVectors(camera, direction))
            .normalize();
        op.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, point);
        op.phase = 'offset';
        api.hint('Haz clic para colocar la línea y el texto de la cota');
      } else {
        const midpoint = op.points[0].clone().add(op.points[1]).multiplyScalar(0.5),
          direction = op.points[1].clone().sub(op.points[0]).normalize(),
          offset = point.clone().sub(midpoint);
        offset.addScaledVector(direction, -offset.dot(direction));
        project().dimensions.push({
          id: uid(),
          a: op.anchors[0],
          b: op.anchors[1],
          offset: offset.toArray(),
        });
        clearOp();
        api.commit('Cota asociativa creada');
        api.render();
        $('drawing-hint').hidden = true;
      }
      return true;
    }
    if (!op) {
      const frame = api.frameFromHit(hit),
        point = pickPoint(event, frame);
      if (point) {
        op = { type: tool, frame, points: [point], current: point };
        api.hint(
          tool === 'arc'
            ? 'Marca el extremo final del arco'
            : 'Añade puntos · Enter termina · clic en inicio cierra una cara',
        );
      }
      return true;
    }
    const point = pickPoint(event, op.frame);
    if (!point) return true;
    if (tool === 'arc') {
      if (op.points.length === 1) op.points.push(point);
      else {
        const a = api.toLocal(op.points[0], op.frame),
          b = api.toLocal(op.points[1], op.frame),
          middle = api.toLocal(point, op.frame);
        op.points = arcPoints(a, middle, b).map((p) => api.toWorld(p, op.frame));
        finishLine();
      }
      return true;
    }
    const first = view.project(op.points[0]);
    if (
      op.points.length >= 3 &&
      Math.hypot(first.x - event.clientX, first.y - event.clientY) < 12
    ) {
      finishLine(true);
      return true;
    }
    if (point.distanceTo(op.points.at(-1)) > 1e-5) op.points.push(point);
    return true;
  }
  function handleMove(event) {
    if (!op) return STUDIO_TOOLS[api.getTool()] ? true : false;
    if (document.activeElement === $('measurement-input')) return true;
    if (op.type === 'offset') {
      const pixels =
          view.element.clientHeight /
          (view.camera.position.distanceTo(view.controls.target) * 0.73),
        step = Number($('snap-size').value) * unitFactor(project().units);
      let d = (op.startY - event.clientY) / pixels;
      if ($('snap-toggle').checked) d = Math.round(d / step) * step;
      op.distance = d;
      $('measurement-input').value = Number((d / unitFactor(project().units)).toFixed(3));
      try {
        view.previewObject(offsetFace(op.object, op.faceIndex, d));
      } catch {
        view.clearPreview();
      }
      return true;
    }
    if (op.type === 'dimension') {
      const point =
        op.phase === 'offset'
          ? view.ray(event).intersectPlane(op.plane, new THREE.Vector3())
          : api.freePoint(event);
      if (point) view.previewLine([...op.points, point]);
      return true;
    }
    const point = pickPoint(event, op.frame);
    if (!point) return true;
    op.current = point;
    if (op.type === 'arc' && op.points.length === 2) {
      try {
        view.previewLine(
          arcPoints(
            api.toLocal(op.points[0], op.frame),
            api.toLocal(point, op.frame),
            api.toLocal(op.points[1], op.frame),
          ).map((p) => api.toWorld(p, op.frame)),
        );
      } catch {
        view.previewLine([...op.points, point]);
      }
    } else {
      view.previewLine([...op.points, point]);
      $('measurement-input').value = Number(
        (point.distanceTo(op.points.at(-1)) / unitFactor(project().units)).toFixed(3),
      );
    }
    return true;
  }
  function inferPoint(event, frame, point) {
    const inference = view.infer(event, frame.plane);
    if (inference && !event.altKey) {
      $('inference-label').textContent = inference.label;
      return inference.point;
    }
    const current = op || api.getOperation(),
      reference = current?.points?.at(-1);
    if (!reference) return null;
    let directions = [frame.u, frame.v];
    if (axisLock) {
      const d = vec(axisLock);
      d.addScaledVector(frame.n, -d.dot(frame.n));
      if (d.length() > 0.01) directions = [d.normalize()];
    }
    if (current.points.length > 1) {
      const previous = reference.clone().sub(current.points.at(-2)).normalize();
      directions.push(previous, new THREE.Vector3().crossVectors(frame.n, previous).normalize());
    }
    let best = null,
      distance = axisLock || event.shiftKey ? Infinity : 9;
    const delta = point.clone().sub(reference);
    for (const direction of directions) {
      const p = reference.clone().addScaledVector(direction, delta.dot(direction)),
        s = view.project(p),
        d = Math.hypot(s.x - event.clientX, s.y - event.clientY);
      if (d < distance) {
        distance = d;
        best = p;
      }
    }
    if (best) {
      $('inference-label').textContent = axisLock
        ? 'Eje bloqueado'
        : event.shiftKey
          ? 'Dirección fijada'
          : 'Alineación / perpendicular';
      return best;
    }
    return null;
  }
  async function measure(text) {
    if (op?.type === 'offset') {
      add(offsetFace(op.object, op.faceIndex, parseLength(text, project().units)));
      clearOp();
      return true;
    }
    if (op?.type === 'line') {
      const distance = parseLength(text, project().units);
      if (distance <= 0) throw new Error('La longitud debe ser positiva.');
      const direction = (op.current || op.points.at(-1).clone().add(op.frame.u))
        .clone()
        .sub(op.points.at(-1));
      if (direction.length() < 1e-7) direction.copy(op.frame.u);
      op.points.push(op.points.at(-1).clone().addScaledVector(direction.normalize(), distance));
      view.previewLine(op.points);
      $('measurement-input').value = '';
      view.canvas.focus();
      return true;
    }
    if (view.subSelection && api.getTool() === 'move') {
      $('vertex-delta').value = text;
      $('apply-vertex').click();
      return true;
    }
    return false;
  }
  function deleteGeometry() {
    const sub = view.subSelection;
    if (!sub) return false;
    const o = project().objects.find((o) => o.id === sub.id);
    if (!o || o.locked) return true;
    if (sub.type === 'edge') {
      Object.assign(o, dissolveEdge(o, sub.indices));
      syncComponent(project(), o);
      view.setSubSelection(null);
      api.commit('Arista disuelta');
      api.render();
      return true;
    }
    if (sub.type === 'face') o.faces.splice(sub.faceIndex, 1);
    else {
      const removed = new Set(sub.indices),
        remap = new Map();
      o.vertices = o.vertices.filter((_, i) => {
        if (removed.has(i)) return false;
        remap.set(i, remap.size);
        return true;
      });
      o.faces = o.faces
        .filter((f) => !f.some((i) => removed.has(i)))
        .map((f) => f.map((i) => remap.get(i)));
      project().dimensions = project().dimensions.filter((d) =>
        [d.a, d.b].every((a) => a.objectId !== o.id || !removed.has(a.vertex)),
      );
      for (const d of project().dimensions)
        for (const a of [d.a, d.b]) if (a.objectId === o.id) a.vertex = remap.get(a.vertex);
    }
    if ((!o.faces.length && o.kind !== 'line') || o.vertices.length < 2) {
      project().objects = project().objects.filter((x) => x !== o);
    } else {
      o.kind = o.kind === 'line' ? 'line' : 'mesh';
      o.closed = false;
      o.faceColors = {};
      o.faceTextures = {};
      syncComponent(project(), o);
    }
    view.setSubSelection(null);
    api.commit('Geometría eliminada');
    api.render();
    return true;
  }
  function renderTree(root) {
    const p = project();
    root.replaceChildren();
    const visit = (group, depth) => {
      for (const g of p.groups.filter((g) => (g.parent || null) === group)) {
        const label = document.createElement('div');
        label.className = 'group-label';
        label.style.paddingLeft = depth * 10 + 'px';
        label.innerHTML = icon('group');
        label.append(document.createTextNode(g.name));
        label.title = 'Clic selecciona · doble clic entra al grupo';
        label.onclick = () => api.selectObjects(groupDescendants(p, g.id).map((o) => o.id));
        label.ondblclick = () => {
          context = g.id;
          api.selectObjects([]);
          api.render();
        };
        root.append(label);
        visit(g.id, depth + 1);
      }
      for (const o of p.objects.filter((o) => (o.group || null) === group)) {
        const row = document.createElement('div');
        row.className = 'object-row' + (api.getSelected().has(o.id) ? ' selected' : '');
        row.style.paddingLeft = 5 + depth * 10 + 'px';
        row.title = o.name;
        row.innerHTML = icon(o.componentId ? 'copy' : o.kind === 'line' ? 'pen' : 'box');
        const label = document.createElement('span');
        label.className = 'object-label';
        label.textContent = o.name;
        row.append(label);
        for (const [symbol, title, prop] of [
          [o.locked ? 'lock' : 'unlock', 'Bloquear / desbloquear', 'locked'],
          [o.visible ? 'eye' : 'hidden', 'Mostrar / ocultar', 'visible'],
        ]) {
          const b = document.createElement('button');
          b.innerHTML = icon(symbol);
          b.title = title;
          b.onclick = (e) => {
            e.stopPropagation();
            o[prop] = !o[prop];
            api.commit();
            api.render();
          };
          row.append(b);
        }
        row.onclick = (e) => api.selectObject(o, e.ctrlKey);
        root.append(row);
      }
    };
    visit(null, 0);
    return true;
  }
  return {
    resetContext() {
      context = null;
      mode = 'object';
      clearOp();
      view.setSubSelection(null);
    },
    onTool() {
      clearOp();
    },
    cancel: clearOp,
    updateUI,
    renderTree,
    handleClick,
    handleMove,
    inferPoint,
    measure,
    deleteGeometry,
    onGeometryChange(o, final) {
      if (final) Object.assign(o, autofold(o));
      syncComponent(project(), o);
    },
    beforeCommit() {
      const p = project(),
        ids = new Map(p.objects.map((o) => [o.id, o]));
      p.dimensions = p.dimensions.filter((d) =>
        [d.a, d.b].every(
          (a) => !a.objectId || (ids.has(a.objectId) && ids.get(a.objectId).vertices[a.vertex]),
        ),
      );
    },
    beforeAdd(o) {
      o.group = context;
      o.textureId = textureId;
      o.textureScale = +$('texture-size').value || 1;
    },
    paint(hit, all) {
      if (all) {
        hit.object.textureId = textureId;
        hit.object.faceTextures = {};
      } else {
        hit.object.faceTextures ??= {};
        hit.object.faceTextures[hit.faceIndex] = textureId;
      }
      syncComponent(project(), hit.object);
    },
    selectGeometry(event) {
      if (mode === 'object') return false;
      const sub = view.pickElement(event, mode);
      view.setSubSelection(null);
      api.selectObjects(sub ? [sub.id] : []);
      view.setSubSelection(sub);
      updateUI();
      return true;
    },
    selectionIdsFor(o) {
      let id = o.group;
      if (!id || id === context) return [o.id];
      let g = pGroup(id);
      while (g?.parent && g.parent !== context) {
        id = g.parent;
        g = pGroup(id);
      }
      return groupDescendants(project(), id)
        .filter((o) => o.visible)
        .map((o) => o.id);
    },
    groupSelection() {
      const objects = selected();
      if (objects.length < 2) return false;
      if (objects.some((o) => o.locked)) throw new Error('Desbloquea la selección para agruparla.');
      const p = project(),
        id = uid(),
        contained = p.groups.filter(
          (g) =>
            g.parent === context && groupDescendants(p, g.id).every((o) => objects.includes(o)),
        );
      p.groups.push({ id, name: 'Grupo ' + (p.groups.length + 1), parent: context });
      for (const g of contained) g.parent = id;
      const nested = new Set(contained.flatMap((g) => groupDescendants(p, g.id).map((o) => o.id)));
      for (const o of objects) if (!nested.has(o.id)) o.group = id;
      api.commit('Grupo creado');
      api.render();
      return true;
    },
    ungroup() {
      const p = project(),
        objects = selected();
      if (objects.some((o) => o.locked)) throw new Error('Desbloquea la selección.');
      const groups = p.groups.filter(
        (g) =>
          groupDescendants(p, g.id).length &&
          groupDescendants(p, g.id).every((o) => objects.includes(o)) &&
          g.parent === context,
      );
      for (const g of groups) {
        for (const child of p.groups) if (child.parent === g.id) child.parent = g.parent;
        for (const o of p.objects) if (o.group === g.id) o.group = g.parent;
        p.groups = p.groups.filter((x) => x !== g);
      }
      if (!groups.length) objects.forEach((o) => (o.group = context));
      api.commit('Grupo separado');
      api.render();
    },
    handleKey(event) {
      if (event.key === 'Escape') {
        clearOp();
        if (context) {
          context = pGroup(context)?.parent || null;
          api.render();
        }
        return false;
      }
      if (event.key.startsWith('Arrow')) {
        axisLock = {
          ArrowRight: [1, 0, 0],
          ArrowLeft: [0, 0, 1],
          ArrowUp: [0, 1, 0],
          ArrowDown: null,
        }[event.key];
        event.preventDefault();
        return true;
      }
      if (event.key === 'Enter' && op?.type === 'line') {
        finishLine();
        return true;
      }
      if (event.key === 'Backspace' && op?.points?.length > 1) {
        op.points.pop();
        view.previewLine(op.points);
        return true;
      }
      if (
        api.getTool() === 'select' &&
        !op &&
        !api.getOperation() &&
        ['1', '2', '3', '4'].includes(event.key)
      ) {
        changeMode({ 1: 'object', 2: 'vertex', 3: 'edge', 4: 'face' }[event.key]);
        return true;
      }
      return false;
    },
    hasOperation: () => !!op,
    extrude(object, index, distance) {
      return object.kind === 'surface'
        ? pushPull(object, index, distance)
        : pullRegion(object, index, distance);
    },
    integrateExtrusion(next, before, distance) {
      const p = project(),
        host = p.objects.find((o) => o.id === before.hostId);
      if (
        !host ||
        !$('merge-drawing').checked ||
        host.locked ||
        !(host.kind === 'solid' || host.closed)
      )
        return next;
      const result = combineSolids(host, next, distance < 0 ? 'subtract' : 'union');
      if (!result)
        throw new Error('La operación eliminaría todo el objeto. Usa Sólidos si deseas hacerlo.');
      result.id = host.id;
      result.name = host.name;
      result.group = host.group;
      result.componentId = host.componentId;
      rebindAnchors(p, host, result);
      p.objects = p.objects.filter((o) => o.id !== host.id && o.id !== before.id);
      p.objects.push(result);
      syncComponent(p, result);
      return result;
    },
    importCAD: (data) =>
      importDXF(new TextDecoder().decode(new Uint8Array(data.bytes)), project().units),
    async smoke(assert) {
      const p = project();
      const model = libraryModel('chair');
      model.componentId = uid();
      p.objects.push(model);
      const copy = clone(model);
      copy.id = uid();
      copy.position[0] = 2;
      p.objects.push(copy);
      model.vertices[0][1] += 0.05;
      syncComponent(p, model);
      assert(
        'Componentes: edición sincronizada sin mover instancias',
        copy.vertices[0][1] === model.vertices[0][1] && copy.position[0] === 2,
      );
      const old = copy.vertices[0][1];
      copy.componentId = null;
      model.vertices[0][1] += 0.05;
      syncComponent(p, model);
      assert('Hacer único desvincula la geometría', copy.vertices[0][1] === old);
      p.objects = p.objects.filter((o) => o !== model && o !== copy);
      const svg = technicalSheet(p, { scale: 500 });
      assert('Lámina vectorial a escala', svg.includes('297mm') && svg.includes('1:500'));
      assert('Exportación de plano PDF real', await window.desktop.exportPDF(svg, 'A4'));
      const dxf = exportDXF(p);
      assert('Intercambio DXF', importDXF(dxf).objects.length > 0);
      const before = p.dimensions.length;
      p.dimensions.push({
        id: uid(),
        a: { objectId: p.objects[0].id, vertex: 0, point: [0, 0, 0] },
        b: { objectId: p.objects[0].id, vertex: 1, point: [0, 0, 0] },
        offset: [0, 1, 0],
      });
      api.render();
      assert(
        'Cotas renderizadas en 3D',
        view.annotations.children.some((o) => o.isSprite),
      );
      p.dimensions.splice(before);
      const host = libraryModel('planter');
      host.componentId = null;
      p.objects.push(host);
      const face = host.faces.findIndex((f) => normal(host.vertices, f)[1] > 0.99),
        offset = offsetFace(host, face, 0.05);
      assert(
        'Offset sobre cara reconoce el sólido anfitrión',
        offset.hostId === host.id && offset.kind === 'surface',
      );
      const line = polyline([
        [0, 0, 0],
        [0, 0, 2],
      ]);
      p.objects.push(line);
      api.render();
      assert('Líneas abiertas seleccionables en el visor', view.meshes.get(line.id).isLine);
      const arc = polyline(
        arcPoints([-1, 0], [0, 1], [1, 0]).map(([x, z]) => [x, 0, z]),
        'Arco',
      );
      p.objects.push(arc);
      api.render();
      assert(
        'Arco segmentado renderizado',
        view.meshes.get(arc.id).geometry.attributes.position.count === 33,
      );
      const profile = prism([
          [0, 0],
          [0.2, 0],
          [0.2, 0.2],
          [0, 0.2],
        ]),
        swept = sweepProfile(profile, line);
      p.objects.push(swept);
      api.render();
      assert(
        'Seguir recorrido crea volumen renderizado',
        view.meshes.get(swept.id).isMesh && swept.faces.length > 2,
      );
      swept.textureId = 'wood';
      swept.faceColors[0] = '#aa8844';
      api.render();
      assert(
        'Material texturizado con UV',
        !!view.meshes.get(swept.id).material[0].map &&
          view.meshes.get(swept.id).geometry.attributes.uv.count > 0,
      );
      changeMode('vertex');
      api.selectObjects([swept.id]);
      view.setSubSelection({ id: swept.id, type: 'vertex', indices: [4] });
      api.setTool('move');
      const y = swept.vertices[4][1];
      view.transform.dispatchEvent({ type: 'mouseDown' });
      view.dragging = true;
      view.pivot.position.y += 0.3;
      view.transform.dispatchEvent({ type: 'objectChange' });
      assert(
        'Manipulador modifica el vértice seleccionado',
        Math.abs(swept.vertices[4][1] - y - 0.3) < 1e-5,
      );
      assert(
        'Edición conserva los grupos de materiales',
        view.meshes
          .get(swept.id)
          .geometry.groups.every(
            (g) => g.materialIndex < view.meshes.get(swept.id).material.length,
          ),
      );
      view.transform.dispatchEvent({ type: 'mouseUp' });
      view.dragging = false;
      changeMode('object');
      p.section = { axis: 'y', value: 0.1, flip: false };
      api.render();
      assert(
        'Plano de sección aplicado a los materiales',
        view.meshes.get(swept.id).material.every((m) => m.clippingPlanes.length === 1),
      );
      p.section = null;
      const saved = JSON.stringify(p);
      await window.desktop.save(saved, false);
      const opened = await window.desktop.open();
      assert(
        'Nuevas entidades sobreviven guardado y apertura',
        JSON.parse(opened.content).objects.some((o) => o.kind === 'line') &&
          JSON.parse(opened.content).version === 2,
      );
      const cutter = offsetFace(host, face, 0.1);
      p.objects.push(cutter);
      const extrusion = pushPull(cutter, 0, -0.2),
        result = this.integrateExtrusion(extrusion, cutter, -0.2);
      assert(
        'Empujar un contorno sobre sólido crea un recorte integrado',
        result.id === host.id && !p.objects.some((o) => o.id === cutter.id),
      );
      await window.desktop.clearRecovery();
      api.selectObjects([line.id, arc.id]);
      this.groupSelection();
      api.duplicateSelection();
      assert(
        'Duplicación conserva la jerarquía de grupos',
        selected().every((o) => !o.group || p.groups.some((g) => g.id === o.group)),
      );
    },
  };
  function pGroup(id) {
    return project().groups.find((g) => g.id === id);
  }
}
