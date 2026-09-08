/**
 * Ad-hoc sanity check for convertLegacy(): runs it against a handful of the raw legacy
 * form dumps extracted into app/samples/legacy/<specialty>/ and writes the resulting
 * new-format Form JSON into app/samples/curated/<specialty>/.
 *
 * app/samples/curated is a git submodule (icure/speciality-forms) holding every sample
 * form, auto-converted or hand-tuned alike. Since there's no separate directory to shield
 * hand-tuned files from a bulk regeneration anymore, this script never overwrites a file
 * that already exists there — delete the specific file first if you want a fresh
 * conversion of it.
 *
 * Usage: npx ts-node --transpile-only -O '{"module":"commonjs"}' tools/convert-legacy/sanity-check.ts [count]
 */
import * as fs from 'fs'
import * as path from 'path'
import { convertLegacy } from './icure-convert'
import { FormLayout } from './legacy/FormLayout'

const SAMPLE_COUNT = Number(process.argv[2] ?? 5)
const LEGACY_ROOT = path.resolve(__dirname, '../../app/samples/legacy')
const OUT_ROOT = path.resolve(__dirname, '../../app/samples/curated')

const specialties = fs
	.readdirSync(LEGACY_ROOT, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name)
	.sort()

let totalOk = 0
let totalFail = 0

for (const specialty of specialties) {
	const dir = path.join(LEGACY_ROOT, specialty)
	const files = fs
		.readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.sort()

	const library: FormLayout[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')))

	const picked = files.slice(0, SAMPLE_COUNT)
	const outDir = path.join(OUT_ROOT, specialty)
	fs.mkdirSync(outDir, { recursive: true })

	let ok = 0
	let fail = 0
	let skipped = 0
	for (const file of picked) {
		const outPath = path.join(outDir, file)
		if (fs.existsSync(outPath)) {
			skipped++
			continue
		}
		const form: FormLayout = library[files.indexOf(file)]
		try {
			const converted = convertLegacy(form, library)
			fs.writeFileSync(outPath, JSON.stringify(converted, null, 2) + '\n', 'utf-8')
			ok++
		} catch (e) {
			fail++
			console.error(`  FAIL ${specialty}/${file}: ${(e as Error).message}`)
		}
	}
	if (skipped) {
		console.log(`  (skipped ${skipped} already present in ${specialty})`)
	}
	totalOk += ok
	totalFail += fail
	console.log(`${specialty}: ${ok}/${picked.length} converted (${files.length} available)`)
}

console.log(`\nTotal: ${totalOk} converted, ${totalFail} failed`)
