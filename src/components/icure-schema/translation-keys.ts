/**
 * Translation keys of the schema editor's chrome. Hosts translate them through the form's `translationProvider`;
 * a provider that returns the key unchanged gets the English default below.
 */
export const schemaDefaults = {
	'schema.toolbar': 'Drawing tools',
	'schema.tool': 'Tool',
	'schema.pen': 'Pen',
	'schema.highlighter': 'Highlighter',
	'schema.eraser': 'Eraser',
	'schema.color': 'Colour',
	'schema.width': 'Stroke width',
	'schema.width-value': '{width} px',
	'schema.undo': 'Undo',
	'schema.redo': 'Redo',
	'schema.clear': 'Clear',
	'schema.clear-confirm': 'Clear the whole drawing?',
	'schema.confirm': 'Confirm',
	'schema.cancel': 'Cancel',
	'schema.stencil': 'Background',
	'schema.stencil-confirm': 'Changing the background clears the drawing. Continue?',
	'schema.stencil-unavailable': 'Background image unavailable',
	'schema.blank': 'Blank canvas',
	'schema.summary': '{stencil}: {count} strokes, {colors}',
	'schema.summary-one': '{stencil}: 1 stroke, {colors}',
	'schema.summary-empty': '{stencil}: no drawing',
	'schema.drawing': 'Drawing ({count} strokes)',
	'schema.drawing-one': 'Drawing (1 stroke)',
	'schema.unreadable': 'The drawing could not be read',
	'schema.required': 'required',
	'schema.color.black': 'black',
	'schema.color.grey': 'grey',
	'schema.color.white': 'white',
	'schema.color.red': 'red',
	'schema.color.orange': 'orange',
	'schema.color.yellow': 'yellow',
	'schema.color.green': 'green',
	'schema.color.cyan': 'cyan',
	'schema.color.blue': 'blue',
	'schema.color.purple': 'purple',
	'schema.color.pink': 'pink',
	'schema.color.brown': 'brown',
} as const

export type SchemaKey = keyof typeof schemaDefaults

/** Resolves a chrome string, then substitutes its `{placeholders}`. */
export const schemaText = (
	translationProvider: ((language: string, text: string) => string) | undefined,
	language: string,
	key: SchemaKey,
	substitutions?: Record<string, string | number>,
): string => {
	const translated = translationProvider?.(language, key)
	let value: string = translated && translated !== key ? translated : schemaDefaults[key]
	for (const [k, v] of Object.entries(substitutions ?? {})) {
		value = value.split(`{${k}}`).join(String(v))
	}
	return value
}

/** The colour-name key closest to a `#rrggbb` colour, for spoken summaries. */
export const colorNameKey = (hex: string): SchemaKey => {
	const r = parseInt(hex.slice(1, 3), 16) / 255
	const g = parseInt(hex.slice(3, 5), 16) / 255
	const b = parseInt(hex.slice(5, 7), 16) / 255
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const l = (max + min) / 2
	const d = max - min
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
	if (s < 0.2 || d < 0.08) return l < 0.25 ? 'schema.color.black' : l > 0.85 ? 'schema.color.white' : 'schema.color.grey'
	const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
	if (h < 15 || h >= 345) return l < 0.3 ? 'schema.color.brown' : 'schema.color.red'
	if (h < 45) return l < 0.35 ? 'schema.color.brown' : 'schema.color.orange'
	if (h < 70) return 'schema.color.yellow'
	if (h < 165) return 'schema.color.green'
	if (h < 195) return 'schema.color.cyan'
	if (h < 255) return 'schema.color.blue'
	if (h < 290) return 'schema.color.purple'
	return 'schema.color.pink'
}
