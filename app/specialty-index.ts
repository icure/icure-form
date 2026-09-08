// Shared between app/demo-app.ts and test/specialty-index.spec.ts, so it's kept free of
// any bundler-specific API (require.context, import()) and can run under Jest.

export type SpecialtyFormEntry = { file: string; id: string | null; title: string; embeds: string[] }
export type SpecialtyIndex = Record<string, SpecialtyFormEntry[]>

/**
 * Reconciles the committed app/samples/curated/index.json — a generated snapshot, see
 * tools/convert-legacy/build-specialty-index.ts — with the `<specialty>/<file>.json`
 * paths that are actually present, so the demo app never offers a form whose file has
 * been deleted since the index was last rebuilt, and still offers forms added since
 * (with a bare entry: no id, no embeds, the file stem as title). Specialties left
 * without any file are dropped; entries are sorted by file name like the builder does.
 */
export function reconcileSpecialtyIndex(index: SpecialtyIndex, presentFiles: string[]): SpecialtyIndex {
	const known = new Map<string, SpecialtyFormEntry>()
	Object.entries(index).forEach(([specialty, entries]) => entries.forEach((e) => known.set(`${specialty}/${e.file}`, e)))
	const result: SpecialtyIndex = {}
	for (const path of [...presentFiles].sort()) {
		const slash = path.indexOf('/')
		if (slash <= 0) {
			continue
		}
		const specialty = path.slice(0, slash)
		const file = path.slice(slash + 1)
		const entry = known.get(path) ?? { file, id: null, title: file.replace(/\.json$/, ''), embeds: [] }
		;(result[specialty] ??= []).push(entry)
	}
	return result
}
