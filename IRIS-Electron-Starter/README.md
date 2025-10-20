# IRIS Electron Starter

An Electron app that loads a Three.js scene with a SMPLX OBJ at startup and includes a world-class animated navbar with Camera Selection. Designed as a starter to ingest real-time pose streams from IRIS in the future.

## Features
- Electron + Vite + Vue 3 renderer
- Three.js OBJ loading (uses `public/assets/SMPLX_neutral.obj` placeholder)
- Animated split-text title, glassy navbar, dark theme
- Camera Selection that auto-detects cameras via `mediaDevices` (falls back to a mock if permission/device not available)

## Setup (Windows PowerShell)
```powershell
# From the IRIS-Electron-Starter folder
npm install

# Development: runs Vite + Electron auto-reload
npm run dev

# Build Windows executable (nsis)
npm run build
```

If the camera list is empty, Windows may be denying camera access to desktop apps. Open Windows Settings > Privacy & Security > Camera and allow access. The app will still show a mock device when access is unavailable.

## Replace the OBJ
Drop your actual `SMPLX_neutral.obj` into `public/assets/` (same filename). Large OBJ files may take time to load. Consider using Draco-compressed glTF for production.

## Structure
- `electron/` main and preload scripts
- `src/` Vue renderer, Three.js scene, styles
- `public/assets/SMPLX_neutral.obj` placeholder

## Next steps
- Wire IRIS real-time pose stream (WebSocket/UDP/Shared memory) and animate skeleton
- Add robust camera preview panel with selectable resolutions and frame rates
- Crash reporting and auto-updates
