# 💻 GITEGO KIDS WORLD — Desktop App (Linux / Windows / macOS)

Iyi folder (`desktop-app/`) irimo **Electron Desktop App** ihujwe ako kanya na **`https://gitego-kids-world.onrender.com`**.

## 1. Kuyifungura ako kanya (Run Desktop App)
```bash
cd /home/gitego/Downloads/projects/children-project/desktop-app
npm install
npm start
```

## 2. Gukora Installer yo guha abantu
- **Linux (`.AppImage` & `.deb`):**
  ```bash
  npm run build:linux
  ```
- **Windows (`.exe` Installer):**
  ```bash
  npm run build:win
  ```
- **macOS (`.dmg`):**
  ```bash
  npm run build:mac
  ```

Ama-installers yose asohoka muri `desktop-app/dist/`!
