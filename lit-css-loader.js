// Minimal loader that wraps CSS as a Lit css tagged template (replaces lit-scss-loader)
module.exports = function (source) {
	const escaped = source.replace(/`/g, '\\`').replace(/\\/g, '\\\\')
	return `import { css } from 'lit'; export default css\`${escaped}\``
}
