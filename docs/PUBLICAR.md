# Subir el proyecto a GitHub

Los fuentes van en el repositorio; los instaladores y portables van como archivos de una versión en Releases. Dejé `.gitignore` preparado para separar ambas cosas.

## Repositorio

El código está en [supernero1/Trazo_3D](https://github.com/supernero1/Trazo_3D). Para trabajar con él en otro equipo:

```powershell
git clone https://github.com/supernero1/Trazo_3D.git
cd Trazo_3D
npm ci
npm start
```

Necesitas Node.js 24 o superior. Si solo quieres usar la aplicación, descarga el instalador o el portable de una versión publicada en Releases.

## Primer envío

Abre una terminal en la carpeta del proyecto. La carpeta de trabajo original ya tiene Git iniciado en la rama `main`; si estás usando una copia extraída del ZIP, inicia Git primero:

```powershell
git init -b main
```

Revisa qué archivos se van a incluir:

```powershell
git status
```

Configura tu nombre y correo de Git si todavía no lo has hecho. Después prepara el primer commit:

```powershell
git add .
git commit -m "Añadir Trazo 3D 2.0"
```

Si preparaste el proyecto desde el ZIP, configura el repositorio remoto antes del primer envío. Una copia creada con `git clone` ya tiene `origin` configurado:

```powershell
git remote add origin https://github.com/supernero1/Trazo_3D.git
git push -u origin main
```

GitHub te pedirá autenticarte con tu cuenta. No pongas contraseñas ni tokens en archivos del proyecto.

## Generar los ejecutables

Puedes hacerlo en tu equipo:

```powershell
npm ci
npm run dist
```

O desde la pestaña Actions del repositorio: abre **Compilar para Windows** y pulsa **Run workflow**. Al terminar, el flujo deja un archivo descargable con el instalador y el portable. Ese flujo no crea una publicación automáticamente.

## Crear una versión en Releases

1. Abre Releases y crea una nueva versión.
2. Usa una etiqueta que coincida con `package.json`, por ejemplo `v2.0.0`.
3. Adjunta `Trazo3D-Instalador-2.0.0.exe` y `Trazo3D-Portable-2.0.0.exe` desde `dist/` o desde los archivos descargados de Actions.
4. Describe los cambios y publica la versión cuando esté revisada.

Los ejecutables no se suben con `git add`: `.gitignore` los excluye. También quedan fuera `node_modules/`, `work/`, los informes de pruebas y el archivo compilado del visor. Conserva `package-lock.json` para instalar las mismas versiones de las dependencias.
