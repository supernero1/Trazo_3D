# Diseño de Trazo 3D 2.0

Estoy desarrollando Trazo 3D como un modelador local, con su propio formato de proyecto. Para el dibujo y las herramientas tomé como referencia la documentación pública de SketchUp. La integración del visor y las operaciones de edición están en este repositorio; las bibliotecas que uso conservan sus licencias y atribuciones.

## Referencia funcional

- [Conceptos de dibujo e inferencias](https://help.sketchup.com/en/sketchup/introducing-drawing-basics-and-concepts).
- [Empujar y tirar](https://help.sketchup.com/es/sketchup/pushing-and-pulling-shapes-3d).
- [Componentes reutilizables](https://help.sketchup.com/en/sketchup/components).
- [Offset](https://help.sketchup.com/en/sketchup/offsetting-line-existing-geometry).
- [Seguir recorrido](https://help.sketchup.com/en/sketchup/extruding-follow-me).

La versión 2 amplía el editor local con selección de vértices/aristas/caras, plegado de caras no planas, líneas abiertas, arcos, Offset, barrido de perfiles, componentes vinculados, jerarquías de grupos, etiquetas, texturas, cotas asociativas, secciones y documentación vectorial.

## Arquitectura

Uso Electron para la ventana y los diálogos de Windows, y Three.js para el visor. Compilo el código del visor con esbuild en `app.bundle.js` para incluir sus dependencias y poder trabajar sin red. El renderer tiene sandbox y aislamiento de contexto, sin acceso directo a Node.js. El puente expone operaciones limitadas de archivos, biblioteca, texturas y PDF. CSP restringe recursos al paquete y se bloquean navegación y solicitudes HTTP/WebSocket externas.

- model.mjs: formato versionado, validación, objetos y historial.
- geometry.mjs: triangulación y UV planares por cara.
- modeling.mjs: operaciones geométricas, Offset, arcos, barrido, plegado, regiones coplanares, componentes, cotas y grupos.
- boolean.mjs: CSG mediante Three BVH CSG / Three Mesh BVH.
- viewport.mjs y viewport-studio.mjs: WebGL, cámaras, manipuladores, selección geométrica, texturas, clipping y cotas.
- app.mjs y studio.mjs: herramientas, eventos de edición y paneles.
- exchange.mjs: DXF y láminas SVG con dimensiones físicas; main.cjs imprime el SVG a PDF mediante Chromium.

## Representación y edición

Los objetos contienen vértices locales y caras indexadas con transformación independiente. Las líneas usan una secuencia de vértices y no contienen caras. Los polígonos se triangulan para renderizar. Tras mover vértices, las caras no planas se pliegan en triángulos. El manipulador opera mediante matrices globales y transforma el resultado al espacio local del objeto.

Las instancias de un componente comparten un identificador de definición. Los cambios de geometría y materiales se propagan; las transformaciones siguen siendo independientes. Los grupos contienen objetos y grupos hijos mediante relaciones padre validadas contra ciclos.

Las cotas almacenan anclas de objeto/vértice o puntos fijos. Se resuelven según la geometría y transformación actuales. Después de una sustitución CSG se buscan los vértices equivalentes; un extremo que no sobrevive puede conservarse como punto fijo. El borrado elimina cotas con referencias inválidas.

El dibujo sobre un sólido puede guardar una relación anfitrión. Al extruirlo, la aplicación evalúa una unión para añadir o una diferencia para recortar. Empujar/tirar en mallas actúa sobre la región conectada coplanar. Las caras invertidas y contornos Offset colapsados se rechazan.

## Persistencia

El formato .trazo versión 2 conserva líneas, geometría, componentes, jerarquías, texturas embebidas, cotas, etiquetas y escenas. Se migran archivos de versión 1. La validación comprueba índices, números finitos, tamaños, colores, imágenes admitidas y ciclos de grupos antes de abrir un proyecto. El guardado usa archivo temporal y renombrado. El historial conserva hasta 100 estados; las copias de recuperación son independientes del documento guardado.

## Documentación e intercambio

DXF importa un subconjunto explícito de entidades y convierte unidades. PDF y SVG son láminas vectoriales A4/A3 con escala física y proyección de aristas/cotas. Las aristas se recortan contra la sección y se generan líneas de intersección. No hay eliminación completa de líneas ocultas ni maquetador equivalente a LayOut.

## Límites

No hay SKP, DWG, IFC, Revit, nubes de puntos, plugins de SketchUp, Warehouse o V-Ray. Las bibliotecas son locales. Los recorridos son segmentados y Offset no resuelve contornos que se dividen en islas. Las secciones del visor no tienen tapas rellenas. Las operaciones de punto flotante deben revisarse con geometrías degeneradas y contactos exactos. No se promete equivalencia completa con SketchUp ni precisión CAD industrial certificada.

## Verificación

Las pruebas geométricas cubren volúmenes, orientación, triangulación cóncava, Offset, arcos, barridos, componentes, plegado, regiones de mallas, disolución de aristas, cotas, migración, jerarquías, DXF, escalas y bibliotecas. Las comprobaciones en Electron ejercitan renderizado real, manipuladores, materiales UV, secciones, recortes, guardado/apertura de nuevas entidades, recuperación, DXF y escritura real de PDF.

En las comprobaciones de escritorio reviso el arrastre de vértices, el plegado de caras y Deshacer. También compruebo las cotas sobre la plataforma del ejemplo. Pruebo el ejecutable empaquetado por separado, porque que funcione desde el código fuente no garantiza que estén todos los archivos en la distribución.
