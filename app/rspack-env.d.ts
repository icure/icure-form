// Typings for the webpack-compatible `require.context` that rspack provides, limited to the
// subset app/demo-app.ts uses (lazy mode: calling the context returns a Promise of the
// module's exports). Augments @types/node's `require` rather than redeclaring it; kept out
// of src/ so the published library stays bundler-agnostic.
interface RspackLazyContext {
	keys(): string[]
	(id: string): Promise<unknown>
}

declare namespace NodeJS {
	interface Require {
		context(directory: string, useSubdirectories: boolean, regExp: RegExp, mode: 'lazy'): RspackLazyContext
	}
}
