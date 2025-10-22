# IRIS Starter Application

Simple example application that connects to the IRIS real-time pose stream and 
connects your movements to various example avatars in a 3D visualiser.

## Features
- Electron + Vite + Vue 3 renderer
- Three.js OBJ loading
- Camera Selection that auto-detects cameras via `mediaDevices`

## Setup (Windows PowerShell)
```powershell
npm install

# Development: runs with auto-reload
npm run dev

# Build Windows executable ( run as administrator with developer mode enabled )
npm run build

# Build static web bundle only
npm run build:web
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
- support changing of avatars
- Add robust camera preview panel with selectable resolutions and frame rates
- Crash reporting and auto-updates
