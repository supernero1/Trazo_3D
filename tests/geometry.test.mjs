import test from 'node:test';
import assert from 'node:assert/strict';
import { rectangle, prism, volume, validateProject, emptyProject } from '../src/model.mjs';
import { objectGeometry } from '../src/geometry.mjs';
import { combineSolids } from '../src/boolean.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.0001, `${a} != ${b}`);
test('concave polygon triangulation covers area without filling its notch', () => {
  const object = prism([
      [0, 0],
      [4, 0],
      [4, 1],
      [1, 1],
      [1, 4],
      [0, 4],
    ]),
    geo = objectGeometry(object),
    p = geo.getAttribute('position');
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = [p.getX(i), p.getZ(i)],
      b = [p.getX(i + 1), p.getZ(i + 1)],
      c = [p.getX(i + 2), p.getZ(i + 2)];
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }
  near(area, 7);
  geo.dispose();
});
test('boolean union, subtraction and intersection preserve expected volume', () => {
  const a = rectangle([0, 0], [2, 2], 2),
    b = rectangle([1, 0], [3, 2], 2);
  near(volume(combineSolids(a, b, 'union')), 12);
  near(volume(combineSolids(a, b, 'subtract')), 4);
  near(volume(combineSolids(a, b, 'intersect')), 4);
});
test('subtracting an enclosed tool creates a cavity', () => {
  const a = rectangle([0, 0], [4, 4], 4),
    b = rectangle([1, 1], [3, 3], 2);
  b.position[1] = 1;
  const result = combineSolids(a, b, 'subtract');
  near(volume(result), 56);
  assert.equal(result.closed, true);
  validateProject({ ...emptyProject(), objects: [result] });
});
test('boolean transformed operands are evaluated in world coordinates', () => {
  const a = rectangle([0, 0], [1, 1], 1),
    b = rectangle([0, 0], [1, 1], 1);
  a.scale = [2, 2, 2];
  b.position = [1, 0, 0];
  near(volume(combineSolids(a, b, 'union')), 8);
  near(volume(combineSolids(a, b, 'subtract')), 7);
});
test('empty intersection and surface operands are handled', () => {
  const a = rectangle([0, 0], [1, 1], 1),
    b = rectangle([4, 4], [5, 5], 1);
  assert.equal(combineSolids(a, b, 'intersect'), null);
  assert.throws(() => combineSolids(a, rectangle([0, 0], [1, 1]), 'union'));
});
