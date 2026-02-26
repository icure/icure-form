// Custom loader that wraps CSS content as a Lit css tagged template literal
// Replaces lit-scss-loader for use with Rspack
module.exports = function litCssLoader(source) {
	const minified = source.replace(/\n/g, '').replace(/\s+/g, ' ').trim()
	return `import { css } from 'lit';\nexport default css\`${minified}\`;`
}
