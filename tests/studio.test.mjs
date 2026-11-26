import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rectangle,
  prism,
  emptyProject,
  validateProject,
  volume,
  clone,
  uid,
  normal,
} from '../src/model.mjs';
import {
  offsetPolygon,
  offsetFace,
  arcPoints,
  polyline,
  sweepProfile,
  syncComponent,
  autofold,
  pullRegion,
  dimensionGeometry,
  groupDescendants,
  libraryModel,
  dissolveEdge,
} from '../src/modeling.mjs';
import { exportDXF, importDXF, technicalSheet, worldEdges } from '../src/exchange.mjs';
import { combineSolids } from '../src/boolean.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} != ${b}`);
test('offset produces exact inset and outset and rejects collapse', () => {
  assert.deepEqual(
    offsetPolygon(
      [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
      0.25,
    ),
    [
      [0.25, 0.25],
      [3.75, 0.25],
      [3.75, 2.75],
      [0.25, 2.75],
    ],
  );
  assert.deepEqual(
    offsetPolygon(
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      -0.5,
    ),
    [
      [-0.5, -0.5],
      [2.5, -0.5],
      [2.5, 2.5],
      [-0.5, 2.5],
    ],
  );
  assert.throws(() =>
    offsetPolygon(
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      1.5,
    ),
  );
});
test('offset on transformed face retains host and coplanarity', () => {
  const o = rectangle([0, 0], [4, 3], 2);
  o.rotation[2] = 0.4;
  const inset = offsetFace(o, 1, 0.2);
  assert.equal(inset.hostId, o.id);
  assert.equal(inset.kind, 'surface');
  near(inset.vertices[1][0] - inset.vertices[0][0], 3.6);
});
test('three point arc passes through endpoints and selected bulge', () => {
  const points = arcPoints([-1, 0], [0, 1], [1, 0], 32);
  near(points[0][0], -1);
  near(points.at(-1)[0], 1);
  near(points[16][1], 1);
  assert.throws(() => arcPoints([0, 0], [1, 0], [2, 0]));
});
test('follow path sweeps a square to a closed solid of known volume', () => {
  const profile = rectangle([-0.5, -0.5], [0.5, 0.5]);
  const path = polyline([
    [0, 0, 0],
    [0, 0, 3],
  ]);
  const swept = sweepProfile(profile, path);
  near(volume(swept), 3);
  assert.equal(swept.closed, true);
  const edges = new Map();
  for (const f of swept.faces)
    for (let i = 0; i < f.length; i++) {
      const key = [f[i], f[(i + 1) % f.length]].sort((a, b) => a - b).join(':');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  assert.ok([...edges.values()].every((n) => n === 2));
});
test('follow path accepts a bent route and planarizes side faces', () => {
  const profile = rectangle([-0.1, -0.1], [0.1, 0.1]),
    route = polyline([
      [0, 0, 0],
      [0, 0, 2],
      [2, 0, 2],
    ]);
  const o = sweepProfile(profile, route);
  assert.ok(volume(o) > 0);
  for (const f of o.faces) {
    const n = normal(o.vertices, f),
      p = o.vertices[f[0]];
    for (const k of f)
      near(
        o.vertices[k].reduce((s, v, i) => s + (v - p[i]) * n[i], 0),
        0,
      );
  }
});
test('component definitions synchronize geometry and preserve instance transforms', () => {
  const p = emptyProject(),
    a = rectangle([0, 0], [1, 1], 1);
  a.componentId = uid();
  const b = clone(a);
  b.id = uid();
  b.position = [3, 4, 5];
  p.objects.push(a, b);
  a.vertices[0][0] = -0.5;
  syncComponent(p, a);
  near(b.vertices[0][0], -0.5);
  assert.deepEqual(b.position, [3, 4, 5]);
  b.componentId = null;
  a.vertices[0][0] = -1;
  syncComponent(p, a);
  near(b.vertices[0][0], -0.5);
});
test('moving a vertex autofolds adjacent nonplanar quads', () => {
  const o = rectangle([0, 0], [2, 2], 2);
  o.vertices[6][1] += 1;
  const folded = autofold(o);
  assert.ok(folded.faces.length > 6);
  assert.equal(folded.vertices.length, 8);
});
test('coplanar triangle region can be pushed after boolean operations', () => {
  const a = rectangle([0, 0], [4, 3], 2),
    b = rectangle([1, 1], [2, 2], 3),
    mesh = combineSolids(a, b, 'subtract');
  const face = mesh.faces.findIndex(
    (f) => normal(mesh.vertices, f)[1] > 0.99 && mesh.vertices[f[0]][1] > 1.9,
  );
  const before = volume(mesh),
    after = pullRegion(mesh, face, 0.5);
  assert.ok(volume(after) > before);
  near(volume(after) - before, 5.5);
});
test('dissolving a shared coplanar edge merges triangles into a polygon', () => {
  const o = rectangle([0, 0], [2, 2]);
  o.faces = [
    [3, 2, 1],
    [3, 1, 0],
  ];
  const out = dissolveEdge(o, [3, 1]);
  assert.equal(out.faces.length, 1);
  assert.equal(out.faces[0].length, 4);
});
test('associative dimensions follow transformed vertices', () => {
  const p = emptyProject(),
    o = rectangle([0, 0], [2, 2], 1);
  p.objects.push(o);
  const d = {
    id: uid(),
    a: { objectId: o.id, vertex: 0, point: [0, 0, 0] },
    b: { objectId: o.id, vertex: 1, point: [2, 0, 0] },
    offset: [0, 1, 0],
  };
  near(dimensionGeometry(d, p).length, 2);
  o.scale[0] = 3;
  o.position[0] = 8;
  near(dimensionGeometry(d, p).length, 6);
  near(dimensionGeometry(d, p).a.x, 8);
});
test('document v1 migrates, v2 preserves lines, nesting, dimensions and textures', () => {
  const old = { ...emptyProject(), version: 1 };
  delete old.dimensions;
  delete old.groups;
  assert.equal(validateProject(old).version, 2);
  const p = emptyProject(),
    line = polyline([
      [0, 0, 0],
      [1, 0, 0],
    ]);
  p.objects.push(line);
  p.groups = [
    { id: 'a', name: 'A', parent: null },
    { id: 'b', name: 'B', parent: 'a' },
  ];
  line.group = 'b';
  p.dimensions.push({
    id: 'd',
    a: { objectId: line.id, vertex: 0, point: [0, 0, 0] },
    b: { objectId: line.id, vertex: 1, point: [1, 0, 0] },
    offset: [0, 0, 1],
  });
  assert.equal(validateProject(JSON.parse(JSON.stringify(p))).dimensions.length, 1);
  assert.equal(groupDescendants(p, 'a').length, 1);
  p.groups[0].parent = 'b';
  assert.throws(() => validateProject(p));
});
test('DXF roundtrip preserves CAD axis conversion and metre scale', () => {
  const p = emptyProject(),
    line = polyline([
      [2, 3, 4],
      [5, 6, 7],
    ]);
  p.objects.push(line);
  const parsed = importDXF(exportDXF(p));
  assert.deepEqual(parsed.objects[0].vertices, line.vertices);
});
test('DXF import converts millimetres and handles circles', () => {
  const text =
    '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n8\nCIRCLE\n10\n0\n20\n0\n40\n1000\n0\nENDSEC\n0\nEOF';
  const result = importDXF(text);
  near(result.objects[0].vertices[0][0], 1);
});
test('technical sheet keeps physical scale and escapes names', () => {
  const p = emptyProject();
  p.objects.push(rectangle([0, 0], [4, 3], 2));
  p.name = '<script>abc</script>';
  const svg = technicalSheet(p, { scale: 50 });
  assert.ok(svg.includes('297mm'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('1:50'));
  assert.throws(() => technicalSheet(p, { scale: 1 }));
});
test('section clipping and tags affect drawing output', () => {
  const p = emptyProject(),
    o = rectangle([0, 0], [2, 2], 2);
  p.objects.push(o);
  p.section = { axis: 'y', value: 1, flip: false };
  assert.ok(worldEdges(p).every((e) => e.a[1] >= 1 && e.b[1] >= 1));
  p.tags = [{ id: 'x', name: 'X', visible: false }];
  o.tag = 'x';
  assert.equal(worldEdges(p).length, 0);
});
test('built-in furniture models are closed reusable components', () => {
  for (const type of ['table', 'chair', 'window', 'door', 'stairs', 'planter']) {
    const o = libraryModel(type);
    assert.ok(o.componentId);
    assert.ok(o.closed);
    assert.ok(volume(o) > 0);
    validateProject({ ...emptyProject(), objects: [o] });
  }
});
