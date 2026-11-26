# Trazo 3D 2.0

Aplicación de modelado 3D para Windows x64, en español y sin conexión. Implementación propia inspirada en el flujo de trabajo de SketchUp.

## Ejecutar

Abre el archivo portable `Trazo3D-Portable-2.0.0.exe` con doble clic. Si tu copia se llama `Trazo3D-2.0.exe`, se ejecuta de la misma manera. Incluye su motor de escritorio y todas las dependencias. No requiere instalar Node.js, iniciar sesión, abrir un navegador o mantener un servidor. El portable tarda unos segundos en extraer el motor al abrirse.

El instalador está en `dist/Trazo3D-Instalador-2.0.0.exe`. Cierra las ventanas de la versión anterior antes de abrir la nueva, para que Windows no reutilice una ventana antigua. Los proyectos .trazo de la versión 1 se pueden abrir en la versión 2; guarda una copia si deseas conservar el original para usarlo con la aplicación anterior.

## Nuevas funciones

- Edición de objetos, vértices, aristas y caras con manipuladores y desplazamiento numérico. Las caras que se doblan se dividen en triángulos para mantener superficies planas.
- Líneas abiertas, polígonos cerrados, círculos, cajas y arcos de tres puntos.
- Offset de caras y Seguir recorrido para llevar un perfil plano por una línea.
- Empujar/tirar sobre regiones coplanares de mallas trianguladas.
- Integración de dibujo sobre sólidos: una extrusión positiva añade volumen y una negativa puede crear una cavidad o perforación.
- Componentes vinculados. Editar la geometría actualiza sus instancias; Hacer único rompe el vínculo.
- Grupos anidados, etiquetas con visibilidad y escenas que recuerdan cámara, proyección, sección y visibilidad.
- Texturas de madera, ladrillo, cerámica y hormigón; importación de PNG/JPEG/WebP; tamaño de patrón y opacidad.
- Cotas permanentes asociadas a vértices, planos de sección y estilos sólido, monocromo, alambre y rayos X.
- Biblioteca local con mesa, silla, ventana, puerta, escalera y jardinera. Puedes guardar componentes propios.
- Intercambio OBJ/STL/DXF y láminas vectoriales a escala en PDF/SVG.

## Primer modelo

1. Pulsa Nuevo y guarda el proyecto anterior si lo necesitas.
2. Pulsa R, marca una esquina en el suelo, escribe `4;3` y pulsa Enter.
3. Pulsa P, selecciona la superficie, escribe `2,8` y pulsa Enter.
4. Activa Vértice o pulsa 2 desde Seleccionar, marca una esquina y pulsa M para moverla con el manipulador.
5. Vuelve a Objeto con 1; selecciona el modelo y abre Modelar > Crear componente vinculado. Ctrl+D conserva el vínculo al duplicarlo.
6. Pulsa Ctrl+S para guardar el proyecto .trazo.

El ejemplo Casa patio contiene texturas, dos ventanas vinculadas y una cota asociativa de la plataforma.

## Controles

| Acción                                 | Control                                       |
| -------------------------------------- | --------------------------------------------- |
| Seleccionar                            | Espacio                                       |
| Modos Objeto / Vértice / Arista / Cara | 1 / 2 / 3 / 4, desde Seleccionar              |
| Selección múltiple de objetos          | Ctrl + clic                                   |
| Rectángulo / círculo / caja            | R / C / B                                     |
| Línea abierta                          | L; Enter termina                              |
| Polígono cerrado                       | Botón Polígono; Enter o clic en inicio cierra |
| Arco de tres puntos                    | A; inicio, final y punto intermedio           |
| Offset                                 | F; clic en cara y distancia                   |
| Empujar / tirar                        | P                                             |
| Mover / rotar / escalar                | M / Q / S                                     |
| Material por cara / objeto completo    | T + clic / T + Shift + clic                   |
| Medida temporal / cota permanente      | D / K                                         |
| Orbitar                                | O o botón central                             |
| Encuadrar                              | Inicio o botón Encuadrar                      |
| Duplicar / agrupar                     | Ctrl+D / Ctrl+G                               |
| Deshacer / rehacer                     | Ctrl+Z / Ctrl+Y                               |
| Borrar selección                       | Supr                                          |
| Guardar / guardar como                 | Ctrl+S / Ctrl+Shift+S                         |
| Abrir / nuevo                          | Ctrl+O / Ctrl+N                               |
| Cancelar / ayuda                       | Esc / F1                                      |

Rueda: zoom. Botón derecho: desplazar la cámara. La barra de herramientas y el inspector admiten desplazamiento con la rueda. El inspector tiene pestañas Objeto y materiales y Proyecto.

## Precisión

Las medidas internas son metros; puedes trabajar en metros, centímetros o milímetros. Se admiten punto y coma decimal y sufijos explícitos: `2,8m`, `250cm`, `80mm`. Para separar varias medidas utiliza punto y coma.

- Rectángulo: `ancho;fondo`.
- Caja: `ancho;fondo;alto`.
- Círculo: radio.
- Extrusión y Offset: una distancia.
- Mover: `X;Y;Z` como desplazamiento relativo. En geometría usa el campo Desplazar geometría o Medidas con M activo.
- Rotar: ángulo en grados alrededor de Y.
- Escalar: factor uniforme.

Marca primero el punto inicial de un dibujo. En una línea, una longitud escrita añade un tramo en la dirección del cursor; Enter sin escribir termina el recorrido. Se reconocen vértices, puntos medios, direcciones paralelas/perpendiculares y rejilla. Derecha fija X, arriba Y, izquierda Z y abajo libera el eje. Shift fuerza una dirección de dibujo; Alt ignora el ajuste.

## Geometría, componentes y grupos

Activa Vértice, Arista o Cara, selecciona el elemento y utiliza M/Q/S. Editar la geometría de un componente actualiza sus instancias, que conservan posiciones, rotaciones y escalas independientes. Cambiar las dimensiones de una instancia modifica su escala, no la definición compartida. Modelar > Hacer único permite editar una copia por separado.

Supr sobre una cara la elimina. Sobre un vértice elimina también las caras conectadas. Sobre una arista disuelve la separación si las dos caras son coplanares; se rechazan aristas entre caras inclinadas. Puedes deshacer estas operaciones.

En Proyecto > Objetos, clic en un grupo selecciona sus miembros y doble clic entra en él. El dibujo nuevo se añade al contexto actual. Salir del grupo o Esc vuelve al nivel superior. Ctrl+G puede envolver grupos existentes para crear una jerarquía.

## Offset, recorridos y recortes

Offset: F, clic en una cara y distancia + Enter. Positivo crea un contorno hacia dentro; negativo hacia fuera. El resultado es una superficie extruible. Se rechazan contornos colapsados o que necesiten dividirse en islas.

Seguir recorrido: selecciona una superficie de una sola cara y una línea usando Ctrl. Abre Modelar > Seguir recorrido. El perfil se centra en el inicio del recorrido y se orienta perpendicularmente a él. Se conservan los originales.

Recortar: dibuja sobre un sólido con Integrar dibujo sobre sólidos activo. Pulsa P sobre la superficie nueva e introduce una distancia negativa. Una distancia suficiente atraviesa el sólido. La extrusión positiva añade volumen mediante unión.

Sólidos: selecciona A y después B con Ctrl. El menú permite unión, diferencia A−B e intersección. Límite combinado: 30.000 caras. Empujar/tirar opera sobre la región conectada coplanar de una cara seleccionada.

## Materiales y documentación

En Objeto y materiales, elige una textura y pulsa Aplicar. Las imágenes importadas se incluyen dentro del proyecto. El tamaño del patrón se introduce en metros. T pinta una cara; Shift pinta el objeto completo.

K crea una cota con tres clics: primer extremo, segundo extremo y posición. Los extremos ajustados a vértices siguen sus transformaciones. Proyecto > Cotas permanentes permite eliminarlas. Las cotas se guardan y se incluyen en capturas y planos.

En Proyecto > Secciones y visualización, elige el eje y posición del plano de corte. Invertir cambia el lado visible. El visor no genera una tapa rellena; las láminas añaden líneas de intersección con el plano.

En Proyecto > Láminas y CAD, selecciona planta o alzado, escala 1:n y papel A4/A3. El PDF/SVG tiene dimensiones físicas. Si el modelo no cabe, usa un denominador mayor o papel A3. Imprime al 100%, sin ajustar a página. Es una proyección de aristas y cotas, sin eliminación completa de líneas ocultas.

## Archivos y recuperación

- .trazo: modelo completo, componentes, grupos, etiquetas, texturas embebidas, cotas, secciones y escenas. La versión 2 abre archivos de la versión 1.
- OBJ/STL: intercambio de mallas en metros. STL no conserva materiales; este exportador OBJ tampoco genera MTL ni empaqueta imágenes.
- DXF: importa LINE, POLYLINE/LWPOLYLINE sin bulge, CIRCLE y ARC, convirtiendo las unidades del encabezado. Se informa la cantidad de elementos omitidos. Exporta aristas y cotas como LINE/TEXT en metros, no sólidos CAD paramétricos.
- PNG: captura del visor con cotas.
- PDF/SVG: lámina vectorial a escala.

El autoguardado crea una copia recuperable cada 20 segundos si hay cambios y ninguna operación a medio terminar. Guarda explícitamente tus proyectos para conservarlos en la carpeta elegida.

## Límites que permanecen

No se abren SKP, DWG, IFC, Revit o nubes de puntos. No se usan 3D Warehouse, Extension Warehouse, V-Ray ni servicios de Trimble. La biblioteca es local. No hay motor fotorealista, plugins compatibles con SketchUp, LayOut completo, superficies NURBS, terreno georreferenciado ni equivalencia con todas las herramientas de SketchUp.

Los contornos y recorridos son segmentados; Offset no divide contornos complejos en islas. CSG y el plegado tienen límites con geometría degenerada y contactos exactos. Revisa los resultados antes de fabricar o construir. No es un núcleo CAD industrial certificado.

## Desarrollo

```powershell
npm ci
npm start
npm test
npm run dist
```

Si npm bloquea el instalador de Electron, ejecuta `node node_modules/electron/install.js`. Esbuild genera src/app.bundle.js con las dependencias del visor.

`node scripts/smoke.cjs` comprueba el visor de desarrollo. Para un paquete: `node scripts/smoke.cjs "dist/win-unpacked/Trazo 3D.exe"`. Las pruebas usan un perfil independiente en work y escriben informes, capturas y archivos reales de prueba allí.

El modelo y la validación están en src/model.mjs; herramientas en src/modeling.mjs y src/studio.mjs; visor en src/viewport*.mjs; DXF y láminas en src/exchange.mjs. main.cjs/preload.cjs controlan ventana y archivos con aislamiento de contexto y sandbox.

Código MIT. Los avisos de bibliotecas están en THIRD-PARTY-NOTICES.txt y dentro del paquete.
