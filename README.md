# IRIS Starter Application

![github-banner](documentation/images/github-banner.png)

This repo contains the official **IRIS Starter Application**, a production-ready template for building markerless
motion capture applications.

IRIS handles all the complexity of streaming real-time pose data allowing you to focus on building out your
core idea. If needed IRIS also supports running on existing video data to allow even higher accuracy.

This application is built with Electron and Vue 3, and Typescript. 3D assets are provided.

## 🚀 Quick Start

Get your development environment running in minutes:

```powershell
# Install dependencies
npm install

# Launch the developer environment
npm run dev

# Build for production
npm run build
```

You will need a FREE license key for IRIS available from [iris.cs.bath.ac.uk](https://iris.cs.bath.ac.uk/).

## 🛠️ Key Features

- **Real-time Pose Streaming**: Seamless integration with the IRIS vision engine.
- **Ready-to-use 3D Scene**: Three.js integration.
- **Modern Tech Stack**: Built with Electron, Vite, and Vue 3 for optimal performance.

## 📁 Project Structure

- `src/sidebar/threeWindow`: Main 3D viewer scene.
- `src/App.vue`: Main application UI.
- `src/components`: Application UI components.
- `src/lib`: Extra functionality not linked to a UI component.
- `public/assets/`: Directory for 3D assets (default: `Idle.fbx`).

## 💡 Example Use Cases

- **Biomechanics Analysis**: Track joint angles and skeletal movement in real-time.
- **Virtual Avatars**: Drive 3D characters using live body tracking.
- **Human-Computer Interaction**: Build gesture-controlled interfaces and environments.
- **Fitness & Sports**: Analyze form and provide feedback for physical activities.

## 🧪 Technical Notes

- **Camera Configuration**: Ensure Windows Privacy Settings allow "Desktop App" access if the camera feed is not appearing.
- **Development Mock**: The application has a mock data stream for development without active IRIS hardware.

## 🆘 Resources & Support

Please request access from mrt64@bath.ac.uk if you can't see these repositories

- [Documentation](https://github.com/Bath-Impact-Lab/IRIS-App-Starter-Project/tree/main/documentation)
- [Issue Tracker](https://github.com/Bath-Impact-Lab/IRIS/issues)

## 📄 License

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).  
Free for non-commercial use. For commercial licensing, contact mrt64@bath.ac.uk.

Built with ❤️ by the **Bath Impact Lab**.
