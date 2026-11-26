import {
  COLORS,
  emptyProject,
  demoProject,
  rectangle,
  circle,
  prism,
  pushPull,
  clone,
  uid,
  History,
  validateProject,
  dimensions,
  volume,
  normal,
} from './model.mjs';
import { Viewport, THREE } from './viewport.mjs';
import { icon, hydrateIcons } from './icons.mjs';
import { parseLength, parseMeasures, formatLength, unitFactor } from './measure.mjs';
import { combineSolids } from './boolean.mjs';
import { installStudio, STUDIO_TOOLS, STUDIO_HINTS } from './studio.mjs';
import { rebindAnchors, groupDescendants } from './modeling.mjs';
const $ = (id) => document.getElementById(id);
hydrateIcons();
let project = demoProject(),
  history = new History(project),
  selected = new Set(),
  tool = 'select',
  operation = null,
  hover = null;
let savedSnapshot = null,
  dirty = false,
  currentColor = COLORS[0],
  toastTimeout,
  recovery = null;
let studio;
const desktop = window.desktop;
const TOOL_NAMES = {
  select: 'Seleccionar',
  rectangle: 'Rectángulo',
  polygon: 'Línea / polígono',
  circle: 'Círculo',
  box: 'Caja 3D',
  extrude: 'Empujar / tirar',
  move: 'Mover',
  rotate: 'Rotar',
  scale: 'Escalar',
  paint: 'Material',
  erase: 'Borrar',
  measure: 'Medir',
  orbit: 'Orbitar',
};
const HINTS = {
  select: 'Haz clic en un objeto · Ctrl: selección múltiple',
  rectangle: 'Primer clic: esquina inicial · luego, esquina opuesta',
  polygon: 'Añade puntos · Enter o primer punto para cerrar · Retroceso: quitar punto',
  circle: 'Primer clic: centro · segundo clic: radio',
  box: 'Dibuja la base y después la altura · o escribe ancho;fondo;alto',
  extrude: 'Haz clic en una cara · mueve el ratón o introduce una distancia',
  move: 'Selecciona y arrastra un eje · edición exacta en Propiedades',
  rotate: 'Selecciona y arrastra los arcos · rejilla activa: saltos de 15°',
  scale: 'Selecciona y arrastra un eje o el centro del manipulador',
  paint: 'Haz clic en una cara para pintarla · Shift: objeto completo',
  erase: 'Haz clic en un objeto para eliminarlo',
  measure: 'Marca dos puntos para medir · ajuste a vértices activo',
  orbit: 'Arrastra para orbitar · rueda para acercar · derecho para desplazar',
};
Object.assign(TOOL_NAMES, STUDIO_TOOLS);
Object.assign(HINTS, STUDIO_HINTS);
function toast(message, error = false) {
  clearTimeout(toastTimeout);
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  toastTimeout = setTimeout(() => ($('toast').hidden = true), error ? 6500 : 3500);
}
function guard(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo completar la operación.', true);
    }
  };
}
const viewport = new Viewport($('viewport'), (changes, final) => {
  for (const next of changes) {
    const o = project.objects.find((o) => o.id === next.id);
    if (!o || o.locked) continue;
    if (next.vertices) {
      o.vertices = next.vertices;
      studio?.onGeometryChange(o, false);
    } else if (next.scale.every((n) => n > 0.00001)) {
      o.position = next.position;
      o.rotation = next.rotation;
      o.scale = next.scale;
    }
  }
  if (final) {
    const sub = viewport.subSelection,
      o = project.objects.find((o) => o.id === sub?.id);
    if (o) studio?.onGeometryChange(o, true);
    commit();
    render();
  } else updateProperties();
});
function serialize() {
  return JSON.stringify(project);
}
function updateDirty() {
  dirty = serialize() !== savedSnapshot;
  desktop?.dirty(dirty);
  $('saved-status').textContent = dirty ? 'Sin guardar' : 'Guardado localmente';
  document.title = `${dirty ? '• ' : ''}${project.name} — Trazo 3D`;
}
function commit(message) {
  studio?.beforeCommit();
  history.commit(project);
  updateDirty();
  updateUI();
  if (message) toast(message);
}
function render() {
  viewport.applyDocument(project);
  viewport.render(project.objects, selected);
  updateUI();
}
function updateUI() {
  $('project-name').value = project.name;
  $('units').value = project.units;
  $('position-unit').textContent =
    $('dimension-unit').textContent =
    $('measurement-unit').textContent =
      project.units;
  $('undo-button').disabled = history.index === 0;
  $('redo-button').disabled = history.index === history.states.length - 1;
  const editable = [...selected].some((id) => !project.objects.find((o) => o.id === id)?.locked);
  $('delete-button').disabled = $('duplicate-button').disabled = !editable;
  $('group-button').disabled = selected.size < 2;
  $('object-count').textContent =
    `${project.objects.filter((o) => viewport.isObjectVisible(o)).length} objetos visibles`;
  $('tree-count').textContent = project.objects.length;
  updateProperties();
  updateTree();
  updateScenes();
  syncSnap();
  studio?.updateUI();
}
function updateProperties() {
  const objects = project.objects.filter((o) => selected.has(o.id)),
    object = objects[0],
    one = objects.length === 1;
  $('empty-selection').hidden = objects.length > 0;
  $('selection-properties').hidden = !objects.length;
  $('selection-badge').textContent = !object
    ? 'Sin selección'
    : objects.length > 1
      ? `${objects.length} objetos`
      : object.locked
        ? 'Bloqueado'
        : object.kind === 'surface'
          ? 'Superficie'
          : object.kind === 'mesh'
            ? 'Malla importada'
            : 'Sólido';
  if (!object) return;
  $('object-name').value = one ? object.name : `${objects.length} objetos seleccionados`;
  $('object-name').disabled = !one || object.locked;
  const factor = unitFactor(project.units),
    d = dimensions(object);
  document.querySelectorAll('input[data-prop]').forEach((input) => {
    const axis = +input.dataset.axis,
      prop = input.dataset.prop;
    const value =
      prop === 'dimensions'
        ? d[axis] / factor
        : prop === 'rotation'
          ? (object.rotation[axis] * 180) / Math.PI
          : object.position[axis] / factor;
    if (document.activeElement !== input) input.value = Number(value.toFixed(4));
    input.disabled = !one || object.locked || (prop === 'dimensions' && d[axis] < 1e-8);
    input.step = prop === 'rotation' ? 15 : 0.1 / factor;
  });
  $('face-count').textContent = `${objects.reduce((n, o) => n + o.faces.length, 0)} caras`;
  $('volume-count').textContent =
    `${objects.reduce((n, o) => n + volume(o), 0).toLocaleString('es-CL', { maximumFractionDigits: 3 })} m³`;
  $('ungroup-button').hidden = !objects.some((o) => o.group);
}
function updateTree() {
  const root = $('object-tree');
  root.replaceChildren();
  if (studio?.renderTree(root)) return;
  if (!project.objects.length) {
    const p = document.createElement('p');
    p.className = 'small-note';
    p.style.padding = '8px 10px';
    p.textContent = 'Tu próximo modelo empieza aquí.';
    root.append(p);
    return;
  }
  const grouped = new Map();
  for (const object of project.objects) {
    const key = object.group || object.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(object);
  }
  let groupNumber = 0;
  for (const objects of grouped.values()) {
    if (objects[0].group) {
      const label = document.createElement('div');
      label.className = 'group-label';
      label.innerHTML = icon('group');
      label.append(document.createTextNode(`Grupo ${++groupNumber} · ${objects.length} objetos`));
      label.onclick = () => selectObjects(objects.map((o) => o.id));
      root.append(label);
    }
    for (const object of objects) {
      const row = document.createElement('div');
      row.className =
        'object-row' +
        (selected.has(object.id) ? ' selected' : '') +
        (object.locked ? ' locked' : '') +
        (!object.visible ? ' hidden-object' : '');
      row.dataset.id = object.id;
      row.title = object.name;
      row.innerHTML = icon(
        object.group ? 'group' : object.kind === 'surface' ? 'rectangle' : 'box',
      );
      const color = document.createElement('span');
      color.className = 'object-color';
      color.style.backgroundColor = object.color;
      row.append(color);
      const label = document.createElement('span');
      label.className = 'object-label';
      label.textContent = object.name;
      row.append(label);
      const button = (name, title, action) => {
        const b = document.createElement('button');
        b.innerHTML = icon(name);
        b.title = title;
        b.setAttribute('aria-label', title);
        b.onclick = (event) => {
          event.stopPropagation();
          action();
        };
        row.append(b);
        return b;
      };
      button(object.locked ? 'lock' : 'unlock', object.locked ? 'Desbloquear' : 'Bloquear', () => {
        cancelOperation();
        object.locked = !object.locked;
        viewport.updateManipulator();
        commit();
      });
      button(object.visible ? 'eye' : 'hidden', object.visible ? 'Ocultar' : 'Mostrar', () => {
        cancelOperation();
        object.visible = !object.visible;
        if (!object.visible) selected.delete(object.id);
        commit();
        render();
      });
      row.onclick = (event) => selectObject(object, event.ctrlKey || event.metaKey);
      row.ondblclick = () => {
        selectObjects([object.id]);
        $('object-name').focus();
        $('object-name').select();
      };
      root.append(row);
    }
  }
}
function updateScenes() {
  const root = $('scene-list');
  root.replaceChildren();
  if (!project.scenes.length) {
    const note = document.createElement('span');
    note.className = 'small-note';
    note.textContent = 'Guarda tus puntos de vista favoritos.';
    root.append(note);
  }
  project.scenes.forEach((scene, index) => {
    const chip = document.createElement('div');
    chip.className = 'scene-chip';
    const name = document.createElement('span');
    name.textContent = scene.name;
    name.onclick = () => {
      cancelOperation();
      if (scene.ortho != null && !!viewport.ortho !== scene.ortho) viewport.projection();
      viewport.camera.position.fromArray(scene.position);
      viewport.controls.target.fromArray(scene.target);
      if (scene.section !== undefined) project.section = clone(scene.section);
      if (scene.hidden) project.objects.forEach((o) => (o.visible = !scene.hidden.includes(o.id)));
      if (scene.hiddenTags)
        project.tags.forEach((t) => (t.visible = !scene.hiddenTags.includes(t.id)));
      if (scene.style) project.displayStyle = scene.style;
      viewport.controls.update();
      render();
    };
    const del = document.createElement('button');
    del.textContent = '×';
    del.title = 'Eliminar escena';
    del.onclick = () => {
      project.scenes.splice(index, 1);
      commit();
    };
    chip.append(name, del);
    root.append(chip);
  });
}
function selectObjects(ids) {
  selected = new Set(ids.filter((id) => project.objects.some((o) => o.id === id)));
  if (viewport.subSelection && !selected.has(viewport.subSelection.id))
    viewport.setSubSelection(null);
  viewport.updateSelection(selected);
  updateUI();
}
function selectObject(object, additive = false) {
  const ids = studio
    ? studio.selectionIdsFor(object)
    : object.group
      ? project.objects.filter((o) => o.group === object.group && o.visible).map((o) => o.id)
      : [object.id];
  if (additive) {
    const all = ids.every((id) => selected.has(id));
    ids.forEach((id) => (all ? selected.delete(id) : selected.add(id)));
    selectObjects([...selected]);
  } else selectObjects(ids);
}
function setTool(next) {
  cancelOperation();
  tool = next;
  studio?.onTool(next);
  viewport.setTool(next);
  document
    .querySelectorAll('[data-tool]')
    .forEach((b) => b.classList.toggle('active', b.dataset.tool === next));
  $('tool-name').textContent = TOOL_NAMES[next];
  $('status-hint').textContent = HINTS[next];
  $('active-tool-icon').innerHTML = icon(
    next === 'polygon'
      ? 'pen'
      : next === 'select'
        ? 'cursor'
        : next === 'measure'
          ? 'ruler'
          : next === 'erase'
            ? 'eraser'
            : next === 'paint'
              ? 'paint'
              : next,
  );
  $('measurement-label').textContent =
    next === 'extrude'
      ? 'Distancia'
      : next === 'circle'
        ? 'Radio'
        : next === 'box'
          ? 'L × P × H'
          : next === 'rectangle'
            ? 'L × P'
            : 'Medidas';
  $('measurement-input').placeholder =
    {
      rectangle: '4;3',
      box: '4;3;2.8',
      circle: 'Radio, por ej. 1.5m',
      extrude: 'Distancia, por ej. 2.8m',
      move: 'X;Y;Z (desplazamiento)',
      rotate: 'Rotación Y en grados',
      scale: 'Factor, por ej. 1.5',
    }[next] || 'Introduce una medida…';
  viewport.canvas.focus();
}
function cancelOperation() {
  studio?.cancel();
  if (operation?.type === 'extrude' && operation.before) {
    const i = project.objects.findIndex((o) => o.id === operation.before.id);
    if (i >= 0) project.objects[i] = operation.before;
    viewport.render(project.objects, selected);
  }
  operation = null;
  hover = null;
  viewport.clearPreview();
  viewport.clearHighlight();
  $('drawing-hint').hidden = true;
  $('inference-label').textContent = '';
  $('measurement-input').value = '';
}
function syncSnap() {
  viewport.setSnap(
    $('snap-toggle').checked ? Number($('snap-size').value) * unitFactor(project.units) : null,
  );
}
function frameFromHit(hit) {
  let n = new THREE.Vector3(0, 1, 0),
    origin = new THREE.Vector3(0, 0, 0);
  if (hit?.faceIndex != null && $('surface-toggle').checked) {
    n = hit.normal.clone();
    origin = hit.point.clone();
  }
  const u =
    Math.abs(n.y) > 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
  const v = new THREE.Vector3().crossVectors(u, n).normalize();
  return {
    n,
    u,
    v,
    origin,
    hostId: hit?.faceIndex != null && $('surface-toggle').checked ? hit.object.id : null,
    plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, origin),
  };
}
function toLocal(p, frame) {
  const d = p.clone().sub(frame.origin);
  return [d.dot(frame.u), d.dot(frame.v)];
}
function toWorld(p, frame) {
  return frame.origin.clone().addScaledVector(frame.u, p[0]).addScaledVector(frame.v, p[1]);
}
function pointOnFrame(event, frame, infer = true) {
  const point = viewport.ray(event).intersectPlane(frame.plane, new THREE.Vector3());
  if (!point) return null;
  const inferred = infer && studio?.inferPoint(event, frame, point);
  if (inferred) return inferred;
  const vertex = infer && viewport.nearestVertex(event, frame.plane);
  if (vertex) {
    $('inference-label').textContent = '● Vértice';
    return vertex;
  }
  $('inference-label').textContent = '';
  if ($('snap-toggle').checked && !event.altKey) {
    const step = +$('snap-size').value * unitFactor(project.units);
    if (step > 0) {
      const local = toLocal(point, frame);
      point.copy(
        toWorld(
          local.map((v) => Math.round(v / step) * step),
          frame,
        ),
      );
      $('inference-label').textContent = 'Rejilla';
    }
  }
  return point;
}
function freePoint(event) {
  const inference = viewport.infer(event);
  if (inference) {
    $('inference-label').textContent = inference.label;
    return inference.point;
  }
  const vertex = viewport.nearestVertex(event);
  if (vertex) {
    $('inference-label').textContent = '● Vértice';
    return vertex;
  }
  const hit = viewport.pick(event);
  if (hit) return hit.point;
  return pointOnFrame(event, frameFromHit(null));
}
function transformToFrame(object, frame) {
  const matrix = new THREE.Matrix4().makeBasis(frame.u, frame.n, frame.v);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix),
    euler = new THREE.Euler().setFromQuaternion(quaternion);
  object.position = frame.origin.toArray();
  object.rotation = [euler.x, euler.y, euler.z];
  if (frame.hostId) object.hostId = frame.hostId;
  return object;
}
function hint(text) {
  $('drawing-hint').textContent = text;
  $('drawing-hint').hidden = false;
}
function addObject(object, message = 'Objeto creado') {
  studio?.beforeAdd(object);
  viewport.setSubSelection(null);
  object.name += ' ' + (project.objects.filter((o) => o.name.startsWith(object.name)).length + 1);
  project.objects.push(object);
  selected = new Set([object.id]);
  operation = null;
  viewport.clearPreview();
  $('drawing-hint').hidden = true;
  $('measurement-input').value = '';
  commit(message);
  render();
}
function shapeForOperation(op, endpoint = op.current, height = 0) {
  const a = toLocal(op.points[0], op.frame),
    b = toLocal(endpoint || op.points[0], op.frame);
  let object;
  if (op.type === 'circle')
    object = circle(a, Math.hypot(b[0] - a[0], b[1] - a[1]), height, 48, currentColor);
  else if (op.type === 'polygon')
    object = prism(
      op.points.map((p) => toLocal(p, op.frame)),
      height,
      'Polígono',
      currentColor,
    );
  else object = rectangle(a, b, height, op.type === 'box' ? 'Caja' : 'Rectángulo', currentColor);
  return transformToFrame(object, op.frame);
}
function preciseShape(values) {
  if (!operation?.points?.length) throw new Error('Marca primero el punto de inicio en el visor.');
  const op = operation,
    a = toLocal(op.points[0], op.frame);
  let object;
  if (op.type === 'circle') {
    if (values.length !== 1 || values[0] <= 0) throw new Error('Introduce un radio positivo.');
    object = transformToFrame(circle(a, values[0], 0, 48, currentColor), op.frame);
  } else if (['rectangle', 'box'].includes(op.type)) {
    if (values.length < 2) {
      if (op.type === 'box' && op.phase === 'height' && values[0] > 0)
        return addObject(shapeForOperation(op, op.baseEnd, values[0]));
      throw new Error('Introduce ancho;fondo o ancho;fondo;alto.');
    }
    if (
      values.some((v) => v <= 0) ||
      values.length > 3 ||
      (op.type === 'rectangle' && values.length !== 2)
    )
      throw new Error('Usa medidas positivas separadas por punto y coma.');
    const b = [a[0] + values[0], a[1] + values[1]];
    object = transformToFrame(
      rectangle(a, b, values[2] || 0, op.type === 'box' ? 'Caja' : 'Rectángulo', currentColor),
      op.frame,
    );
    if (op.type === 'box' && values.length === 2) {
      op.baseEnd = toWorld(b, op.frame);
      op.phase = 'height';
      hint('Base lista. Introduce la altura y pulsa Enter.');
      return;
    }
  } else throw new Error('Termina el polígono con Enter.');
  addObject(object);
}
function applyExtrude(distance) {
  if (!operation || operation.type !== 'extrude')
    throw new Error('Selecciona una cara con Empujar / tirar.');
  const before = operation.before;
  let next = studio
    ? studio.extrude(before, operation.faceIndex, distance / operation.worldScale)
    : pushPull(before, operation.faceIndex, distance / operation.worldScale);
  next = studio?.integrateExtrusion(next, before, distance) || next;
  const i = project.objects.findIndex((o) => o.id === next.id);
  if (i >= 0) project.objects[i] = next;
  studio?.onGeometryChange(next, true);
  selected = new Set([next.id]);
  operation = null;
  viewport.clearPreview();
  $('drawing-hint').hidden = true;
  $('measurement-input').value = '';
  commit('Extrusión: ' + formatLength(distance, project.units));
  render();
}
function previewExtrude(event) {
  const op = operation,
    direction = op.screenDirection;
  let distance =
    ((event.clientX - op.startX) * direction.x + (event.clientY - op.startY) * direction.y) /
    op.pixelsPerUnit;
  if ($('snap-toggle').checked && !event.altKey) {
    const step = +$('snap-size').value * unitFactor(project.units);
    distance = Math.round(distance / step) * step;
  }
  op.distance = distance;
  $('measurement-input').value = Number((distance / unitFactor(project.units)).toFixed(3));
  if (Math.abs(distance) < 1e-6) return;
  try {
    const next = studio
      ? studio.extrude(op.before, op.faceIndex, distance / op.worldScale)
      : pushPull(op.before, op.faceIndex, distance / op.worldScale);
    viewport.previewObject(next);
    op.valid = true;
  } catch {
    viewport.clearPreview();
    op.valid = false;
  }
}
let pointerDown = null;
viewport.canvas.addEventListener('pointerdown', (event) => {
  if (event.button === 0)
    pointerDown = {
      x: event.clientX,
      y: event.clientY,
      dragging: viewport.dragging,
      axis: viewport.transform.axis,
    };
});
viewport.canvas.addEventListener(
  'pointerup',
  guard((event) => {
    if (event.button !== 0 || !pointerDown) return;
    const down = pointerDown;
    pointerDown = null;
    if (
      down.dragging ||
      down.axis ||
      viewport.dragging ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5 ||
      tool === 'orbit'
    )
      return;
    const hit = viewport.pick(event);
    $('start-card').hidden = true;
    if (studio?.handleClick(event, hit)) return;
    if (['select', 'move', 'rotate', 'scale'].includes(tool)) {
      if (studio?.selectGeometry(event)) return;
      if (hit) selectObject(hit.object, event.ctrlKey || event.metaKey);
      else if (!event.ctrlKey) selectObjects([]);
      return;
    }
    if (tool === 'erase') {
      if (hit && !hit.object.locked) {
        selectObject(hit.object);
        deleteSelection();
      } else if (hit) toast('Desbloquea el objeto para editarlo.');
      return;
    }
    if (tool === 'paint') {
      if (!hit) return;
      if (hit.object.locked) return toast('Desbloquea el objeto para editarlo.');
      if (event.shiftKey) {
        hit.object.color = currentColor;
        hit.object.faceColors = {};
      } else hit.object.faceColors[hit.faceIndex] = currentColor;
      studio?.paint(hit, event.shiftKey);
      commit('Material aplicado');
      render();
      return;
    }
    if (tool === 'extrude') {
      if (operation?.type === 'extrude') {
        if (operation.distance && operation.valid) applyExtrude(operation.distance);
        return;
      }
      if (hit?.faceIndex == null) return;
      if (hit.object.locked) return toast('Desbloquea el objeto para editarlo.');
      selectObject(hit.object);
      const worldNormal = new THREE.Vector3(
        ...normal(hit.object.vertices, hit.object.faces[hit.faceIndex]),
      )
        .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.mesh.matrixWorld))
        .normalize();
      const p1 = viewport.project(hit.point),
        p2 = viewport.project(hit.point.clone().add(worldNormal));
      let dx = p2.x - p1.x,
        dy = p2.y - p1.y,
        pixels = Math.hypot(dx, dy);
      if (pixels < 8) {
        dx = 0;
        dy = -80;
        pixels = 80;
      }
      const localNormal = new THREE.Vector3(
        ...normal(hit.object.vertices, hit.object.faces[hit.faceIndex]),
      );
      const worldScale = localNormal.multiply(new THREE.Vector3(...hit.object.scale)).length();
      operation = {
        type: 'extrude',
        before: clone(hit.object),
        faceIndex: hit.faceIndex,
        startX: event.clientX,
        startY: event.clientY,
        screenDirection: { x: dx / pixels, y: dy / pixels },
        pixelsPerUnit: pixels,
        worldScale,
        distance: 0,
        valid: false,
      };
      viewport.highlight(hit);
      hint('Mueve el ratón para extruir · clic para confirmar · o escribe distancia + Enter');
      return;
    }
    if (tool === 'measure') {
      const point = freePoint(event);
      if (!point) return;
      if (!operation) {
        operation = { type: 'measure', points: [point] };
        hint('Marca el segundo punto');
      } else {
        const length = operation.points[0].distanceTo(point);
        viewport.previewLine([operation.points[0], point]);
        $('measurement-input').value = formatLength(length, project.units);
        toast('Distancia: ' + formatLength(length, project.units));
        operation = null;
        $('drawing-hint').hidden = true;
      }
      return;
    }
    if (!operation) {
      const frame = frameFromHit(hit),
        point = pointOnFrame(event, frame);
      if (!point) return;
      operation = { type: tool, frame, points: [point], current: point, phase: 'base' };
      viewport.previewLine([point]);
      hint(
        tool === 'polygon'
          ? 'Añade vértices · cierra con Enter o con el primer punto'
          : 'Marca el segundo punto · o escribe las medidas y pulsa Enter',
      );
      return;
    }
    const op = operation;
    if (op.type === 'box' && op.phase === 'height') {
      if (op.height > 0) addObject(shapeForOperation(op, op.baseEnd, op.height));
      return;
    }
    const point = pointOnFrame(event, op.frame);
    if (!point) return;
    op.current = point;
    if (tool === 'polygon') {
      const start = viewport.project(op.points[0]);
      if (
        op.points.length >= 3 &&
        Math.hypot(start.x - event.clientX, start.y - event.clientY) < 12
      ) {
        addObject(shapeForOperation(op));
        return;
      }
      if (point.distanceTo(op.points.at(-1)) > 0.00001) op.points.push(point);
      return;
    }
    if (tool === 'box') {
      shapeForOperation(op, point);
      op.phase = 'height';
      op.baseEnd = point;
      op.startY = event.clientY;
      op.height = 0;
      const a = viewport.project(point),
        b = viewport.project(point.clone().add(op.frame.n));
      op.pixels = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 20);
      hint('Base lista · mueve hacia arriba para la altura · o escribe altura + Enter');
      return;
    }
    addObject(shapeForOperation(op, point));
  }),
);
viewport.canvas.addEventListener('pointermove', (event) => {
  try {
    if (viewport.dragging) return;
    if (studio?.handleMove(event)) return;
    if (operation && document.activeElement === $('measurement-input')) return;
    if (operation?.type === 'extrude') {
      previewExtrude(event);
      return;
    }
    if (operation?.type === 'measure') {
      const point = freePoint(event);
      if (point) {
        viewport.previewLine([operation.points[0], point]);
        $('measurement-input').value = formatLength(
          point.distanceTo(operation.points[0]),
          project.units,
        );
      }
      return;
    }
    if (operation) {
      const op = operation;
      if (op.phase === 'height') {
        let height = Math.max(0.01, (op.startY - event.clientY) / op.pixels);
        const step = +$('snap-size').value * unitFactor(project.units);
        if ($('snap-toggle').checked && step > 0)
          height = Math.max(step, Math.round(height / step) * step);
        op.height = height;
        viewport.previewObject(shapeForOperation(op, op.baseEnd, height));
        $('measurement-input').value = Number((height / unitFactor(project.units)).toFixed(3));
        return;
      }
      const point = pointOnFrame(event, op.frame);
      if (!point) return;
      op.current = point;
      if (op.type === 'polygon') viewport.previewLine([...op.points, point]);
      else {
        const a = toLocal(op.points[0], op.frame),
          b = toLocal(point, op.frame);
        try {
          viewport.previewObject(shapeForOperation(op, point));
        } catch {
          viewport.previewLine([op.points[0], point]);
        }
        $('measurement-input').value =
          op.type === 'circle'
            ? Number((Math.hypot(a[0] - b[0], a[1] - b[1]) / unitFactor(project.units)).toFixed(3))
            : [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]
                .map((n) => Number((n / unitFactor(project.units)).toFixed(3)))
                .join(';');
      }
      return;
    }
    if (['extrude', 'paint', 'erase'].includes(tool)) {
      const hit = viewport.pick(event);
      if (hit?.object.id !== hover?.object.id || hit?.faceIndex !== hover?.faceIndex) {
        hover = hit;
        viewport.highlight(hit);
      }
    }
  } catch (error) {
    console.debug(error.message);
  }
});
viewport.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
viewport.canvas.addEventListener(
  'dblclick',
  guard(() => {
    if (tool === 'polygon' && operation?.points.length >= 3)
      addObject(shapeForOperation(operation));
  }),
);
function deleteSelection() {
  if (studio?.deleteGeometry()) return;
  cancelOperation();
  const ids = new Set(
    [...selected].filter((id) => !project.objects.find((o) => o.id === id)?.locked),
  );
  if (!ids.size) return;
  project.objects = project.objects.filter((o) => !ids.has(o.id));
  selected = new Set();
  commit(`${ids.size} objeto(s) eliminado(s)`);
  render();
}
function duplicateSelection() {
  cancelOperation();
  viewport.setSubSelection(null);
  const objects = project.objects.filter((o) => selected.has(o.id) && !o.locked);
  if (!objects.length) return;
  const groups = new Map(),
    copies = objects.map((object) => {
      const c = clone(object);
      c.id = uid();
      c.name += ' · copia';
      c.position[0] += 0.5;
      c.position[2] += 0.5;
      if (c.group) {
        if (!groups.has(c.group)) groups.set(c.group, uid());
        c.group = groups.get(c.group);
      }
      return c;
    });
  for (const [id] of groups) {
    const g = project.groups.find((g) => g.id === id);
    if (
      g?.parent &&
      groupDescendants(project, g.parent).every((o) => objects.includes(o)) &&
      !groups.has(g.parent)
    )
      groups.set(g.parent, uid());
  }
  for (const [id, nextId] of groups) {
    const g = project.groups.find((g) => g.id === id);
    project.groups.push({
      id: nextId,
      name: (g?.name || 'Grupo') + ' · copia',
      parent: g?.parent ? groups.get(g.parent) || g.parent : null,
    });
  }
  project.objects.push(...copies);
  selected = new Set(copies.map((o) => o.id));
  commit('Selección duplicada');
  render();
}
function groupSelection() {
  cancelOperation();
  if (studio?.groupSelection()) return;
  const objects = project.objects.filter((o) => selected.has(o.id));
  if (objects.length < 2) return toast('Selecciona dos o más objetos con Ctrl.');
  if (objects.some((o) => o.locked)) return toast('Desbloquea los objetos antes de agruparlos.');
  const group = uid();
  objects.forEach((o) => (o.group = group));
  commit('Objetos agrupados');
  render();
}
function undo() {
  cancelOperation();
  const state = history.undo();
  if (state) {
    project = state;
    selectObjects([...selected]);
    updateDirty();
    render();
  }
}
function redo() {
  cancelOperation();
  const state = history.redo();
  if (state) {
    project = state;
    selectObjects([...selected]);
    updateDirty();
    render();
  }
}
async function save(saveAs = false) {
  cancelOperation();
  const result = await desktop.save(serialize(), saveAs);
  if (!result) return false;
  savedSnapshot = serialize();
  updateDirty();
  await desktop.clearRecovery();
  toast('Proyecto guardado en ' + result.path);
  return true;
}
async function mayReplace() {
  cancelOperation();
  if (!dirty) return true;
  const dialog = $('confirm-dialog');
  dialog.showModal();
  const answer = await new Promise((resolve) => {
    const click = (event) => {
      const a = event.target.closest('[data-answer]');
      if (!a) return;
      dialog.removeEventListener('click', click);
      dialog.removeEventListener('cancel', cancel);
      dialog.close();
      resolve(a.dataset.answer);
    };
    const cancel = () => {
      dialog.removeEventListener('click', click);
      dialog.removeEventListener('cancel', cancel);
      resolve('cancel');
    };
    dialog.addEventListener('click', click);
    dialog.addEventListener('cancel', cancel);
  });
  if (answer === 'save') return save();
  return answer === 'discard';
}
async function replaceProject(next, isSaved = false) {
  cancelOperation();
  project = next;
  studio?.resetContext();
  selected = new Set();
  history = new History(project);
  savedSnapshot = isSaved ? serialize() : null;
  await desktop.reset();
  updateDirty();
  render();
  viewport.fit();
  $('start-card').hidden = next.objects.length > 0;
}
async function openProject() {
  if (!(await mayReplace())) return;
  const result = await desktop.open();
  if (!result) return;
  const next = validateProject(JSON.parse(result.content));
  await replaceProject(next, true);
  await desktop.accept(result.path);
  await desktop.clearRecovery();
  toast('Proyecto abierto');
}
async function exportFile(format) {
  cancelOperation();
  $('export-menu').hidden = true;
  if (!project.objects.some((o) => o.visible) && format !== 'png')
    return toast('No hay objetos visibles para exportar.');
  const content = format === 'png' ? viewport.image() : viewport.export(format);
  if (await desktop.export(content, format))
    toast('Exportación ' + format.toUpperCase() + ' guardada');
}
async function importMesh() {
  $('export-menu').hidden = true;
  cancelOperation();
  const data = await desktop.importMesh();
  if (!data) return;
  const imported = data.extension === '.dxf' ? studio.importCAD(data) : null,
    objects = imported ? imported.objects : viewport.importMesh(data);
  validateProject({ ...emptyProject(), objects });
  project.objects.push(...objects);
  selected = new Set(objects.map((o) => o.id));
  commit(
    imported
      ? `DXF importado · ${imported.skipped} entidades no compatibles omitidas`
      : 'Malla importada · unidades en metros',
  );
  render();
  viewport.fit();
}
studio = installStudio({
  viewport,
  getProject: () => project,
  getSelected: () => selected,
  getTool: () => tool,
  getColor: () => currentColor,
  getOperation: () => operation,
  setTool,
  selectObjects,
  selectObject,
  commit,
  render,
  addObject,
  toast,
  hint,
  cancelOperation,
  freePoint,
  pointOnFrame,
  frameFromHit,
  toLocal,
  toWorld,
  transformToFrame,
  duplicateSelection,
});
document
  .querySelectorAll('[data-tool]')
  .forEach((button) => (button.onclick = () => setTool(button.dataset.tool)));
document.querySelectorAll('[data-view]').forEach(
  (button) =>
    (button.onclick = () => {
      cancelOperation();
      viewport.view(button.dataset.view);
      document
        .querySelectorAll('[data-view]')
        .forEach((b) => b.classList.toggle('active', b === button));
      $('view-name').textContent = button.textContent;
    }),
);
$('measurement-input').addEventListener(
  'keydown',
  guard(async (event) => {
    if (event.key === 'Escape') {
      setTool('select');
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const text = event.target.value.trim();
    if (await studio.measure(text)) {
      viewport.canvas.focus();
      return;
    }
    if (tool === 'polygon' && operation?.points.length >= 3) {
      addObject(shapeForOperation(operation));
      viewport.canvas.focus();
      return;
    }
    const values = parseMeasures(text, project.units);
    if (operation?.type === 'extrude') {
      if (values.length !== 1) throw new Error('Introduce una sola distancia.');
      applyExtrude(values[0]);
    } else if (['rectangle', 'circle', 'box'].includes(tool)) preciseShape(values);
    else if (['move', 'rotate', 'scale'].includes(tool)) {
      const objects = project.objects.filter((o) => selected.has(o.id) && !o.locked);
      if (!objects.length) throw new Error('Selecciona al menos un objeto.');
      if (tool === 'move') {
        if (values.length !== 3) throw new Error('Introduce desplazamiento X;Y;Z.');
        objects.forEach((o) => (o.position = o.position.map((v, i) => v + values[i])));
      } else if (tool === 'rotate') {
        const angle = Number(text.replace(',', '.'));
        if (!Number.isFinite(angle)) throw new Error('Introduce un ángulo en grados.');
        objects.forEach((o) => (o.rotation[1] += (angle * Math.PI) / 180));
      } else {
        const factor = Number(text.replace(',', '.'));
        if (!Number.isFinite(factor) || factor <= 0 || factor > 1000)
          throw new Error('Introduce un factor positivo menor que 1000.');
        objects.forEach((o) => (o.scale = o.scale.map((v) => v * factor)));
      }
      commit();
      render();
    }
    viewport.canvas.focus();
  }),
);
$('project-name').onchange = () => {
  project.name = $('project-name').value.trim() || 'Sin título';
  commit();
};
$('object-name').onchange = () => {
  const object = project.objects.find((o) => selected.has(o.id));
  if (object && !object.locked) {
    object.name = $('object-name').value.trim() || 'Objeto';
    commit();
  }
};
document.querySelectorAll('input[data-prop]').forEach(
  (input) =>
    (input.onchange = guard(() => {
      const object = project.objects.find((o) => selected.has(o.id));
      if (!object || object.locked) return;
      const axis = +input.dataset.axis,
        prop = input.dataset.prop,
        value = Number(input.value);
      if (!Number.isFinite(value) || Math.abs(value) > 1000000)
        throw new Error('Valor fuera de rango.');
      if (prop === 'dimensions') {
        const d = dimensions(object);
        if (value <= 0 || d[axis] < 1e-8) {
          updateProperties();
          throw new Error('La dimensión debe ser mayor que cero.');
        }
        object.scale[axis] *= (value * unitFactor(project.units)) / d[axis];
      } else
        object[prop][axis] =
          prop === 'rotation' ? (value * Math.PI) / 180 : value * unitFactor(project.units);
      commit();
      render();
    })),
);
const materialNames = [
  'Arena',
  'Tiza',
  'Hormigón',
  'Madera',
  'Salvia',
  'Terracota',
  'Pizarra',
  'Latón',
  'Grafito',
  'Cielo',
  'Malva',
  'Arcilla',
];
COLORS.forEach((color, i) => {
  const b = document.createElement('button');
  b.className = 'swatch' + (i === 0 ? ' active' : '');
  b.style.backgroundColor = color;
  b.title = materialNames[i];
  b.setAttribute('aria-label', materialNames[i]);
  b.dataset.color = color;
  b.onclick = () => {
    currentColor = color;
    $('custom-color').value = color;
    $('material-name').textContent = materialNames[i];
    document.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s === b));
    if (selected.size) applyColor();
    else setTool('paint');
  };
  $('material-swatches').append(b);
});
function applyColor() {
  cancelOperation();
  const objects = project.objects.filter((o) => selected.has(o.id) && !o.locked);
  if (!objects.length) {
    setTool('paint');
    return;
  }
  objects.forEach((o) => {
    o.color = currentColor;
    o.faceColors = {};
    studio.paint({ object: o }, true);
  });
  commit('Material aplicado a la selección');
  render();
}
$('custom-color').oninput = (event) => {
  currentColor = event.target.value;
  $('material-name').textContent = 'Personalizado';
  document.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
};
$('apply-color').onclick = applyColor;
$('ungroup-button').onclick = guard(() => studio.ungroup());
$('units').onchange = () => {
  project.units = $('units').value;
  commit();
};
$('snap-toggle').onchange = syncSnap;
$('snap-size').onchange = () => {
  if (!(+$('snap-size').value > 0)) $('snap-size').value = 0.1;
  syncSnap();
};
$('new-button').onclick = guard(async () => {
  if (await mayReplace()) {
    await replaceProject(emptyProject());
    await desktop.clearRecovery();
    toast('Proyecto nuevo · R para dibujar');
  }
});
$('demo-button').onclick = guard(async () => {
  if (await mayReplace()) {
    await replaceProject(demoProject());
    await desktop.clearRecovery();
  }
});
$('open-button').onclick = guard(openProject);
$('save-button').onclick = guard(() => save());
$('save-as-button').onclick = guard(() => {
  $('export-menu').hidden = true;
  return save(true);
});
$('export-button').onclick = () => ($('export-menu').hidden = !$('export-menu').hidden);
document
  .querySelectorAll('[data-export]')
  .forEach((b) => (b.onclick = guard(() => exportFile(b.dataset.export))));
$('import-button').onclick = guard(importMesh);
$('solids-button').onclick = () => ($('solids-menu').hidden = !$('solids-menu').hidden);
document.querySelectorAll('[data-boolean]').forEach(
  (button) =>
    (button.onclick = guard(async () => {
      $('solids-menu').hidden = true;
      cancelOperation();
      const objects = [...selected].map((id) => project.objects.find((o) => o.id === id));
      if (objects.length !== 2)
        throw new Error(
          'Selecciona primero A y después B con Ctrl. Se necesitan exactamente dos sólidos.',
        );
      if (objects.some((o) => o.locked || !o.visible))
        throw new Error('Los dos sólidos deben estar visibles y desbloqueados.');
      hint('Combinando sólidos…');
      await new Promise((resolve) => setTimeout(resolve, 30));
      let result;
      try {
        result = combineSolids(objects[0], objects[1], button.dataset.boolean);
      } finally {
        $('drawing-hint').hidden = true;
      }
      if (result) objects.forEach((o) => rebindAnchors(project, o, result));
      project.objects = project.objects.filter((o) => !selected.has(o.id));
      if (result) project.objects.push(result);
      selected = new Set(result ? [result.id] : []);
      commit(
        result
          ? 'Sólidos combinados · puedes deshacer con Ctrl+Z'
          : 'La operación produjo un volumen vacío',
      );
      render();
    })),
);
$('undo-button').onclick = undo;
$('redo-button').onclick = redo;
$('delete-button').onclick = deleteSelection;
$('duplicate-button').onclick = duplicateSelection;
$('group-button').onclick = groupSelection;
$('fit-button').onclick = () => {
  cancelOperation();
  viewport.fit();
};
$('grid-toggle').onclick = () => {
  viewport.grid.visible = !viewport.grid.visible;
  viewport.axes.visible = viewport.grid.visible;
  $('grid-toggle').classList.toggle('active', viewport.grid.visible);
};
$('edges-toggle').onclick = () => {
  viewport.edgesVisible = !viewport.edgesVisible;
  $('edges-toggle').classList.toggle('active', viewport.edgesVisible);
  render();
};
$('shadows-toggle').onclick = () => {
  viewport.sun.castShadow = !viewport.sun.castShadow;
  $('shadows-toggle').classList.toggle('active', viewport.sun.castShadow);
  viewport.scene.traverse((o) => {
    if (o.material)
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(
        (m) => (m.needsUpdate = true),
      );
  });
};
$('projection-toggle').onclick = () => {
  const ortho = viewport.projection();
  $('projection-toggle').classList.toggle('active', ortho);
  $('projection-toggle').title = ortho ? 'Cambiar a perspectiva' : 'Cambiar a ortográfica';
};
$('dismiss-card').onclick = () => ($('start-card').hidden = true);
$('help-button').onclick = () => $('help-dialog').showModal();
document
  .querySelectorAll('#help-dialog .dialog-close')
  .forEach((b) => (b.onclick = () => $('help-dialog').close()));
$('add-scene').onclick = () => {
  if (project.scenes.length >= 30) return toast('Máximo 30 escenas por proyecto.');
  project.scenes.push({
    name: 'Vista ' + (project.scenes.length + 1),
    position: viewport.camera.position.toArray(),
    target: viewport.controls.target.toArray(),
    ortho: !!viewport.ortho,
    section: clone(project.section),
    hidden: project.objects.filter((o) => !o.visible).map((o) => o.id),
    hiddenTags: project.tags.filter((t) => t.visible === false).map((t) => t.id),
    style: project.displayStyle || 'solid',
  });
  commit('Escena guardada');
};
document.addEventListener('click', (event) => {
  if (!event.target.closest('.dropdown')) {
    $('export-menu').hidden = true;
    $('solids-menu').hidden = true;
  }
});
document.addEventListener(
  'keydown',
  guard(async (event) => {
    if (document.querySelector('dialog[open]')) return;
    const editing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && ['s', 'o', 'n'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.key.toLowerCase() === 's') await save(event.shiftKey);
      else if (event.key.toLowerCase() === 'o') await openProject();
      else $('new-button').click();
      return;
    }
    if (editing) return;
    if (studio.handleKey(event)) {
      event.preventDefault();
      return;
    }
    if (ctrl) {
      const key = event.key.toLowerCase();
      if (['z', 'y', 'd', 'g', 'a'].includes(key)) event.preventDefault();
      if (key === 'z') event.shiftKey ? redo() : undo();
      else if (key === 'y') redo();
      else if (key === 'd') duplicateSelection();
      else if (key === 'g') groupSelection();
      else if (key === 'a')
        selectObjects(project.objects.filter((o) => o.visible).map((o) => o.id));
      return;
    }
    if (event.key === 'Escape') {
      cancelOperation();
      setTool('select');
      return;
    }
    if (event.key === 'F1') {
      event.preventDefault();
      $('help-dialog').showModal();
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (event.key === 'Backspace' && operation?.type === 'polygon') {
      event.preventDefault();
      if (operation.points.length > 1) operation.points.pop();
      viewport.previewLine(operation.points);
      return;
    }
    if (event.key === 'Enter' && operation?.type === 'polygon') {
      if (operation.points.length >= 3) addObject(shapeForOperation(operation));
      return;
    }
    if (
      /^[0-9.,;-]$/.test(event.key) &&
      (operation || studio.hasOperation() || ['move', 'rotate', 'scale'].includes(tool))
    ) {
      $('measurement-input').value = event.key;
      $('measurement-input').focus();
      event.preventDefault();
      return;
    }
    const map = {
      ' ': 'select',
      r: 'rectangle',
      l: 'line',
      a: 'arc',
      f: 'offset',
      k: 'dimension',
      c: 'circle',
      b: 'box',
      p: 'extrude',
      m: 'move',
      q: 'rotate',
      s: 'scale',
      t: 'paint',
      e: 'erase',
      d: 'measure',
      o: 'orbit',
    };
    if (map[event.key.toLowerCase()]) {
      event.preventDefault();
      setTool(map[event.key.toLowerCase()]);
    }
    if (event.key === 'Home') viewport.fit();
  }),
);
setInterval(
  guard(async () => {
    if (dirty && !operation && !studio.hasOperation()) await desktop.autosave(serialize());
  }),
  20000,
);
render();
viewport.fit();
setTool('select');
updateDirty();
recovery = await desktop.recovery();
if (recovery) {
  try {
    validateProject(JSON.parse(recovery));
    $('recovery-dialog').showModal();
  } catch {
    await desktop.clearRecovery();
  }
}
$('discard-recovery').onclick = guard(async () => {
  $('recovery-dialog').close();
  await desktop.clearRecovery();
  recovery = null;
});
$('restore-recovery').onclick = guard(async () => {
  $('recovery-dialog').close();
  await replaceProject(validateProject(JSON.parse(recovery)));
  toast('Proyecto recuperado. Guarda una copia para conservarlo.');
  recovery = null;
});

window.runSmokeTests = async () => {
  const results = [],
    assert = (name, condition) => {
      if (!condition) throw new Error('Fallo: ' + name);
      results.push(name);
    };
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert('WebGL disponible', !!viewport.renderer.getContext());
  assert('Modelo inicial visible', viewport.meshes.size === 13 && viewport.canvas.width > 0);
  assert(
    'Triangulación y volumen',
    project.objects.every(
      (o) => viewport.meshes.get(o.id).geometry.getAttribute('position').count > 0 && volume(o) > 0,
    ),
  );
  const original = clone(project);
  await replaceProject(emptyProject());
  const frame = frameFromHit(null);
  operation = { type: 'rectangle', frame, points: [new THREE.Vector3(0, 0, 0)], phase: 'base' };
  preciseShape([4, 3]);
  assert(
    'Rectángulo exacto de 4 × 3',
    project.objects.length === 1 && project.objects[0].kind === 'surface',
  );
  operation = { type: 'extrude', before: clone(project.objects[0]), faceIndex: 0, worldScale: 1 };
  applyExtrude(2.8);
  assert('Extrusión a sólido 33.6 m³', Math.abs(volume(project.objects[0]) - 33.6) < 0.0001);
  undo();
  assert('Deshacer extrusión', project.objects[0].kind === 'surface');
  redo();
  assert('Rehacer extrusión', project.objects[0].kind === 'solid');
  duplicateSelection();
  assert('Duplicar', project.objects.length === 2);
  selectObjects(project.objects.map((o) => o.id));
  groupSelection();
  assert('Agrupar', project.objects[0].group === project.objects[1].group);
  currentColor = '#df9a70';
  applyColor();
  assert(
    'Materiales',
    project.objects.every((o) => o.color === '#df9a70'),
  );
  assert(
    'Proyecto JSON verificable',
    validateProject(JSON.parse(serialize())).objects.length === 2,
  );
  const obj = viewport.export('obj'),
    stl = viewport.export('stl');
  assert('Exportación OBJ', obj.includes('v ') && obj.includes('f '));
  assert('Exportación STL', stl.includes('facet normal'));
  const imported = viewport.importMesh({
    extension: '.obj',
    bytes: [...new TextEncoder().encode(obj)],
    name: 'test.obj',
  });
  assert('Importación OBJ', imported.length === 2 && imported.every((o) => o.faces.length > 0));
  const importedStl = viewport.importMesh({
    extension: '.stl',
    bytes: [...new TextEncoder().encode(stl)],
    name: 'test.stl',
  });
  assert('Importación STL', importedStl.length === 1 && importedStl[0].faces.length > 0);
  const combined = combineSolids(
    rectangle([0, 0], [2, 2], 2),
    rectangle([1, 0], [3, 2], 2),
    'subtract',
  );
  assert('Resta de sólidos en el visor', Math.abs(volume(combined) - 4) < 0.0001);
  const saved = serialize();
  await desktop.save(saved, false);
  const opened = await desktop.open();
  assert(
    'Guardado y apertura reales por IPC',
    opened.content === saved && validateProject(JSON.parse(opened.content)).objects.length === 2,
  );
  await desktop.accept(opened.path);
  assert('Exportación real OBJ a disco', await desktop.export(obj, 'obj'));
  assert('Exportación real STL a disco', await desktop.export(stl, 'stl'));
  assert('Exportación real PNG a disco', await desktop.export(viewport.image(), 'png'));
  const file = await desktop.importMesh();
  assert('Importación real desde disco por IPC', viewport.importMesh(file).length === 2);
  await desktop.autosave(saved);
  assert('Autoguardado y recuperación de sesión', (await desktop.recovery()) === saved);
  await desktop.clearRecovery();
  assert('Limpieza de copia de recuperación', (await desktop.recovery()) === null);
  await studio.smoke(assert);
  viewport.projection();
  viewport.view('top');
  viewport.fit();
  assert('Cámara ortográfica', viewport.camera.isOrthographicCamera);
  viewport.projection();
  viewport.view('iso');
  assert('Captura PNG', viewport.image().startsWith('data:image/png;base64,'));
  await replaceProject(original);
  viewport.view('iso');
  viewport.fit();
  selected = new Set([project.objects[1].id]);
  viewport.updateSelection(selected);
  updateUI();
  // Leo un píxel para comprobar que WebGL dibujó una imagen con canal alfa.
  viewport.renderer.render(viewport.scene, viewport.camera);
  const gl = viewport.renderer.getContext(),
    pixels = new Uint8Array(4);
  gl.readPixels(
    Math.floor(viewport.canvas.width / 2),
    Math.floor(viewport.canvas.height / 2),
    1,
    1,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels,
  );
  assert('Renderizado real de píxeles', pixels[3] > 0);
  $('toast').hidden = true;
  $('start-card').hidden = true;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {
    passed: results.length,
    checks: results,
    three: THREE.REVISION,
    userAgent: navigator.userAgent,
  };
};
