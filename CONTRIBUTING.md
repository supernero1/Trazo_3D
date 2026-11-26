# Cómo contribuir

Todavía estoy ajustando herramientas y corrigiendo casos de geometría. Si encuentras un error, abre un issue con los pasos para reproducirlo y, cuando sea posible, un modelo pequeño de ejemplo.

Para trabajar en el proyecto necesitas Windows x64, Node.js 24 o superior y npm:

```powershell
npm ci
npm start
```

Antes de enviar cambios, ejecuta:

```powershell
npm test
npm run format:check
npm run build
```

Si modificas herramientas, materiales, archivos o el visor, comprueba también la aplicación abierta. Puedes ejecutar `npm run smoke` para las comprobaciones de escritorio; usan un perfil separado y guardan sus resultados en `work/`.

Prefiero cambios centrados en un problema concreto. Explica qué cambia y cómo lo comprobaste. Si añades una operación geométrica, acompáñala con una prueba que compruebe el resultado, no solo que la función termine sin errores.

Uso Prettier para mantener el mismo formato en el código y la documentación. `npm run format` aplica el formato antes de enviar los cambios.

No incluyas `node_modules/`, ejecutables, carpetas de compilación ni archivos personales. Los avisos de las dependencias deben conservarse en `THIRD-PARTY-NOTICES.txt`.
