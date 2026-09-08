/**
 * Builds app/samples/curated/index.json: for every specialty directory under
 * app/samples/curated/ (including common_fr/common_nl), lists each form's file,
 * id (legacy guid), title, and the ids of every subform embedded in it (recursively,
 * via Subform.forms). The demo app uses this to split each specialty into top-level
 * forms vs. forms that are only reachable as a subform, without having to parse every
 * (sometimes large) form file up front.
 *
 * app/samples/curated is a git submodule (icure/speciality-forms) holding every sample
 * form, auto-converted or hand-tuned alike — there is no separate "converted" directory.
 *
 * Usage: npx ts-node --transpile-only -O '{"module":"commonjs","resolveJsonModule":true,"esModuleInterop":true}' tools/convert-legacy/build-specialty-index.ts
 */
import * as fs from 'fs'
import * as path from 'path'

const CURATED_ROOT = path.resolve(__dirname, '../../app/samples/curated')

type IndexEntry = { file: string; id: string | null; title: string; embeds: string[] }

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
	.readdirSync(CURATED_ROOT, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name)
	.sort()

for (const specialty of specialties) {
	const dir = path.join(CURATED_ROOT, specialty)
	const files = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.sort()

	index[specialty] = files.map((file) => {
		const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
		const embeds = new Set<string>()
		collectEmbeddedIds(data, embeds)
		return { file, id: data.id ?? null, title: data.form ?? file, embeds: [...embeds] }
	})
}

const outPath = path.join(CURATED_ROOT, 'index.json')
fs.writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n', 'utf-8')
console.log(`Wrote ${outPath} (${specialties.length} specialties, ${Object.values(index).reduce((s, e) => s + e.length, 0)} forms)`)
