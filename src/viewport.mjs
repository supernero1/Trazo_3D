import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { normal, uid } from './model.mjs';
import { objectGeometry, faceGeometry } from './geometry.mjs';
import { initializeStudioViewport, studioViewportMethods } from './viewport-studio.mjs';
export { THREE };
const v3 = (p) => new THREE.Vector3(...p);
function dispose(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    materials.forEach((m) => m?.dispose());
  });
}
export class Viewport {
  constructor(element, onTransform) {
    this.element = element;
    this.onTransform = onTransform;
    this.meshes = new Map();
    this.selected = new Set();
    this.edgesVisible = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#eeeae1');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Área de modelado 3D');
    element.prepend(this.canvas);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10000);
    this.camera.position.set(13, 10, 16);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    this.controls.maxPolarAngle = Math.PI * 0.99;
    this.controls.zoomSpeed = 1.1;
    this.scene.add(new THREE.HemisphereLight('#fffdf5', '#9d9f8d', 2.1));
    this.sun = new THREE.DirectionalLight('#fff5e0', 3);
    this.sun.position.set(-8, 16, 9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -22,
      right: 22,
      top: 22,
      bottom: -22,
      near: 0.5,
      far: 70,
    });
    this.sun.shadow.bias = -0.0001;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: '#e8e7dc', roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.027;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.grid = new THREE.GridHelper(200, 200, '#b1b5a3', '#c9ccbb');
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.38;
    this.grid.position.y = -0.02;
    this.scene.add(this.grid);
    this.axes = new THREE.Group();
    for (const [points, color] of [
      [
        [
          [0, 0, 0],
          [100, 0, 0],
        ],
        '#bb7965',
      ],
      [
        [
          [0, 0, 0],
          [0, 100, 0],
        ],
        '#90a27c',
      ],
      [
        [
          [0, 0, 0],
          [0, 0, 100],
        ],
        '#8a9dac',
      ],
    ]) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points.map(v3)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
      );
      line.position.y = -0.015;
      this.axes.add(line);
    }
    this.scene.add(this.axes);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.previewRoot = new THREE.Group();
    this.scene.add(this.previewRoot);
    this.pivot = new THREE.Object3D();
    this.scene.add(this.pivot);
    this.transform = new TransformControls(this.camera, this.canvas);
    this.transform.setSize(0.85);
    this.scene.add(this.transform.getHelper());
    this.transform.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      this.dragging = event.value;
    });
    this.transform.addEventListener('mouseDown', () => {
      this.pivot.updateMatrixWorld(true);
      this.pivotInverse = this.pivot.matrixWorld.clone().invert();
      this.initialMatrices = new Map(
        [...this.selected]
          .filter((id) => !this.objects.find((o) => o.id === id)?.locked)
          .map((id) => {
            const mesh = this.meshes.get(id);
            mesh?.updateMatrixWorld(true);
            return [id, mesh?.matrixWorld.clone()];
          }),
      );
      this.initialVertices = this.subSelection
        ? structuredClone(this.objects.find((o) => o.id === this.subSelection.id)?.vertices)
        : null;
    });
    this.transform.addEventListener('objectChange', () => {
      if (!this.initialMatrices || !this.dragging) return;
      this.pivot.updateMatrixWorld(true);
      const delta = new THREE.Matrix4().multiplyMatrices(this.pivot.matrixWorld, this.pivotInverse);
      const changed = [];
      if (this.subSelection && this.initialVertices) {
        const sub = this.subSelection,
          mesh = this.meshes.get(sub.id),
          inverse = mesh.matrixWorld.clone().invert();
        const vertices = structuredClone(this.initialVertices);
        for (const i of sub.indices)
          vertices[i] = v3(vertices[i])
            .applyMatrix4(mesh.matrixWorld)
            .applyMatrix4(delta)
            .applyMatrix4(inverse)
            .toArray();
        this.onTransform([{ id: sub.id, vertices }], false);
        this.refreshGeometry();
        return;
      }
      for (const [id, matrix] of this.initialMatrices) {
        if (!matrix) continue;
        const mesh = this.meshes.get(id),
          next = new THREE.Matrix4().multiplyMatrices(delta, matrix);
        next.decompose(mesh.position, mesh.quaternion, mesh.scale);
        changed.push({
          id,
          position: mesh.position.toArray(),
          rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
          scale: mesh.scale.toArray(),
        });
      }
      this.onTransform(changed, false);
    });
    this.transform.addEventListener('mouseUp', () => {
      this.initialMatrices = null;
      this.initialVertices = null;
      this.onTransform([], true);
    });
    this.raycaster = new THREE.Raycaster();
    new ResizeObserver(() => this.resize()).observe(element);
    this.resize();
    initializeStudioViewport(this);
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.tickAnnotations();
      this.renderer.render(this.scene, this.camera);
    });
  }
  resize() {
    const { clientWidth: w, clientHeight: h } = this.element;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    if (this.ortho) {
      const size = this.orthoSize || 12;
      this.camera.left = (-size * w) / h;
      this.camera.right = (size * w) / h;
      this.camera.top = size;
      this.camera.bottom = -size;
    }
    this.camera.updateProjectionMatrix();
  }
  render(objects, selected = this.selected) {
    this.objects = objects;
    this.selected = new Set(selected);
    this.transform.detach();
    dispose(this.root);
    this.root.clear();
    this.meshes.clear();
    this.clearHighlight();
    for (const object of objects) {
      if (object.kind === 'line') {
        const geometry = new THREE.BufferGeometry().setFromPoints(object.vertices.map(v3)),
          line = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({
              color: this.selected.has(object.id) ? '#bd7047' : object.color,
              clippingPlanes: this.clippingPlanes || [],
            }),
          );
        line.position.fromArray(object.position);
        line.rotation.fromArray([...object.rotation, 'XYZ']);
        line.scale.fromArray(object.scale);
        line.visible = this.isObjectVisible(object);
        line.userData.id = object.id;
        this.root.add(line);
        this.meshes.set(object.id, line);
        continue;
      }
      const materials = [],
        colorIndices = new Map(),
        geometry = objectGeometry(object),
        groups = [...geometry.groups];
      geometry.clearGroups();
      for (const group of groups) {
        const color =
          (object.faceColors[group.materialIndex] || object.color) +
          '|' +
          (object.faceTextures?.[group.materialIndex] ?? object.textureId ?? '');
        if (!colorIndices.has(color)) {
          colorIndices.set(color, materials.length);
          materials.push(this.studioMaterial(object, group.materialIndex));
        }
        const index = colorIndices.get(color),
          previous = geometry.groups.at(-1);
        if (previous?.materialIndex === index && previous.start + previous.count === group.start)
          previous.count += group.count;
        else geometry.addGroup(group.start, group.count, index);
      }
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.position.fromArray(object.position);
      mesh.rotation.fromArray([...object.rotation, 'XYZ']);
      mesh.scale.fromArray(object.scale);
      mesh.visible = this.isObjectVisible(object);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = object.id;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry, 20),
        new THREE.LineBasicMaterial({
          color: this.selected.has(object.id) ? '#bd7047' : '#5c6458',
          transparent: true,
          opacity: this.selected.has(object.id) ? 1 : 0.48,
        }),
      );
      edges.visible = this.edgesVisible;
      edges.userData.edges = true;
      mesh.add(edges);
      this.root.add(mesh);
      this.meshes.set(object.id, mesh);
    }
    this.root.updateMatrixWorld(true);
    this.refreshSubSelection();
    this.updateManipulator();
    this.drawAnnotations();
  }
  updateSelection(selected) {
    this.selected = new Set(selected);
    for (const [id, mesh] of this.meshes) {
      if (mesh.isLine)
        mesh.material.color.set(
          this.selected.has(id) ? '#bd7047' : this.objects.find((o) => o.id === id).color,
        );
      mesh.children
        .filter((c) => c.userData.edges)
        .forEach((c) => {
          c.material.color.set(this.selected.has(id) ? '#bd7047' : '#5c6458');
          c.material.opacity = this.selected.has(id) ? 1 : 0.48;
        });
    }
    this.refreshSubSelection();
    this.updateManipulator();
  }
  updateManipulator() {
    if (!['move', 'rotate', 'scale'].includes(this.tool) || !this.selected.size) {
      this.transform.detach();
      return;
    }
    const valid = [...this.selected]
      .map((id) => this.meshes.get(id))
      .filter((m) => m?.visible && !this.objects.find((o) => o.id === m.userData.id)?.locked);
    if (!valid.length) {
      this.transform.detach();
      return;
    }
    const box = new THREE.Box3();
    valid.forEach((m) => box.expandByObject(m));
    this.pivot.position.copy(box.getCenter(new THREE.Vector3()));
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.scale.set(1, 1, 1);
    this.pivot.updateMatrixWorld(true);
    if (this.subSelection) {
      const sub = this.subSelection,
        o = this.objects.find((o) => o.id === sub.id),
        mesh = this.meshes.get(sub.id);
      if (o && mesh) {
        this.pivot.position.set(0, 0, 0);
        sub.indices.forEach((i) =>
          this.pivot.position.add(v3(o.vertices[i]).applyMatrix4(mesh.matrixWorld)),
        );
        this.pivot.position.divideScalar(sub.indices.length);
        this.pivot.updateMatrixWorld(true);
      }
    }
    this.transform.setMode({ move: 'translate', rotate: 'rotate', scale: 'scale' }[this.tool]);
    this.transform.setSpace('world');
    this.transform.attach(this.pivot);
  }
  setTool(tool) {
    this.tool = tool;
    this.controls.mouseButtons.LEFT = tool === 'orbit' ? THREE.MOUSE.ROTATE : null;
    this.updateManipulator();
    this.canvas.style.cursor = [
      'rectangle',
      'circle',
      'polygon',
      'box',
      'measure',
      'extrude',
    ].includes(tool)
      ? 'crosshair'
      : tool === 'orbit'
        ? 'grab'
        : 'default';
  }
  setSnap(size) {
    this.transform.setTranslationSnap(size || null);
    this.transform.setRotationSnap(size ? Math.PI / 12 : null);
    this.transform.setScaleSnap(size ? 0.1 : null);
  }
  ray(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    return this.raycaster.ray;
  }
  pick(event) {
    this.ray(event);
    this.raycaster.params.Line.threshold = 0.08;
    const hits = this.raycaster
      .intersectObjects(
        [...this.meshes.values()].filter((m) => m.visible),
        false,
      )
      .filter((h) => !this.clippingPlanes?.some((p) => p.distanceToPoint(h.point) < 0));
    if (!hits.length) return null;
    const hit = hits[0],
      object = this.objects.find((o) => o.id === hit.object.userData.id);
    return {
      object,
      mesh: hit.object,
      point: hit.point,
      faceIndex: hit.object.geometry.userData.triangleFaces?.[hit.faceIndex],
      normal: hit.face
        ? hit.face.normal
            .clone()
            .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
            .normalize()
        : new THREE.Vector3(0, 1, 0),
    };
  }
  project(point) {
    const p = point.clone().project(this.camera),
      r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }
  nearestVertex(event, plane) {
    let best = null,
      distance = 11;
    for (const [id, mesh] of this.meshes) {
      if (!mesh.visible) continue;
      const object = this.objects.find((o) => o.id === id);
      for (const vertex of object.vertices) {
        const point = v3(vertex).applyMatrix4(mesh.matrixWorld);
        if (plane && Math.abs(plane.distanceToPoint(point)) > 0.002) continue;
        const screen = this.project(point),
          d = Math.hypot(screen.x - event.clientX, screen.y - event.clientY);
        if (d < distance) {
          best = point;
          distance = d;
        }
      }
    }
    return best;
  }
  highlight(hit) {
    this.clearHighlight();
    if (!hit || hit.faceIndex == null) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(faceGeometry(hit.object, hit.faceIndex), 3),
    );
    this.highlightMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: '#dc8d50',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.highlightMesh.applyMatrix4(hit.mesh.matrixWorld);
    this.scene.add(this.highlightMesh);
  }
  clearHighlight() {
    if (this.highlightMesh) {
      dispose(this.highlightMesh);
      this.scene.remove(this.highlightMesh);
      this.highlightMesh = null;
    }
  }
  clearPreview() {
    dispose(this.previewRoot);
    this.previewRoot.clear();
  }
  previewObject(object) {
    if (object.kind === 'line') {
      this.previewLine(
        object.vertices.map((p) =>
          v3(p).applyMatrix4(
            new THREE.Matrix4().compose(
              v3(object.position),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(...object.rotation)),
              v3(object.scale),
            ),
          ),
        ),
      );
      return;
    }
    this.clearPreview();
    const mesh = new THREE.Mesh(
      objectGeometry(object),
      new THREE.MeshBasicMaterial({
        color: '#c7844c',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    mesh.position.fromArray(object.position);
    mesh.rotation.fromArray([...object.rotation, 'XYZ']);
    mesh.scale.fromArray(object.scale);
    mesh.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: '#b77a49' }),
      ),
    );
    this.previewRoot.add(mesh);
  }
  previewLine(points, closed = false) {
    this.clearPreview();
    if (points.length < 1) return;
    const list = [...points];
    if (closed && points.length > 2) list.push(points[0]);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(list),
      new THREE.LineBasicMaterial({ color: '#ba7949', depthTest: false }),
    );
    line.renderOrder = 10;
    this.previewRoot.add(line);
    const markers = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.PointsMaterial({
        color: '#b66a3b',
        size: 6,
        sizeAttenuation: false,
        depthTest: false,
      }),
    );
    markers.renderOrder = 11;
    this.previewRoot.add(markers);
  }
  fit() {
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    [...this.meshes.values()].filter((m) => m.visible).forEach((m) => box.expandByObject(m));
    if (box.isEmpty()) {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(10, 8, 12);
      this.controls.update();
      return;
    }
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3()),
      radius = Math.max(size.length() * 0.5, 0.5);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const angle = THREE.MathUtils.degToRad(40 / 2),
      distance = (radius / Math.sin(angle)) * Math.max(1, 1 / this.camera.aspect) * 1.08;
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.target.copy(center);
    this.camera.near = Math.max(0.001, distance / 10000);
    this.camera.far = Math.max(10000, distance * 30);
    this.orthoSize = radius * 1.3 * Math.max(1, 1 / this.camera.aspect);
    this.camera.zoom = 1;
    this.resize();
    this.controls.update();
  }
  view(name) {
    const target = this.controls.target.clone(),
      dist = Math.max(this.camera.position.distanceTo(target), 10);
    const directions = {
      iso: [1, 0.8, 1.25],
      top: [0, 1, 0.0001],
      front: [0, 0.0001, 1],
      right: [1, 0.0001, 0],
    };
    this.camera.position.copy(target).addScaledVector(v3(directions[name]).normalize(), dist);
    this.controls.update();
  }
  projection() {
    const previous = this.camera;
    this.ortho = !this.ortho;
    if (this.ortho) {
      this.orthoSize =
        previous.position.distanceTo(this.controls.target) * Math.tan(THREE.MathUtils.degToRad(20));
      this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.001, 100000);
    } else this.camera = new THREE.PerspectiveCamera(40, 1, 0.001, 100000);
    this.camera.position.copy(previous.position);
    this.camera.quaternion.copy(previous.quaternion);
    this.controls.object = this.camera;
    this.transform.camera = this.camera;
    this.resize();
    this.controls.update();
    return this.ortho;
  }
  export(format) {
    this.root.updateMatrixWorld(true);
    const root = new THREE.Group();
    for (const mesh of this.meshes.values())
      if (mesh.visible && (format === 'obj' || mesh.isMesh)) {
        const copy = mesh.isLine
          ? new THREE.Line(mesh.geometry.clone(), mesh.material)
          : new THREE.Mesh(mesh.geometry.clone(), mesh.material);
        copy.name = (this.objects.find((o) => o.id === mesh.userData.id)?.name || 'Objeto').replace(
          /[^\p{L}\p{N}_-]/gu,
          '_',
        );
        copy.applyMatrix4(mesh.matrixWorld);
        root.add(copy);
      }
    const result = format === 'obj' ? new OBJExporter().parse(root) : new STLExporter().parse(root);
    root.traverse((m) => m.geometry?.dispose());
    return result;
  }
  image() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }
  importMesh(data) {
    const bytes = new Uint8Array(data.bytes),
      objects = [];
    const root =
      data.extension === '.obj'
        ? new OBJLoader().parse(new TextDecoder().decode(bytes))
        : new THREE.Mesh(new STLLoader().parse(bytes.buffer));
    root.updateMatrixWorld(true);
    root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      const a = geo.getAttribute('position'),
        vertices = [],
        faces = [],
        map = new Map();
      if (!a || a.count > 600000)
        throw new Error('La malla es demasiado grande (máximo 200.000 triángulos).');
      for (let i = 0; i + 2 < a.count; i += 3) {
        const face = [];
        for (let j = 0; j < 3; j++) {
          const point = [a.getX(i + j), a.getY(i + j), a.getZ(i + j)],
            key = point.map((n) => n.toFixed(6)).join(',');
          if (!map.has(key)) {
            map.set(key, vertices.length);
            vertices.push(point);
          }
          face.push(map.get(key));
        }
        if (new Set(face).size === 3) faces.push(face);
      }
      if (faces.length)
        objects.push({
          id: uid(),
          name: mesh.name || data.name,
          kind: 'mesh',
          vertices,
          faces,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          color: '#aebbc3',
          faceColors: {},
          visible: true,
          locked: false,
          group: null,
        });
      geo.dispose();
    });
    if (!objects.length) throw new Error('El archivo no contiene caras trianguladas válidas.');
    return objects;
  }
}
Object.assign(Viewport.prototype, studioViewportMethods);
