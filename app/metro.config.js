// Metro config — monorepo-aware (watches the workspace + the @techbuilder/contracts source) + NativeWind v4.
// Verify against the installed nativewind version on first run (v4 = withNativeWind).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Monorepo: let Metro resolve the hoisted root node_modules + compile the contracts TS source.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
