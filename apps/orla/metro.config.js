const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const monorepoRoot = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);

// Watch the monorepo packages
config.watchFolders = [monorepoRoot];

// Resolve packages from the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(monorepoRoot, 'node_modules'),
  path.resolve(__dirname, 'node_modules'),
];

module.exports = config;
