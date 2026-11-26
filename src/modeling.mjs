import * as THREE from 'three';
import { clone, uid, normal, cleanPolygon, prism, rectangle, circle, volume } from './model.mjs';
import { faceGeometry } from './geometry.mjs';
export const vec = (p) => new THREE.Vector3(...p);
export const matrixOf = (o) =>
  new THREE.Matrix4().compose(
    vec(o.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)),
    vec(o.scale),
  );
export function edgesOf(o) {
  if (o.kind === 'line') return o.vertices.slice(1).map((_, i) => [i, i + 1]);
  const seen = new Map();
  for (const f of o.faces)
    for (let i = 0; i < f.length; i++) {
      const a = f[i],
        b = f[(i + 1) % f.length],
        k = [Math.min(a, b), Math.max(a, b)].join(':');
      if (!seen.has(k)) seen.set(k, [a, b]);
    }
  return [...seen.values()];
}
export function polyline(points, name = 'Línea', color = '#454b50') {
  if (points.length < 2 || points.some((p) => p.length !== 3 || p.some((n) => !Number.isFinite(n))))
    throw new Error('La línea necesita al menos dos puntos.');
  return {
    id: uid(),
    name,
    kind: 'line',
    vertices: clone(points),
    faces: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color,
    faceColors: {},
    visible: true,
    locked: false,
    group: null,
  };
}
export function frameOfFace(o, index) {
  const f = o.faces[index],
    matrix = matrixOf(o),
    origin = vec(o.vertices[f[0]]).applyMatrix4(matrix);
  const n = vec(normal(o.vertices, f))
    .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix))
    .normalize();
  const u = vec(o.vertices[f[1]]).applyMatrix4(matrix).sub(origin).normalize(),
    v = new THREE.Vector3().crossVectors(u, n).normalize();
  return { origin, n, u, v, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, origin) };
}
export const localOnFrame = (p, f) => {
  const d = p.clone().sub(f.origin);
  return [d.dot(f.u), d.dot(f.v)];
};
export const worldOnFrame = (p, f) =>
  f.origin.clone().addScaledVector(f.u, p[0]).addScaledVector(f.v, p[1]);
export function alignToFrame(o, f) {
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.u, f.n, f.v));
  o.position = f.origin.toArray();
  o.rotation = [e.x, e.y, e.z];
  return o;
}
export function offsetPolygon(input, distance) {
  const p = cleanPolygon(input),
    lines = p.map((a, i) => {
      const b = p[(i + 1) % p.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        l = Math.hypot(dx, dy);
      return { p: [a[0] - (dy / l) * distance, a[1] + (dx / l) * distance], d: [dx / l, dy / l] };
    });
  const out = lines.map((line, i) => {
    const prev = lines[(i + lines.length - 1) % lines.length],
      det = prev.d[0] * line.d[1] - prev.d[1] * line.d[0];
    if (Math.abs(det) < 1e-8) return line.p;
    const q = [line.p[0] - prev.p[0], line.p[1] - prev.p[1]],
      t = (q[0] * line.d[1] - q[1] * line.d[0]) / det;
    return [prev.p[0] + prev.d[0] * t, prev.p[1] + prev.d[1] * t];
  });
  cleanPolygon(out);
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    if (
      (out[j][0] - out[i][0]) * (p[j][0] - p[i][0]) +
        (out[j][1] - out[i][1]) * (p[j][1] - p[i][1]) <=
      1e-9
    )
      throw new Error('El offset supera el espesor disponible y colapsa el contorno.');
  }
  const inside = (point) => {
    let yes = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const a = p[i],
        b = p[j];
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        yes = !yes;
    }
    return yes;
  };
  if (distance > 0 && out.some((q) => !inside(q)))
    throw new Error('El offset colapsa el contorno. Usa una distancia menor.');
  // Compruebo que cada punto siga a la distancia pedida de su arista original.
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length],
      q = out[i];
    const side =
      ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) /
      Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Math.abs(side - distance) > 1e-5)
      throw new Error('No se puede generar este offset sin dividir el contorno.');
  }
  return out;
}
export function offsetFace(o, index, distance) {
  if (!Number.isFinite(distance) || Math.abs(distance) < 1e-6)
    throw new Error('Introduce una distancia de offset distinta de cero.');
  const f = frameOfFace(o, index),
    matrix = matrixOf(o),
    p = o.faces[index].map((i) => localOnFrame(vec(o.vertices[i]).applyMatrix4(matrix), f));
  const result = alignToFrame(prism(offsetPolygon(p, distance), 0, 'Offset', o.color), f);
  result.hostId = o.id;
  return result;
}
export function arcPoints(a, through, b, segments = 32) {
  const [ax, ay] = a,
    [mx, my] = through,
    [bx, by] = b,
    d = 2 * (ax * (my - by) + mx * (by - ay) + bx * (ay - my));
  if (Math.abs(d) < 1e-10) throw new Error('Los tres puntos del arco no pueden estar alineados.');
  const aa = ax * ax + ay * ay,
    mm = mx * mx + my * my,
    bb = bx * bx + by * by,
    cx = (aa * (my - by) + mm * (by - ay) + bb * (ay - my)) / d,
    cy = (aa * (bx - mx) + mm * (ax - bx) + bb * (mx - ax)) / d;
  const start = Math.atan2(ay - cy, ax - cx),
    mid = Math.atan2(my - cy, mx - cx),
    end = Math.atan2(by - cy, bx - cx),
    tau = Math.PI * 2,
    positive = (x) => ((x % tau) + tau) % tau;
  let sweep = positive(end - start);
  if (positive(mid - start) > sweep) sweep -= tau;
  const radius = Math.hypot(ax - cx, ay - cy);
  return Array.from({ length: segments + 1 }, (_, i) => [
    cx + radius * Math.cos(start + (sweep * i) / segments),
    cy + radius * Math.sin(start + (sweep * i) / segments),
  ]);
}
export function autofold(o) {
  const out = clone(o),
    faces = [],
    colors = {},
    textures = {};
  for (let i = 0; i < o.faces.length; i++) {
    const f = o.faces[i],
      n = normal(o.vertices, f),
      origin = o.vertices[f[0]],
      nonplanar = f.some(
        (k) => Math.abs(o.vertices[k].reduce((s, v, j) => s + (v - origin[j]) * n[j], 0)) > 1e-5,
      );
    const add = (face) => {
      const at = faces.length;
      faces.push(face);
      if (o.faceColors?.[i]) colors[at] = o.faceColors[i];
      if (o.faceTextures?.[i]) textures[at] = o.faceTextures[i];
    };
    if (nonplanar) {
      const data = faceGeometry(o, i);
      for (let j = 0; j < data.length; j += 9) {
        const triangle = [];
        for (let k = 0; k < 3; k++) {
          const p = data.slice(j + k * 3, j + k * 3 + 3),
            id = f.find((id) => o.vertices[id].every((v, a) => Math.abs(v - p[a]) < 1e-7));
          if (id == null) throw new Error('No se pudo plegar esta cara.');
          triangle.push(id);
        }
        add(triangle);
      }
    } else add([...f]);
  }
  out.faces = faces;
  out.faceColors = colors;
  out.faceTextures = textures;
  return out;
}
export function coplanarRegion(o, index) {
  const n = vec(normal(o.vertices, o.faces[index])),
    origin = vec(o.vertices[o.faces[index][0]]),
    region = new Set([index]),
    queue = [index],
    edgeFaces = new Map();
  o.faces.forEach((f, j) => {
    for (let i = 0; i < f.length; i++) {
      const key = [f[i], f[(i + 1) % f.length]].sort((a, b) => a - b).join(':');
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key).push(j);
    }
  });
  while (queue.length) {
    const f = o.faces[queue.pop()];
    for (let i = 0; i < f.length; i++) {
      const key = [f[i], f[(i + 1) % f.length]].sort((a, b) => a - b).join(':');
      for (const j of edgeFaces.get(key) || []) {
        if (region.has(j)) continue;
        const face = o.faces[j];
        if (
          n.dot(vec(normal(o.vertices, face))) > 0.99999 &&
          face.every((k) => Math.abs(vec(o.vertices[k]).sub(origin).dot(n)) < 1e-5)
        ) {
          region.add(j);
          queue.push(j);
        }
      }
    }
  }
  return [...region];
}
export function pullRegion(o, index, distance) {
  if (!Number.isFinite(distance) || Math.abs(distance) < 1e-6)
    throw new Error('Introduce una distancia distinta de cero.');
  const out = clone(o),
    region = coplanarRegion(o, index),
    vertices = new Set(region.flatMap((i) => o.faces[i])),
    n = normal(o.vertices, o.faces[index]);
  for (const k of vertices) out.vertices[k] = out.vertices[k].map((v, i) => v + n[i] * distance);
  for (let i = 0; i < o.faces.length; i++)
    if (vec(normal(o.vertices, o.faces[i])).dot(vec(normal(out.vertices, out.faces[i]))) < 0.001)
      throw new Error('La distancia invierte una cara; usa un valor menor.');
  const folded = autofold(out);
  if (o.closed || o.kind === 'solid') {
    if (volume(folded) < 1e-8) throw new Error('El sólido no puede perder todo su espesor.');
  }
  return folded;
}
export function syncComponent(project, source) {
  if (!source.componentId) return;
  const fields = [
    'vertices',
    'faces',
    'kind',
    'closed',
    'color',
    'faceColors',
    'textureId',
    'faceTextures',
    'textureScale',
    'opacity',
  ];
  for (const other of project.objects)
    if (other !== source && other.componentId === source.componentId)
      for (const field of fields) {
        if (source[field] === undefined) delete other[field];
        else other[field] = clone(source[field]);
      }
}
export function dissolveEdge(o, edge) {
  const adjacent = o.faces
    .map((f, i) => (f.includes(edge[0]) && f.includes(edge[1]) ? i : -1))
    .filter((i) => i >= 0);
  if (adjacent.length !== 2) throw new Error('La arista debe separar exactamente dos caras.');
  if (
    vec(normal(o.vertices, o.faces[adjacent[0]])).dot(
      vec(normal(o.vertices, o.faces[adjacent[1]])),
    ) < 0.99999
  )
    throw new Error('Solo puedes disolver una arista entre caras coplanares.');
  const boundary = new Map();
  for (const index of adjacent) {
    const f = o.faces[index];
    for (let i = 0; i < f.length; i++) {
      const a = f[i],
        b = f[(i + 1) % f.length],
        reverse = b + ':' + a;
      if (boundary.has(reverse)) boundary.delete(reverse);
      else boundary.set(a + ':' + b, [a, b]);
    }
  }
  const list = [...boundary.values()],
    face = [list[0][0]];
  let current = list[0][0];
  for (let i = 0; i < list.length; i++) {
    const next = list.find((e) => e[0] === current);
    if (!next) throw new Error('El contorno de la cara no es válido.');
    current = next[1];
    if (current === face[0]) break;
    face.push(current);
  }
  if (face.length !== list.length) throw new Error('La disolución produciría varias caras.');
  const out = clone(o);
  out.faces = out.faces.filter((_, i) => !adjacent.includes(i));
  out.faces.push(face);
  out.faceColors = {};
  out.faceTextures = {};
  return out;
}
export function mergeObjects(objects, name = 'Componente') {
  if (!objects.length) throw new Error('Selecciona al menos un objeto.');
  const vertices = [],
    faces = [],
    faceColors = {},
    faceTextures = {};
  for (const o of objects) {
    if (o.kind === 'line') throw new Error('Crea el componente con superficies o sólidos.');
    const m = matrixOf(o),
      offset = vertices.length;
    vertices.push(...o.vertices.map((v) => vec(v).applyMatrix4(m).toArray()));
    o.faces.forEach((f, i) => {
      faceColors[faces.length] = o.faceColors[i] || o.color;
      faceTextures[faces.length] = o.faceTextures?.[i] || o.textureId || '';
      faces.push(f.map((k) => k + offset));
    });
  }
  return {
    ...clone(objects[0]),
    id: uid(),
    name,
    vertices,
    faces,
    faceColors,
    faceTextures,
    kind: 'mesh',
    closed: objects.every((o) => o.kind === 'solid' || o.closed),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    group: null,
    componentId: uid(),
    hostId: null,
  };
}
export function sweepProfile(profile, path) {
  if (profile.faces.length !== 1 || path.kind !== 'line')
    throw new Error('Selecciona una superficie de perfil y una línea de recorrido.');
  const frame = frameOfFace(profile, 0),
    pm = matrixOf(profile),
    tm = matrixOf(path),
    points = path.vertices.map((p) => vec(p).applyMatrix4(tm)),
    coords = profile.faces[0].map((i) =>
      localOnFrame(vec(profile.vertices[i]).applyMatrix4(pm), frame),
    );
  const center = coords.reduce(
    (s, p) => [s[0] + p[0] / coords.length, s[1] + p[1] / coords.length],
    [0, 0],
  );
  const vertices = [],
    faces = [],
    tangents = points.map((p, i) =>
      (i === 0
        ? points[1].clone().sub(p)
        : i === points.length - 1
          ? p.clone().sub(points[i - 1])
          : points[i + 1].clone().sub(points[i - 1])
      ).normalize(),
    );
  if (points.some((p, i) => i > 0 && p.distanceTo(points[i - 1]) < 1e-6))
    throw new Error('El recorrido tiene puntos consecutivos iguales.');
  const start = new THREE.Quaternion().setFromUnitVectors(frame.n, tangents[0]),
    u = frame.u.clone().applyQuaternion(start),
    v = frame.v.clone().applyQuaternion(start);
  for (let i = 0; i < points.length; i++) {
    if (i) {
      const q = new THREE.Quaternion().setFromUnitVectors(tangents[i - 1], tangents[i]);
      u.applyQuaternion(q);
      v.applyQuaternion(q);
    }
    for (const c of coords)
      vertices.push(
        points[i]
          .clone()
          .addScaledVector(u, c[0] - center[0])
          .addScaledVector(v, c[1] - center[1])
          .toArray(),
      );
  }
  const n = coords.length;
  faces.push(Array.from({ length: n }, (_, i) => i));
  faces.push(Array.from({ length: n }, (_, i) => vertices.length - i - 1));
  for (let j = 0; j < points.length - 1; j++)
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      faces.push([j * n + i, (j + 1) * n + i, (j + 1) * n + k, j * n + k]);
    }
  const out = {
    ...clone(profile),
    id: uid(),
    name: 'Seguir recorrido',
    vertices,
    faces,
    kind: 'solid',
    closed: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    componentId: null,
    hostId: null,
    faceColors: {},
    faceTextures: {},
  };
  // La tapa final debe apuntar hacia fuera; si quedó al revés, invierto las caras.
  if (vec(normal(vertices, faces[1])).dot(tangents.at(-1)) < 0)
    out.faces = faces.map((f) => [...f].reverse());
  return autofold(out);
}
export function resolveAnchor(anchor, project) {
  const o = project.objects.find((o) => o.id === anchor.objectId);
  return o && o.vertices[anchor.vertex]
    ? vec(o.vertices[anchor.vertex]).applyMatrix4(matrixOf(o))
    : vec(anchor.point);
}
export function rebindAnchors(project, before, after) {
  const oldMatrix = matrixOf(before),
    nextMatrix = matrixOf(after),
    lookup = new Map(
      after.vertices.map((p, i) => [
        vec(p)
          .applyMatrix4(nextMatrix)
          .toArray()
          .map((n) => n.toFixed(5))
          .join(':'),
        i,
      ]),
    );
  for (const d of project.dimensions || [])
    for (const a of [d.a, d.b])
      if (a.objectId === before.id) {
        const point = vec(before.vertices[a.vertex]).applyMatrix4(oldMatrix);
        a.point = point.toArray();
        const index = lookup.get(a.point.map((n) => n.toFixed(5)).join(':'));
        if (index == null) {
          delete a.objectId;
          delete a.vertex;
        } else {
          a.objectId = after.id;
          a.vertex = index;
        }
      }
}
export function dimensionGeometry(d, project) {
  const a = resolveAnchor(d.a, project),
    b = resolveAnchor(d.b, project),
    offset = vec(d.offset),
    p = a.clone().add(offset),
    q = b.clone().add(offset);
  return { a, b, p, q, length: a.distanceTo(b) };
}
export function groupDescendants(project, id) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of project.groups || [])
      if (ids.has(g.parent) && !ids.has(g.id)) {
        ids.add(g.id);
        changed = true;
      }
  }
  return project.objects.filter((o) => ids.has(o.group));
}
export function libraryModel(type) {
  const parts = [],
    box = (x, y, z, w, h, d, color) => {
      const o = rectangle([x, z], [x + w, z + d], h, 'Pieza', color);
      o.position[1] = y;
      parts.push(o);
    };
  if (type === 'table') {
    box(-0.8, 0.74, -0.45, 1.6, 0.06, 0.9, '#b98359');
    for (const x of [-0.7, 0.62])
      for (const z of [-0.35, 0.27]) box(x, 0, z, 0.08, 0.74, 0.08, '#454b50');
  } else if (type === 'chair') {
    box(-0.24, 0.43, -0.24, 0.48, 0.06, 0.48, '#b98359');
    box(-0.24, 0.49, -0.24, 0.48, 0.45, 0.05, '#b98359');
    for (const x of [-0.22, 0.17])
      for (const z of [-0.22, 0.17]) box(x, 0, z, 0.05, 0.43, 0.05, '#454b50');
  } else if (type === 'window') {
    box(-0.6, 0, 0, 1.2, 0.08, 0.12, '#e9dfcb');
    box(-0.6, 1.12, 0, 1.2, 0.08, 0.12, '#e9dfcb');
    for (const x of [-0.6, 0.52]) box(x, 0.08, 0, 0.08, 1.04, 0.12, '#e9dfcb');
    box(-0.52, 0.08, 0.035, 1.04, 1.04, 0.04, '#a6c9d6');
  } else if (type === 'door') {
    box(-0.5, 0, 0, 0.07, 2.15, 0.16, '#b98359');
    box(0.43, 0, 0, 0.07, 2.15, 0.16, '#b98359');
    box(-0.43, 2.08, 0, 0.86, 0.07, 0.16, '#b98359');
    box(-0.43, 0, 0.04, 0.86, 2.08, 0.05, '#d4bc81');
  } else if (type === 'stairs') {
    for (let i = 0; i < 8; i++) box(-0.6, 0, i * 0.28, 1.2, (i + 1) * 0.18, 0.28, '#aebbc3');
  } else {
    const o = circle([0, 0], 0.35, 0.5, 32, '#a6b59a');
    parts.push(o);
  }
  const names = {
    table: 'Mesa',
    chair: 'Silla',
    window: 'Ventana',
    door: 'Puerta',
    stairs: 'Escalera',
    planter: 'Jardinera',
  };
  return mergeObjects(parts, names[type] || 'Jardinera');
}
