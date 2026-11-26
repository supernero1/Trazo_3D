import * as THREE from 'three';
import { normal } from './model.mjs';
const v3 = (p) => new THREE.Vector3(...p);
export function faceGeometry(object, faceIndex) {
  const face = object.faces[faceIndex],
    n = v3(normal(object.vertices, face));
  const u = new THREE.Vector3()
    .subVectors(v3(object.vertices[face[1]]), v3(object.vertices[face[0]]))
    .normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const points = face.map((i) => {
    const p = v3(object.vertices[i]);
    return new THREE.Vector2(p.dot(u), p.dot(v));
  });
  const triangles = THREE.ShapeUtils.triangulateShape(points, []),
    positions = [];
  for (const tri of triangles)
    for (const index of tri) positions.push(...object.vertices[face[index]]);
  return positions;
}
export function objectGeometry(object) {
  const geometry = new THREE.BufferGeometry(),
    positions = [],
    uvs = [],
    triangleFaces = [];
  for (let i = 0; i < object.faces.length; i++) {
    const data = faceGeometry(object, i),
      start = positions.length / 3;
    positions.push(...data);
    geometry.addGroup(start, data.length / 3, i);
    const n = normal(object.vertices, object.faces[i]),
      axis = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),
      coords = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    for (let j = 0; j < data.length; j += 3) uvs.push(data[j + coords[0]], data[j + coords[1]]);
    for (let j = 0; j < data.length / 9; j++) triangleFaces.push(i);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.triangleFaces = triangleFaces;
  return geometry;
}
