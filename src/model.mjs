export const FORMAT = 'trazo3d';
export const VERSION = 2;
export const COLORS = [
  '#e9dfcb',
  '#faf8ee',
  '#aebbc3',
  '#b98359',
  '#a6b59a',
  '#df9a70',
  '#627e97',
  '#d4bc81',
  '#454b50',
  '#c6e0e6',
  '#aa8998',
  '#e1bdab',
];
export const clone = (value) => structuredClone(value);
export const uid = () => globalThis.crypto.randomUUID();
export const emptyProject = () => ({
  format: FORMAT,
  version: VERSION,
  name: 'Sin título',
  units: 'm',
  objects: [],
  scenes: [],
  dimensions: [],
  groups: [],
  tags: [],
  textures: [],
  section: null,
});
export function signedArea(points) {
  return (
    points.reduce((a, p, i) => {
      const q = points[(i + 1) % points.length];
      return a + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
  );
}
const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function intersect(a, b, c, d) {
  const x = cross2(a, b, c),
    y = cross2(a, b, d),
    z = cross2(c, d, a),
    w = cross2(c, d, b);
  if (x * y < -1e-14 && z * w < -1e-14) return true;
  const on = (p, q, r, v) =>
    Math.abs(v) < 1e-8 &&
    r[0] >= Math.min(p[0], q[0]) - 1e-8 &&
    r[0] <= Math.max(p[0], q[0]) + 1e-8 &&
    r[1] >= Math.min(p[1], q[1]) - 1e-8 &&
    r[1] <= Math.max(p[1], q[1]) + 1e-8;
  return on(a, b, c, x) || on(a, b, d, y) || on(c, d, a, z) || on(c, d, b, w);
}
export function cleanPolygon(input) {
  let points = input.map((p) => [+p[0], +p[1]]);
  if (
    points.length > 2 &&
    Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 1e-7
  )
    points.pop();
  if (points.length < 3 || points.some((p) => p.some((n) => !Number.isFinite(n))))
    throw new Error('La figura necesita tres puntos válidos.');
  for (let i = 0; i < points.length; i++) {
    if (
      Math.hypot(
        points[i][0] - points[(i + 1) % points.length][0],
        points[i][1] - points[(i + 1) % points.length][1],
      ) < 1e-7
    )
      throw new Error('Hay puntos repetidos en la figura.');
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (
        intersect(
          points[i],
          points[(i + 1) % points.length],
          points[j],
          points[(j + 1) % points.length],
        )
      )
        throw new Error('Las aristas de la figura se cruzan.');
    }
  }
  if (Math.abs(signedArea(points)) < 1e-7) throw new Error('La figura no tiene superficie.');
  if (signedArea(points) < 0) points.reverse();
  return points;
}
export function prism(points, height = 0, name = 'Figura', color = COLORS[0]) {
  points = cleanPolygon(points);
  if (!Number.isFinite(height) || height < 0) throw new Error('Altura inválida.');
  const n = points.length;
  const vertices = points.map(([x, z]) => [x, 0, z]);
  let faces = [Array.from({ length: n }, (_, i) => n - i - 1)];
  // En el plano XZ, el orden horario visto desde arriba deja la normal hacia +Y.
  if (height === 0) faces = [Array.from({ length: n }, (_, i) => n - i - 1)];
  else {
    vertices.push(...points.map(([x, z]) => [x, height, z]));
    faces = [
      Array.from({ length: n }, (_, i) => i),
      Array.from({ length: n }, (_, i) => 2 * n - i - 1),
    ];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push([i, i + n, j + n, j]);
    }
  }
  return {
    id: uid(),
    name,
    kind: height ? 'solid' : 'surface',
    vertices,
    faces,
    color,
    faceColors: {},
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    locked: false,
    group: null,
  };
}
export const rectangle = (a, b, h = 0, name = 'Rectángulo', color) =>
  prism(
    [
      [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
      [Math.max(a[0], b[0]), Math.min(a[1], b[1])],
      [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
      [Math.min(a[0], b[0]), Math.max(a[1], b[1])],
    ],
    h,
    name,
    color,
  );
export const circle = (center, radius, height = 0, segments = 40, color) => {
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('El radio debe ser mayor que cero.');
  return prism(
    Array.from({ length: segments }, (_, i) => [
      center[0] + radius * Math.cos((i / segments) * Math.PI * 2),
      center[1] + radius * Math.sin((i / segments) * Math.PI * 2),
    ]),
    height,
    'Círculo',
    color,
  );
};
export function normal(vertices, face) {
  const n = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const a = vertices[face[i]],
      b = vertices[face[(i + 1) % face.length]];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(...n);
  return len > 1e-10 ? n.map((v) => v / len) : [0, 1, 0];
}
export function pushPull(object, faceIndex, distance) {
  if (!Number.isFinite(distance) || Math.abs(distance) < 1e-6)
    throw new Error('Introduce una distancia distinta de cero.');
  const face = object.faces[faceIndex];
  if (!face) throw new Error('Selecciona una cara.');
  const out = clone(object),
    n = normal(out.vertices, face);
  if (object.kind === 'surface') {
    if (distance < 0) {
      distance *= -1;
      n.forEach((_, i) => (n[i] *= -1));
    }
    const old = [...face],
      start = out.vertices.length;
    out.vertices.push(
      ...face.map((index) => out.vertices[index].map((v, i) => v + n[i] * distance)),
    );
    out.faces = [[...old].reverse(), face.map((_, i) => start + i)];
    for (let i = 0; i < face.length; i++) {
      const j = (i + 1) % face.length;
      out.faces.push([old[i], old[j], start + j, start + i]);
    }
    if (normal(out.vertices, out.faces[1]).reduce((sum, v, i) => sum + v * n[i], 0) < 0)
      out.faces = out.faces.map((f) => [...f].reverse());
    out.kind = 'solid';
    out.faceColors = {};
    return out;
  }
  // Muevo la cara sobre su normal y descarto cambios que inviertan las caras vecinas.
  for (const index of face)
    out.vertices[index] = out.vertices[index].map((v, i) => v + n[i] * distance);
  for (let i = 0; i < out.faces.length; i++) {
    const before = normal(object.vertices, object.faces[i]),
      after = normal(out.vertices, out.faces[i]);
    const f = out.faces[i],
      origin = out.vertices[f[0]];
    if (before.reduce((a, v, j) => a + v * after[j], 0) < 0.001)
      throw new Error('La distancia invierte una cara. Usa una distancia menor.');
    if (
      f.some(
        (index) =>
          Math.abs(out.vertices[index].reduce((sum, v, j) => sum + (v - origin[j]) * after[j], 0)) >
          0.00001,
      )
    )
      throw new Error('Esta cara produciría una superficie torcida. Extruye otra cara.');
  }
  if (Math.abs(volume(out)) < 0.0000001) throw new Error('El sólido no puede quedar sin espesor.');
  return out;
}
export function volume(object) {
  if (object.kind !== 'solid' && !object.closed) return 0;
  let value = 0;
  for (const face of object.faces) {
    const a = object.vertices[face[0]];
    for (let i = 1; i < face.length - 1; i++) {
      const b = object.vertices[face[i]],
        c = object.vertices[face[i + 1]];
      value +=
        a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  }
  return Math.abs((value / 6) * object.scale.reduce((a, b) => a * b, 1));
}
export function dimensions(object) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const vertex of object.vertices)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], vertex[i]);
      max[i] = Math.max(max[i], vertex[i]);
    }
  return min.map((v, i) => (max[i] - v) * object.scale[i]);
}
export class History {
  constructor(initial, limit = 100) {
    this.states = [clone(initial)];
    this.index = 0;
    this.limit = limit;
  }
  commit(state) {
    const next = clone(state);
    if (JSON.stringify(next) === JSON.stringify(this.states[this.index])) return false;
    this.states.splice(this.index + 1);
    this.states.push(next);
    if (this.states.length > this.limit) this.states.shift();
    this.index = this.states.length - 1;
    return true;
  }
  undo() {
    return this.index > 0 ? clone(this.states[--this.index]) : null;
  }
  redo() {
    return this.index < this.states.length - 1 ? clone(this.states[++this.index]) : null;
  }
}
export function validateProject(data) {
  if (
    !data ||
    data.format !== FORMAT ||
    ![1, VERSION].includes(data.version) ||
    !Array.isArray(data.objects) ||
    data.objects.length > 10000
  )
    throw new Error('No es un proyecto Trazo 3D válido o su versión no es compatible.');
  const ids = new Set();
  const vec = (value, positive = false) =>
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (v) =>
        typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e8 && (!positive || v > 0),
    );
  let total = 0;
  for (const object of data.objects) {
    if (
      !object ||
      typeof object.id !== 'string' ||
      ids.has(object.id) ||
      typeof object.name !== 'string' ||
      !['solid', 'surface', 'mesh', 'line'].includes(object.kind)
    )
      throw new Error('Objeto inválido en el proyecto.');
    ids.add(object.id);
    if (
      !Array.isArray(object.vertices) ||
      object.vertices.length < (object.kind === 'line' ? 2 : 3) ||
      object.vertices.length > 200000 ||
      object.vertices.some((v) => !vec(v)) ||
      !Array.isArray(object.faces) ||
      object.faces.length > 200000 ||
      (!object.faces.length && object.kind !== 'line')
    )
      throw new Error('Geometría inválida.');
    total += object.vertices.length;
    if (total > 1000000) throw new Error('El proyecto supera un millón de vértices.');
    if (
      object.faces.some(
        (f) =>
          !Array.isArray(f) ||
          f.length < 3 ||
          f.length > 4096 ||
          f.some((i) => !Number.isInteger(i) || i < 0 || i >= object.vertices.length),
      )
    )
      throw new Error('Cara inválida.');
    if (
      !vec(object.position) ||
      !vec(object.rotation) ||
      !vec(object.scale, true) ||
      !/^#[\da-f]{6}$/i.test(object.color)
    )
      throw new Error('Propiedades inválidas.');
    object.faceColors ??= {};
    if (
      Object.values(object.faceColors).some(
        (c) => typeof c !== 'string' || !/^#[\da-f]{6}$/i.test(c),
      )
    )
      throw new Error('Material inválido.');
    object.visible = object.visible !== false;
    object.locked = !!object.locked;
    object.group = typeof object.group === 'string' ? object.group : null;
    object.componentId = typeof object.componentId === 'string' ? object.componentId : null;
    object.textureId = typeof object.textureId === 'string' ? object.textureId : '';
    object.faceTextures ??= {};
    if (Object.values(object.faceTextures).some((id) => typeof id !== 'string'))
      throw new Error('Textura de cara inválida.');
    object.textureScale =
      typeof object.textureScale === 'number' &&
      object.textureScale > 0 &&
      object.textureScale <= 10000
        ? object.textureScale
        : 1;
    object.opacity =
      typeof object.opacity === 'number' && object.opacity >= 0.05 && object.opacity <= 1
        ? object.opacity
        : 1;
    object.tag = typeof object.tag === 'string' ? object.tag : '';
  }
  data.version = VERSION;
  data.groups = Array.isArray(data.groups) ? data.groups : [];
  if (
    data.groups.length > 10000 ||
    data.groups.some(
      (g) =>
        !g ||
        typeof g.id !== 'string' ||
        typeof g.name !== 'string' ||
        (g.parent != null && typeof g.parent !== 'string'),
    )
  )
    throw new Error('Grupos inválidos.');
  const groupIds = new Set(data.groups.map((g) => g.id));
  if (groupIds.size !== data.groups.length) throw new Error('Grupo duplicado.');
  for (const object of data.objects)
    if (object.group && !groupIds.has(object.group)) {
      data.groups.push({ id: object.group, name: 'Grupo', parent: null });
      groupIds.add(object.group);
    }
  for (const group of data.groups) {
    const chain = new Set([group.id]);
    let parent = group.parent;
    while (parent) {
      if (chain.has(parent) || !groupIds.has(parent))
        throw new Error('Jerarquía de grupos inválida.');
      chain.add(parent);
      parent = data.groups.find((g) => g.id === parent)?.parent;
    }
  }
  data.dimensions = Array.isArray(data.dimensions) ? data.dimensions : [];
  if (
    data.dimensions.length > 5000 ||
    data.dimensions.some(
      (d) =>
        !d ||
        typeof d.id !== 'string' ||
        !vec(d.offset) ||
        ![d.a, d.b].every(
          (a) =>
            a &&
            vec(a.point) &&
            (!a.objectId ||
              (ids.has(a.objectId) &&
                Number.isInteger(a.vertex) &&
                a.vertex >= 0 &&
                a.vertex < data.objects.find((o) => o.id === a.objectId).vertices.length)),
        ),
    )
  )
    throw new Error('Cota inválida.');
  data.tags = Array.isArray(data.tags) ? data.tags : [];
  if (
    data.tags.length > 1000 ||
    data.tags.some((t) => !t || typeof t.id !== 'string' || typeof t.name !== 'string')
  )
    throw new Error('Etiquetas inválidas.');
  data.textures = Array.isArray(data.textures) ? data.textures : [];
  if (
    data.textures.length > 100 ||
    data.textures.some(
      (t) =>
        !t ||
        typeof t.id !== 'string' ||
        typeof t.name !== 'string' ||
        typeof t.data !== 'string' ||
        t.data.length > 12_000_000 ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(t.data),
    )
  )
    throw new Error('Textura inválida.');
  if (
    data.section &&
    (!['x', 'y', 'z'].includes(data.section.axis) || !Number.isFinite(data.section.value))
  )
    throw new Error('Plano de sección inválido.');
  data.name = typeof data.name === 'string' ? data.name.slice(0, 200) : 'Proyecto';
  data.units = ['m', 'cm', 'mm'].includes(data.units) ? data.units : 'm';
  data.scenes = Array.isArray(data.scenes)
    ? data.scenes
        .filter((s) => s && typeof s.name === 'string' && vec(s.position) && vec(s.target))
        .slice(0, 30)
    : [];
  return data;
}
export function demoProject() {
  const p = emptyProject();
  p.name = 'Casa patio';
  const box = (name, x, z, w, d, h, y, color) => {
    const o = rectangle([x, z], [x + w, z + d], h, name, color);
    o.position[1] = y;
    p.objects.push(o);
    return o;
  };
  box('Plataforma de hormigón', -5.8, -4.2, 11.6, 8.4, 0.22, 0, '#c7c5ba');
  box('Volumen principal', -3.8, -2.6, 5.6, 4.7, 2.9, 0.22, '#e9dfcb');
  box('Ala de madera', 1.8, -2.6, 2.4, 3.4, 2.6, 0.22, '#b98359');
  box('Cubierta principal', -4, -2.8, 6, 5.1, 0.18, 3.12, '#f5f1e7');
  box('Cubierta lateral', 1.65, -2.8, 2.75, 3.8, 0.16, 2.82, '#e3d7c0');
  box('Ventanal izquierdo', -3.15, 2.105, 2, 0.035, 1.75, 0.75, '#627e97');
  box('Ventanal derecho', -0.75, 2.105, 1.75, 0.035, 1.75, 0.75, '#627e97');
  box('Puerta', 2.45, 0.805, 1.05, 0.04, 2.15, 0.22, '#454b50');
  box('Terraza', -4.1, 2.45, 8.4, 1.1, 0.12, 0.22, '#b98359');
  for (let i = 0; i < 3; i++)
    box('Escalón ' + (i + 1), -0.8, 3.55 + i * 0.25, 2.2, 0.25, 0.09 * (3 - i), 0, '#c7c5ba');
  const planter = circle([4.85, 2.5], 0.45, 0.55, 24, '#a6b59a');
  planter.name = 'Jardinera';
  planter.position[1] = 0.22;
  p.objects.push(planter);
  p.objects[0].textureId = 'concrete';
  p.objects[2].textureId = 'wood';
  p.objects[8].textureId = 'wood';
  const windowDefinition = uid();
  for (const [index, x, width] of [
    [5, -3.15, 2],
    [6, -0.75, 1.75],
  ]) {
    const o = p.objects[index],
      shape = rectangle([0, 0], [1, 0.035], 1.75);
    o.vertices = shape.vertices;
    o.faces = shape.faces;
    o.position = [x, 0.75, 2.105];
    o.scale = [width, 1, 1];
    o.componentId = windowDefinition;
  }
  p.dimensions.push({
    id: uid(),
    a: { objectId: p.objects[0].id, vertex: 3, point: [-5.8, 0.22, 4.2] },
    b: { objectId: p.objects[0].id, vertex: 2, point: [5.8, 0.22, 4.2] },
    offset: [0, 0, 1.1],
  });
  return p;
}
