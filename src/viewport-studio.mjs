import * as THREE from 'three';
import { edgesOf, matrixOf, vec, dimensionGeometry } from './modeling.mjs';
import { objectGeometry } from './geometry.mjs';
import { formatLength } from './measure.mjs';
function clear(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (m?.map && o.userData.label) m.map.dispose();
      m?.dispose();
    });
  });
  root.clear();
}
export function initializeStudioViewport(view) {
  view.document = null;
  view.textureCache = new Map();
  view.clippingPlanes = [];
  view.renderer.localClippingEnabled = true;
  view.annotations = new THREE.Group();
  view.scene.add(view.annotations);
  view.subRoot = new THREE.Group();
  view.scene.add(view.subRoot);
  view.inferenceRoot = new THREE.Group();
  view.scene.add(view.inferenceRoot);
}
export const studioViewportMethods = {
  applyDocument(project) {
    this.document = project;
    const s = project.section;
    this.clippingPlanes = s
      ? [
          new THREE.Plane(
            new THREE.Vector3(
              s.axis === 'x' ? 1 : 0,
              s.axis === 'y' ? 1 : 0,
              s.axis === 'z' ? 1 : 0,
            ).multiplyScalar(s.flip ? -1 : 1),
            s.value * (s.flip ? 1 : -1),
          ),
        ]
      : [];
  },
  isObjectVisible(o) {
    return o.visible && !this.document?.tags?.some((t) => t.id === o.tag && t.visible === false);
  },
  texture(id, scale = 1) {
    if (!id) return null;
    const source = this.document?.textures?.find((t) => t.id === id),
      key = id + ':' + scale + ':' + (source?.data.length || 0);
    if (this.textureCache.has(key)) return this.textureCache.get(key);
    let texture;
    if (source) texture = new THREE.TextureLoader().load(source.data);
    else {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const c = canvas.getContext('2d');
      if (id === 'wood') {
        c.fillStyle = '#b28657';
        c.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 64; i++) {
          c.strokeStyle = i % 3 ? '#a47b4e' : '#c9a277';
          c.lineWidth = i % 3 ? 1 : 3;
          c.beginPath();
          c.moveTo(0, i * 4);
          c.bezierCurveTo(64, i * 4 + 8, 170, i * 4 - 9, 256, i * 4 + 2);
          c.stroke();
        }
        c.fillStyle = '#725538';
        c.fillRect(0, 0, 256, 3);
      } else if (id === 'brick') {
        c.fillStyle = '#d7c5ae';
        c.fillRect(0, 0, 256, 256);
        for (let y = 0; y < 4; y++)
          for (let x = -1; x < 3; x++) {
            c.fillStyle = (x + y) % 2 ? '#b47856' : '#a66a4c';
            c.fillRect(x * 128 + (y % 2 ? 64 : 0) + 4, y * 64 + 4, 120, 56);
          }
      } else if (id === 'tile') {
        c.fillStyle = '#e9e5db';
        c.fillRect(0, 0, 256, 256);
        c.strokeStyle = '#aaa99d';
        c.lineWidth = 4;
        c.strokeRect(1, 1, 254, 254);
      } else {
        c.fillStyle = '#b7bab5';
        c.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 3000; i++) {
          c.fillStyle = i % 2 ? '#c7cac5' : '#a6aaa4';
          c.fillRect((i * 73) % 256, (i * 131) % 256, 2, 2);
        }
      }
      texture = new THREE.CanvasTexture(canvas);
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1 / scale, 1 / scale);
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    this.textureCache.set(key, texture);
    return texture;
  },
  studioMaterial(o, index) {
    const style = this.document?.displayStyle || 'solid',
      texture = this.texture(o.faceTextures?.[index] ?? o.textureId, o.textureScale || 1),
      opacity = style === 'xray' ? 0.28 : (o.opacity ?? 1);
    return new THREE.MeshStandardMaterial({
      color: style === 'mono' ? '#faf8ef' : texture ? '#ffffff' : o.faceColors[index] || o.color,
      map: style === 'mono' || style === 'wire' ? null : texture,
      wireframe: style === 'wire',
      transparent: opacity < 1,
      opacity,
      roughness: o.roughness ?? 0.86,
      metalness: o.metalness ?? 0,
      side: THREE.DoubleSide,
      clippingPlanes: this.clippingPlanes,
      clipShadows: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
  },
  refreshGeometry() {
    for (const o of this.objects) {
      const mesh = this.meshes.get(o.id);
      if (!mesh) continue;
      mesh.geometry.dispose();
      mesh.geometry =
        o.kind === 'line'
          ? new THREE.BufferGeometry().setFromPoints(o.vertices.map(vec))
          : objectGeometry(o);
      if (o.kind !== 'line') {
        const indices = new Map();
        for (const group of mesh.geometry.groups) {
          const key =
            (o.faceColors[group.materialIndex] || o.color) +
            '|' +
            (o.faceTextures?.[group.materialIndex] ?? o.textureId ?? '');
          if (!indices.has(key)) indices.set(key, indices.size);
          group.materialIndex = indices.get(key);
        }
      }
      for (const edge of [...mesh.children])
        if (edge.userData.edges) {
          edge.geometry.dispose();
          edge.geometry = new THREE.EdgesGeometry(mesh.geometry, 20);
        }
    }
    this.refreshSubSelection();
    this.drawAnnotations();
  },
  setSubSelection(sub) {
    this.subSelection = sub;
    this.refreshSubSelection();
    this.updateManipulator();
  },
  refreshSubSelection() {
    clear(this.subRoot);
    const sub = this.subSelection;
    if (!sub) return;
    const o = this.objects?.find((o) => o.id === sub.id),
      mesh = this.meshes.get(sub.id);
    if (!o || !mesh || sub.indices.some((i) => !o.vertices[i])) {
      this.subSelection = null;
      return;
    }
    const points = sub.indices.map((i) => vec(o.vertices[i]).applyMatrix4(matrixOf(o)));
    const markers = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.PointsMaterial({
        color: '#db753e',
        size: 9,
        sizeAttenuation: false,
        depthTest: false,
      }),
    );
    markers.renderOrder = 30;
    this.subRoot.add(markers);
    if (sub.type === 'edge') {
      const edge = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: '#d67136', depthTest: false }),
      );
      edge.renderOrder = 30;
      this.subRoot.add(edge);
    }
  },
  pickElement(event, mode) {
    const hit = this.pick(event);
    if (mode === 'face')
      return hit?.faceIndex != null
        ? {
            id: hit.object.id,
            type: 'face',
            indices: [...hit.object.faces[hit.faceIndex]],
            faceIndex: hit.faceIndex,
          }
        : null;
    let best = null,
      threshold = mode === 'vertex' ? 12 : 9;
    const candidates = hit
      ? [hit.object]
      : this.objects.filter((o) => this.isObjectVisible(o) && this.selected.has(o.id));
    for (const o of candidates) {
      if (o.locked) continue;
      const matrix = matrixOf(o),
        points = o.vertices.map((v) => vec(v).applyMatrix4(matrix));
      if (mode === 'vertex')
        points.forEach((p, i) => {
          const s = this.project(p),
            distance = Math.hypot(s.x - event.clientX, s.y - event.clientY);
          if (distance < threshold) {
            threshold = distance;
            best = { id: o.id, type: mode, indices: [i] };
          }
        });
      else
        for (const edge of edgesOf(o)) {
          const a = this.project(points[edge[0]]),
            b = this.project(points[edge[1]]),
            dx = b.x - a.x,
            dy = b.y - a.y,
            len = dx * dx + dy * dy,
            t = len
              ? Math.max(
                  0,
                  Math.min(1, ((event.clientX - a.x) * dx + (event.clientY - a.y) * dy) / len),
                )
              : 0,
            distance = Math.hypot(event.clientX - a.x - t * dx, event.clientY - a.y - t * dy);
          if (distance < threshold) {
            threshold = distance;
            best = { id: o.id, type: mode, indices: edge };
          }
        }
    }
    return best;
  },
  infer(event, plane) {
    let best = null,
      limit = 11;
    const add = (p, label, anchor) => {
      if (plane && Math.abs(plane.distanceToPoint(p)) > 0.002) return;
      const s = this.project(p),
        d = Math.hypot(s.x - event.clientX, s.y - event.clientY);
      if (d < limit) {
        limit = d;
        best = { point: p, label, anchor };
      }
    };
    for (const o of this.objects) {
      if (!this.isObjectVisible(o) || o.vertices.length > 20000) continue;
      const m = matrixOf(o);
      o.vertices.forEach((v, i) => {
        const p = vec(v).applyMatrix4(m);
        add(p, '● Vértice', { objectId: o.id, vertex: i, point: p.toArray() });
      });
      for (const [a, b] of edgesOf(o))
        add(
          vec(o.vertices[a]).add(vec(o.vertices[b])).multiplyScalar(0.5).applyMatrix4(m),
          '◆ Punto medio',
          null,
        );
    }
    this.lastInference = best;
    return best;
  },
  drawAnnotations() {
    clear(this.annotations);
    if (!this.document) return;
    for (const d of this.document.dimensions || []) {
      if (
        [d.a, d.b].some(
          (a) =>
            a.objectId &&
            !this.isObjectVisible(
              this.objects.find((o) => o.id === a.objectId) || { visible: false },
            ),
        )
      )
        continue;
      const g = dimensionGeometry(d, this.document),
        color = '#5d6f79',
        dir = g.q.clone().sub(g.p).normalize(),
        off = vec(d.offset).normalize(),
        tick = dir.clone().add(off).normalize().multiplyScalar(0.07),
        pairs = [
          g.a,
          g.p,
          g.b,
          g.q,
          g.p,
          g.q,
          g.p.clone().sub(tick),
          g.p.clone().add(tick),
          g.q.clone().sub(tick),
          g.q.clone().add(tick),
        ];
      this.annotations.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(pairs),
          new THREE.LineBasicMaterial({ color, depthTest: false }),
        ),
      );
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const c = canvas.getContext('2d');
      c.fillStyle = '#fffef2ed';
      c.fillRect(0, 0, 256, 64);
      c.font = '25px Segoe UI';
      c.fillStyle = color;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(formatLength(g.length, this.document.units), 128, 32);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
      label.position.copy(g.p).add(g.q).multiplyScalar(0.5);
      label.userData.label = true;
      label.renderOrder = 50;
      this.annotations.add(label);
    }
  },
  tickAnnotations() {
    for (const label of this.annotations.children)
      if (label.isSprite) {
        const height = this.ortho
          ? (this.camera.top - this.camera.bottom) / this.camera.zoom
          : 2 *
            this.camera.position.distanceTo(label.position) *
            Math.tan(THREE.MathUtils.degToRad(20));
        const unit = height / this.element.clientHeight;
        label.scale.set(unit * 100, unit * 25, 1);
      }
  },
};
