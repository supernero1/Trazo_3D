import DxfParser from 'dxf-parser';
import { edgesOf, matrixOf, vec, polyline, dimensionGeometry } from './modeling.mjs';
import { formatLength, unitFactor } from './measure.mjs';
export function worldEdges(project) {
  const result = [],
    section = project.section,
    axis = section ? { x: 0, y: 1, z: 2 }[section.axis] : -1;
  const clip = (a, b) => {
    if (!section) return [a, b];
    const sign = section.flip ? -1 : 1,
      da = (a[axis] - section.value) * sign,
      db = (b[axis] - section.value) * sign;
    if (da < 0 && db < 0) return null;
    if (da < 0 || db < 0) {
      const t = da / (da - db),
        p = a.map((v, i) => v + (b[i] - v) * t);
      return da < 0 ? [p, b] : [a, p];
    }
    return [a, b];
  };
  for (const o of project.objects) {
    if (!o.visible || project.tags?.some((t) => t.id === o.tag && t.visible === false)) continue;
    const m = matrixOf(o),
      vertices = o.vertices.map((p) => vec(p).applyMatrix4(m).toArray());
    for (const edge of edgesOf(o)) {
      const pair = clip(vertices[edge[0]], vertices[edge[1]]);
      if (pair) result.push({ a: pair[0], b: pair[1], layer: o.tag || o.name });
    }
    if (section)
      for (const f of o.faces) {
        const hits = [];
        for (let i = 0; i < f.length; i++) {
          const a = vertices[f[i]],
            b = vertices[f[(i + 1) % f.length]],
            da = a[axis] - section.value,
            db = b[axis] - section.value;
          if (da * db < 0) {
            const t = da / (da - db);
            hits.push(a.map((v, j) => v + (b[j] - v) * t));
          }
        }
        if (hits.length === 2) result.push({ a: hits[0], b: hits[1], layer: 'SECCION' });
      }
  }
  return result;
}
export function exportDXF(project) {
  const lines = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1015',
    '9',
    '$INSUNITS',
    '70',
    '6',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];
  const cad = (p) => [p[0], -p[2], p[1]],
    name = (s) =>
      String(s)
        .replace(/[^\w-]/g, '_')
        .slice(0, 100) || 'MODELO';
  const segment = (a, b, layer) => {
    a = cad(a);
    b = cad(b);
    lines.push(
      '0',
      'LINE',
      '8',
      name(layer),
      '10',
      String(a[0]),
      '20',
      String(a[1]),
      '30',
      String(a[2]),
      '11',
      String(b[0]),
      '21',
      String(b[1]),
      '31',
      String(b[2]),
    );
  };
  for (const e of worldEdges(project)) segment(e.a, e.b, e.layer);
  for (const d of project.dimensions || []) {
    const g = dimensionGeometry(d, project);
    segment(g.a.toArray(), g.p.toArray(), 'COTAS');
    segment(g.b.toArray(), g.q.toArray(), 'COTAS');
    segment(g.p.toArray(), g.q.toArray(), 'COTAS');
    const p = cad(g.p.clone().add(g.q).multiplyScalar(0.5).toArray());
    lines.push(
      '0',
      'TEXT',
      '8',
      'COTAS',
      '10',
      String(p[0]),
      '20',
      String(p[1]),
      '30',
      String(p[2]),
      '40',
      '.12',
      '1',
      formatLength(g.length, project.units),
    );
  }
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}
export function importDXF(text, defaultUnit = 'm') {
  const parsed = new DxfParser().parseSync(text),
    factor =
      { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 }[parsed.header?.$INSUNITS] ||
      unitFactor(defaultUnit),
    objects = [];
  const convert = (p) => [(p.x || 0) * factor, (p.z || 0) * factor, -(p.y || 0) * factor];
  let skipped = 0;
  for (const e of parsed.entities || []) {
    let points;
    if (['LINE', 'LWPOLYLINE', 'POLYLINE'].includes(e.type)) {
      if (e.vertices?.some((p) => p.bulge)) {
        skipped++;
        continue;
      }
      points = (e.vertices || []).map(convert);
      if (e.shape && points.length) points.push([...points[0]]);
    } else if (['CIRCLE', 'ARC'].includes(e.type)) {
      const start = e.startAngle || 0,
        end = e.type === 'CIRCLE' ? Math.PI * 2 : e.endAngle,
        span = (((end - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2;
      points = Array.from({ length: 65 }, (_, i) =>
        convert({
          x: e.center.x + e.radius * Math.cos(start + (span * i) / 64),
          y: e.center.y + e.radius * Math.sin(start + (span * i) / 64),
          z: e.center.z || 0,
        }),
      );
    } else {
      skipped++;
      continue;
    }
    if (points.length >= 2) objects.push(polyline(points, `${e.layer || 'DXF'} · ${e.type}`));
    if (objects.length > 10000) throw new Error('DXF demasiado grande.');
  }
  if (!objects.length)
    throw new Error('El DXF no contiene líneas, polilíneas, círculos o arcos compatibles.');
  return { objects, skipped };
}
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
export function technicalSheet(project, { view = 'top', scale = 50, paper = 'A4' } = {}) {
  if (!Number.isFinite(scale) || scale < 1 || scale > 10000)
    throw new Error('Escala de plano inválida.');
  const [width, height] = paper === 'A3' ? [420, 297] : [297, 210],
    factor = 1000 / scale,
    projection = (p) =>
      view === 'front' ? [p[0], -p[1]] : view === 'right' ? [p[2], -p[1]] : [p[0], p[2]];
  const segments = worldEdges(project).map((e) => ({ a: projection(e.a), b: projection(e.b) })),
    annotations = (project.dimensions || []).map((d) => {
      const g = dimensionGeometry(d, project);
      return {
        a: projection(g.a.toArray()),
        b: projection(g.b.toArray()),
        p: projection(g.p.toArray()),
        q: projection(g.q.toArray()),
        text: formatLength(g.length, project.units),
      };
    });
  if (!segments.length) throw new Error('No hay geometría visible para el plano.');
  const points = segments
      .flatMap((s) => [s.a, s.b])
      .concat(annotations.flatMap((d) => [d.a, d.b, d.p, d.q])),
    min = [Infinity, Infinity],
    max = [-Infinity, -Infinity];
  points.forEach((p) =>
    p.forEach((v, i) => {
      min[i] = Math.min(min[i], v);
      max[i] = Math.max(max[i], v);
    }),
  );
  const available = [width - 30, height - 50],
    size = max.map((v, i) => (v - min[i]) * factor);
  if (size.some((v, i) => v > available[i]))
    throw new Error(
      `El modelo no cabe en ${paper} a 1:${scale}. Elige una escala con denominador mayor o una hoja A3.`,
    );
  const offset = [15 + (available[0] - size[0]) / 2, 12 + (available[1] - size[1]) / 2],
    p = (q) => q.map((v, i) => (v - min[i]) * factor + offset[i]);
  const line = (a, b, color = '#333', stroke = 0.18) => {
    a = p(a);
    b = p(b);
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${color}" stroke-width="${stroke}"/>`;
  };
  let content = segments.map((s) => line(s.a, s.b)).join('');
  for (const d of annotations) {
    content +=
      line(d.a, d.p, '#5a6d7a', 0.13) +
      line(d.b, d.q, '#5a6d7a', 0.13) +
      line(d.p, d.q, '#5a6d7a', 0.13);
    const a = p(d.p),
      b = p(d.q),
      mid = a.map((v, i) => (v + b[i]) / 2);
    content += `<text x="${mid[0]}" y="${mid[1] - 1}" text-anchor="middle" font-size="2.8" fill="#344c59" stroke="#fff" stroke-width=".9" paint-order="stroke">${escape(d.text)}</text>`;
  }
  const viewName =
    { top: 'Planta', front: 'Alzado frontal', right: 'Alzado lateral' }[view] || 'Planta';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" style="font-family:Arial,sans-serif"><rect width="${width}" height="${height}" fill="white"/><rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="#777" stroke-width=".2"/>${content}<path d="M8 ${height - 27}H${width - 8}" stroke="#777" stroke-width=".2"/><text x="14" y="${height - 18}" font-size="4">${escape(project.name)}</text><text x="14" y="${height - 12}" font-size="2.8">${viewName}${project.section ? ' · Sección ' + escape(project.section.axis.toUpperCase()) + ' = ' + project.section.value + ' m' : ''} · Escala 1:${scale} · ${paper}</text><text x="${width - 14}" y="${height - 12}" text-anchor="end" font-size="2.8">Trazo 3D · Proyección de aristas</text></svg>`;
}
