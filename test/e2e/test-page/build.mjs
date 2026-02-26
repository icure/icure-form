import * as esbuild from 'esbuild'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import * as sass from 'sass'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../..')

// Plugin: Load YAML files as string exports
const yamlPlugin = {
	name: 'yaml-loader',
	setup(build) {
		build.onLoad({ filter: /\.yaml$/ }, async (args) => {
			const content = await fs.promises.readFile(args.path, 'utf8')
			return {
				contents: `export default ${JSON.stringify(content)}`,
				loader: 'js',
			}
		})
	},
}

// Plugin: Compile SCSS/CSS and wrap as Lit css tagged template
const scssPlugin = {
	name: 'scss-loader',
	setup(build) {
		build.onLoad({ filter: /\.s[ca]ss$/ }, async (args) => {
			const result = sass.compile(args.path)
			const escaped = result.css.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
			return {
				contents: `import { css } from 'lit'; export default css\`${escaped}\``,
				loader: 'js',
			}
		})
		build.onLoad({ filter: /\.css$/ }, async (args) => {
			const content = await fs.promises.readFile(args.path, 'utf8')
			const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
			return {
				contents: `import { css } from 'lit'; export default css\`${escaped}\``,
				loader: 'js',
			}
		})
	},
}

// Banner: customElements.define shim to prevent duplicate registration errors
const banner = `
(function() {
	const origDefine = customElements.define.bind(customElements);
	customElements.define = function(name, constructor, options) {
		if (customElements.get(name)) return;
		origDefine(name, constructor, options);
	};
})();
`

await esbuild.build({
	entryPoints: [path.resolve(__dirname, 'harness.ts')],
	bundle: true,
	format: 'esm',
	platform: 'browser',
	target: 'esnext',
	outfile: path.resolve(__dirname, 'harness.bundle.js'),
	banner: { js: banner },
	plugins: [yamlPlugin, scssPlugin],
	define: {
		'process.env.NODE_ENV': '"development"',
	},
	logLevel: 'info',
})

console.log('Build complete: harness.bundle.js')
