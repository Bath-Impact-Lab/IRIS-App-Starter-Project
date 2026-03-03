'use strict';

const path = require('path');
const fs = require('fs');

// In dev:       <project>/public/assets/mockExtrinsics.json
// In packaged:  <app>/resources/assets/mockExtrinsics.json
const mockExtrinsicsPath = () => {
  if (process.resourcesPath && !process.env.VITE_DEV_SERVER_URL) {
    return path.join(process.resourcesPath, 'assets', 'mockExtrinsics.json');
  }
  return path.join(__dirname, '..', 'public', 'assets', 'mockExtrinsics.json');
};

const filePath = mockExtrinsicsPath();
const MOCK_EXTRINSICS = JSON.parse(fs.readFileSync(filePath, 'utf8'));

module.exports = { MOCK_EXTRINSICS };
