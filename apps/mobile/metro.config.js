// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The Colyseus SDK imports the Node "ws" package as a fallback, but uses the
// runtime's global WebSocket whenever one exists (React Native and browsers
// always have it). Resolve "ws" to an empty module so native bundles build.
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws') return { type: 'empty' };
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
