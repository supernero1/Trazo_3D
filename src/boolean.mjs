import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { objectGeometry } from './geometry.mjs';
import { uid } from './model.mjs';
export function combineSolids(a, b, operation) {
  if (![a, b].every((o) => o.kind === 'solid' || (o.kind === 'mesh' && o.closed)))
    throw new Error('Selecciona dos sólidos. Extruye las superficies antes de combinarlas.');
  if (a.faces.length + b.faces.length > 30000)
    throw new Error('Para combinar sólidos, usa modelos con menos de 30.000 caras en total.');
  const modes = { union: ADDITION, subtract: SUBTRACTION, intersect: INTERSECTION };
  if (!(operation in modes)) throw new Error('Operación desconocida.');
  const material = new THREE.MeshBasicMaterial();
  const brush = (object) => {
    const geometry = objectGeometry(object);
    geometry.clearGroups();
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...object.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation)),
      new THREE.Vector3(...object.scale),
    );
    geometry.applyMatrix4(matrix);
    const b = new Brush(geometry, material);
    b.updateMatrixWorld(true);
    return b;
  };
  const first = brush(a),
    second = brush(b),
    evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal'];
  evaluator.useGroups = false;
  evaluator.useCDTClipping = true;
  let result;
  try {
    result = evaluator.evaluate(first, second, modes[operation]);
    const geometry = result.geometry,
      position = geometry.getAttribute('position'),
      index = geometry.index;
    const count = Math.min(geometry.drawRange.count, index ? index.count : position.count),
      start = geometry.drawRange.start,
      vertices = [],
      faces = [],
      welded = new Map();
    for (let i = start; i + 2 < start + count; i += 3) {
      const face = [];
      for (let j = 0; j < 3; j++) {
        const k = index ? index.getX(i + j) : i + j,
          p = [position.getX(k), position.getY(k), position.getZ(k)];
        if (p.some((n) => !Number.isFinite(n)))
          throw new Error('La combinación produjo una geometría inválida.');
        const key = p.map((n) => n.toFixed(6)).join(',');
        if (!welded.has(key)) {
          welded.set(key, vertices.length);
          vertices.push(p);
        }
        face.push(welded.get(key));
      }
      if (new Set(face).size === 3) faces.push(face);
    }
    if (!faces.length) return null;
    return {
      id: uid(),
      name:
        { union: 'Unión', subtract: 'Diferencia', intersect: 'Intersección' }[operation] +
        ' · ' +
        a.name,
      kind: 'mesh',
      closed: true,
      vertices,
      faces,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: a.color,
      faceColors: {},
      visible: true,
      locked: false,
      group: null,
    };
  } finally {
    first.geometry.dispose();
    second.geometry.dispose();
    result?.geometry.dispose();
    material.dispose();
  }
}
