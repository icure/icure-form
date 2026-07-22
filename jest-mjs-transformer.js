const ts = require('typescript')

/**
 * Transforms ESM .mjs modules (e.g. @icure/cardinal-sdk) to CommonJS for jest.
 *
 * TypeScript refuses to emit CommonJS for a file whose name ends in `.mjs` (the
 * extension forces ESM output), so we transpile under a `.js` alias instead.
 */
module.exports = {
	process(sourceText, sourcePath) {
		const { outputText } = ts.transpileModule(sourceText, {
			fileName: sourcePath.replace(/\.mjs$/, '.js'),
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2020,
				allowJs: true,
				esModuleInterop: true,
				allowSyntheticDefaultImports: true,
			},
		})
		return { code: outputText }
	},
}
