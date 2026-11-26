import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rectangle,
  circle,
  prism,
  volume,
  dimensions,
  normal,
  pushPull,
  cleanPolygon,
  History,
  validateProject,
  demoProject,
  emptyProject,
} from '../src/model.mjs';
import { parseLength, parseMeasures } from '../src/measure.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test('rectangular prism: dimensions, volume and outward normals', () => {
  const o = rectangle([-2, -1], [2, 2], 3);
  assert.deepEqual(dimensions(o), [4, 3, 3]);
  near(volume(o), 36);
  assert.deepEqual(normal(o.vertices, o.faces[0]), [0, -1, 0]);
  assert.deepEqual(normal(o.vertices, o.faces[1]), [0, 1, 0]);
});
test('surface extrudes into a consistently oriented watertight solid', () => {
  const o = pushPull(rectangle([0, 0], [4, 3]), 0, 2.8);
  near(volume(o), 33.6);
  assert.equal(o.kind, 'solid');
  const edges = new Map();
  for (const face of o.faces)
    for (let i = 0; i < face.length; i++) {
      const a = face[i],
        b = face[(i + 1) % face.length],
        key = [Math.min(a, b), Math.max(a, b)].join('-');
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push([a, b]);
    }
  for (const pair of edges.values()) {
    assert.equal(pair.length, 2);
    assert.deepEqual(pair[0], [...pair[1]].reverse());
  }
});
test('negative surface extrusion points downward and preserves winding', () => {
  const o = pushPull(rectangle([0, 0], [2, 3]), 0, -2);
  near(volume(o), 12);
  assert.equal(Math.min(...o.vertices.map((v) => v[1])), -2);
});
test('solid cap and side push/pull support inward and outward movement', () => {
  let o = rectangle([0, 0], [4, 3], 2);
  o = pushPull(o, 1, 1);
  near(volume(o), 36);
  o = pushPull(o, 1, -2);
  near(volume(o), 12);
  o = pushPull(o, 2, 1);
  near(volume(o), 16);
  assert.throws(() => pushPull(o, 1, -2));
});
test('concave closed polygon retains expected volume', () => {
  const o = prism(
    [
      [0, 0],
      [4, 0],
      [4, 1],
      [1, 1],
      [1, 4],
      [0, 4],
    ],
    2,
  );
  near(volume(o), 14);
});
test('reject crossed, degenerate and non-finite polygons', () => {
  assert.throws(() =>
    cleanPolygon([
      [0, 0],
      [2, 2],
      [0, 2],
      [2, 0],
    ]),
  );
  assert.throws(() =>
    cleanPolygon([
      [0, 0],
      [1, 0],
      [2, 0],
    ]),
  );
  assert.throws(() =>
    cleanPolygon([
      [0, 0],
      [Infinity, 0],
      [1, 2],
    ]),
  );
  assert.throws(() =>
    cleanPolygon([
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
    ]),
  );
});
test('circle approximation and scaled volumes', () => {
  const o = circle([0, 0], 2, 3, 128);
  assert.ok(Math.abs(volume(o) - Math.PI * 12) < 0.02);
  o.scale = [2, 3, 4];
  near(volume(o), volume(circle([0, 0], 2, 3, 128)) * 24);
});
test('history branches after undo and isolates state', () => {
  const p = emptyProject(),
    h = new History(p);
  p.objects.push(rectangle([0, 0], [1, 1]));
  h.commit(p);
  p.objects[0].name = 'Cambiado';
  h.commit(p);
  assert.notEqual(h.undo().objects[0].name, 'Cambiado');
  const state = h.undo();
  assert.equal(state.objects.length, 0);
  h.commit({ ...state, name: 'Rama' });
  assert.equal(h.redo(), null);
  assert.equal(h.undo().name, 'Sin título');
});
test('project validator rejects bad indices, duplicate IDs and malformed properties', () => {
  assert.equal(validateProject(demoProject()).objects.length, 13);
  const p = emptyProject();
  p.objects.push(rectangle([0, 0], [1, 1]));
  p.objects[0].faces[0][0] = 999;
  assert.throws(() => validateProject(p));
  const q = demoProject();
  q.objects[1].id = q.objects[0].id;
  assert.throws(() => validateProject(q));
  const r = demoProject();
  r.objects[0].scale[0] = -1;
  assert.throws(() => validateProject(r));
});
test('precision input parses Spanish decimals and explicit units without ambiguity', () => {
  near(parseLength('2,8'), 2.8);
  near(parseLength('250cm'), 2.5);
  near(parseLength('5', 'mm'), 0.005);
  assert.deepEqual(parseMeasures('4;3;2,8', 'm'), [4, 3, 2.8]);
  assert.throws(() => parseLength('1e999'));
  assert.throws(() => parseLength('abc'));
});
