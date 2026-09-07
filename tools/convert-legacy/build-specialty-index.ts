/**
 * Builds app/samples/converted/index.json: for every specialty directory under
 * app/samples/converted/ (including common_fr/common_nl), lists each form's file,
 * id (legacy guid), title, and the ids of every subform embedded in it (recursively,
 * via Subform.forms). The demo app uses this to split each specialty into top-level
 * forms vs. forms that are only reachable as a subform, without having to parse every
 * (sometimes large) form file up front.
 *
 * Also flags `curated: true` for any entry that has a hand-edited counterpart in
 * app/samples/curated/<specialty>/<file> (see that directory's README) — the demo app
 * loads the curated version instead and highlights it in the picker.
 *
 * Usage: npx ts-node --transpile-only -O '{"module":"commonjs","resolveJsonModule":true,"esModuleInterop":true}' tools/convert-legacy/build-specialty-index.ts
 */
import * as fs from 'fs'
import * as path from 'path'

const CONVERTED_ROOT = path.resolve(__dirname, '../../app/samples/converted')
const CURATED_ROOT = path.resolve(__dirname, '../../app/samples/curated')

type IndexEntry = { file: string; id: string | null; title: string; embeds: string[]; curated?: true }

function collectEmbeddedIds(node: unknown, acc: Set<string>) {
	if (Array.isArray(node)) {
		node.forEach((item) => collectEmbeddedIds(item, acc))
		return
	}
	if (node && typeof node === 'object') {
		const obj = node as Record<string, unknown>
		if (obj.clazz === 'subform' && obj.forms && typeof obj.forms === 'object') {
			for (const child of Object.values(obj.forms as Record<string, unknown>)) {
				const childForm = child as { id?: string }
				if (childForm?.id) {
					acc.add(childForm.id)
				}
				collectEmbeddedIds(child, acc)
			}
		}
		for (const value of Object.values(obj)) {
			collectEmbeddedIds(value, acc)
		}
	}
}

const index: Record<string, IndexEntry[]> = {}

const specialties = fs
	.readdirSync(CONVERTED_ROOT, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name)
	.sort()

for (const specialty of specialties) {
	const dir = path.join(CONVERTED_ROOT, specialty)
	const files = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.sort()

	index[specialty] = files.map((file) => {
		const curatedPath = path.join(CURATED_ROOT, specialty, file)
		const curated = fs.existsSync(curatedPath)
		const data = JSON.parse(fs.readFileSync(curated ? curatedPath : path.join(dir, file), 'utf-8'))
		const embeds = new Set<string>()
		collectEmbeddedIds(data, embeds)
		return { file, id: data.id ?? null, title: data.form ?? file, embeds: [...embeds], ...(curated ? { curated: true as const } : {}) }
	})
}

const outPath = path.join(CONVERTED_ROOT, 'index.json')
fs.writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n', 'utf-8')
console.log(`Wrote ${outPath} (${specialties.length} specialties, ${Object.values(index).reduce((s, e) => s + e.length, 0)} forms)`)
