// The QuickJS variant for Jest. The package's CommonJS entry loads its parts with a dynamic import(),
// which Jest's VM rejects without --experimental-vm-modules; this builds the same variant with require.
// The emscripten glue then reads emscripten-module.wasm from disk.
module.exports = {
	type: 'sync',
	importFFI: async () => require('@jitl/quickjs-wasmfile-release-sync/ffi').QuickJSFFI,
	importModuleLoader: async () => require('@jitl/quickjs-wasmfile-release-sync/emscripten-module'),
}
module.exports.default = module.exports
