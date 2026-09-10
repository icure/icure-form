/**
 * Ports the `formulas` of legacy `FormLayout` forms onto the curated
 * `@icure/form` forms in `app/samples/curated`, as `computedProperties.value`.
 *
 * The legacy converter (`icure-convert.ts`) never looked at `formulas`, so the
 * curated forms were published without any computed field. This script fills that
 * gap from the legacy sources, using the hand-written translations in
 * `formula-ports.ts`, and reports everything it could not port.
 *
 * Usage:
 *   npx ts-node tools/convert-legacy/port-formulas.ts [--legacy <dir>] [--curated <dir>] [--report <file>] [--dry-run]
 *
 * Defaults: --legacy app/samples/legacy  --curated app/samples/curated
 *           --report tools/convert-legacy/FORMULA-PORTS.md
 *
 * How a formula finds its destination. A curated form is a valid destination for a
 * legacy formula when
 *   1. it descends from the same legacy form — same id as the legacy `guid`, or
 *      the same `<group>/<name>` title (the curated set deduplicated forms and
 *      reissued some ids, so either match counts as provenance); and
 *   2. it contains the target field *and* every field the formula reads.
 * Provenance alone fans out onto forms that never had the formula; containment
 * alone would drop it onto unrelated forms that happen to have the right fields.
 * Both together make "is this the right place" a property of the data.
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

import { FORMULA_PORTS, FORMULA_REPAIRS, FormulaPort, FormulaRepair, PortContext } from './formula-ports'

type LegacyFormula = {
	legacyFile: string
	guid?: string
	title: string
	/** The legacy field `name`, which is what the formula's identifiers are built from. */
	target: string
	legacyType?: string
	formula: string
	hash: string
	/** Identifiers the formula reads that look like field references. */
	identifiers: string[]
}

type CuratedForm = {
	file: string
	id?: string
	title?: string
	json: any
	/** Normalised field name -> the field name as written in the form. */
	fieldsByNormalisedName: Map<string, string>
	fieldTypes: Map<string, string | undefined>
}

/** Field names, legacy identifiers and formula identifiers all collapse to this. */
const normalise = (value: string): string =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')

const sha8 = (value: string): string => crypto.createHash('sha1').update(value).digest('hex').slice(0, 8)

/** Legacy constructs with no equivalent in the `computedProperties` sandbox. */
const UNPORTABLE: [RegExp, string][] = [
	[/@</, 'reads services through a legacy XPath expression'],
	[/sscontacts\[|\/services\[/, 'reads services through a legacy XPath expression'],
	[/withServices\s*\(/, "looks services up across the patient's other contacts"],
	[/\bpatient\./, 'reads patient demographics'],
	[/elDeSoinLogic/, 'reads services from a care path'],
	[/\bconsultDate\b/, 'reads the consultation date from the host'],
]

const unportableReason = (formula: string): string | undefined => UNPORTABLE.find(([pattern]) => pattern.test(formula))?.[1]

// Double-quoted strings first: the French text inside them carries apostrophes
// that would otherwise open a bogus single-quoted string.
const STRING_LITERALS = [/"(?:\\.|[^"\\])*"/g, /'(?:\\.|[^'\\])*'/g]

/** Language keywords, host objects and member names that are never field references. */
const RESERVED = new Set([
	'new',
	'void',
	'null',
	'true',
	'false',
	'return',
	'var',
	'if',
	'else',
	'for',
	'while',
	'function',
	'typeof',
	'Math',
	'Date',
	'Long',
	'String',
	'Number',
	'Boolean',
	'Array',
	'Object',
	'org',
	'taktik',
	'icure',
	'util',
	'eof',
	'Measure',
	'interpolate',
	'pow',
	'max',
	'min',
	'round',
	'abs',
	'sqrt',
	'floor',
	'ceil',
	'length',
	'time',
	'getTime',
	'value',
	'content',
	'fr',
	'nl',
	'en',
	'instantValue',
	'measureValue',
	'stringValue',
	'numberValue',
	'resolve',
	'reject',
	'services',
	'label',
	'direction',
	'limit',
	'descending',
	'id',
	'equals',
	'h',
	'x',
	'p',
	'dateUtils',
	'fuzzyDateToDaysSince1970',
	'fuzzyDateToDate',
	'dateToDaysSince1970',
	'StatMath',
	'obsWeights',
	'withServices',
	'undefined',
])

/**
 * The identifiers a legacy formula reads as fields: every bare identifier that is
 * neither a keyword nor a local, plus every `x.<field>` of the later dialect.
 * String literals are stripped first — formulas embed long French sentences,
 * lookup tables and map keys such as `ws['Hadlock et al. 1985']` that would
 * otherwise read as identifiers.
 */
const fieldIdentifiers = (formula: string): string[] => {
	const body = STRING_LITERALS.reduce((text, pattern) => text.replace(pattern, '""'), formula)
	const locals = new Set<string>()
	for (const match of body.matchAll(/\bvar\s+([A-Za-z_][A-Za-z0-9_]*)/g)) locals.add(match[1])
	for (const match of body.matchAll(/(?:^|[;\n{])\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/g)) locals.add(match[1])
	const identifiers = new Set<string>()
	for (const match of body.matchAll(/\bx\.([A-Za-z_][A-Za-z0-9_]*)/g)) identifiers.add(match[1])
	for (const match of body.matchAll(/(?:^|[^.\w])([A-Za-z_][A-Za-z0-9_]*)/g)) {
		if (!RESERVED.has(match[1]) && !locals.has(match[1])) identifiers.add(match[1])
	}
	return [...identifiers].sort()
}

const jsonFilesIn = (dir: string): string[] =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? jsonFilesIn(path.join(dir, entry.name)) : entry.name.endsWith('.json') ? [path.join(dir, entry.name)] : []))

const walk = (node: any, visit: (node: any) => void): void => {
	if (Array.isArray(node)) node.forEach((child) => walk(child, visit))
	else if (node && typeof node === 'object') {
		visit(node)
		Object.values(node).forEach((child) => walk(child, visit))
	}
}

const readLegacyFormulas = (legacyDir: string): LegacyFormula[] => {
	const formulas: LegacyFormula[] = []
	for (const file of jsonFilesIn(legacyDir)) {
		const form = JSON.parse(fs.readFileSync(file, 'utf8'))
		const relative = path.relative(legacyDir, file)
		const title = `${form.group ?? ''}/${form.name ?? ''}`
		walk(form, (node) => {
			// A legacy field is the only node carrying both a name and an editor.
			if (!node.name || !node.editor || !node.formulas?.length) return
			for (const { value } of node.formulas as { value?: string }[]) {
				if (!value) continue
				formulas.push({
					legacyFile: relative,
					guid: form.guid,
					title,
					target: node.name,
					legacyType: node.type,
					formula: value,
					hash: sha8(value),
					identifiers: fieldIdentifiers(value),
				})
			}
		})
	}
	return formulas.sort((a, b) => a.legacyFile.localeCompare(b.legacyFile) || a.target.localeCompare(b.target))
}

const readCuratedForms = (curatedDir: string): CuratedForm[] =>
	jsonFilesIn(curatedDir)
		.filter((file) => path.basename(file) !== 'index.json')
		.map((file) => {
			const json = JSON.parse(fs.readFileSync(file, 'utf8'))
			const fieldsByNormalisedName = new Map<string, string>()
			const fieldTypes = new Map<string, string | undefined>()
			walk(json, (node) => {
				if (node.clazz === 'field' && typeof node.field === 'string') {
					// First spelling wins, so a form holding both "Remarques" and
					// "remarques" resolves deterministically.
					if (!fieldsByNormalisedName.has(normalise(node.field))) fieldsByNormalisedName.set(normalise(node.field), node.field)
					fieldTypes.set(node.field, node.type)
				}
			})
			return { file: path.relative(curatedDir, file), id: json.id, title: json.form, json, fieldsByNormalisedName, fieldTypes }
		})

const contextFor = (form: CuratedForm): PortContext => {
	const name = (legacyIdent: string): string => {
		const resolved = form.fieldsByNormalisedName.get(normalise(legacyIdent))
		if (!resolved) throw new Error(`${form.file} has no field for legacy identifier '${legacyIdent}'`)
		return resolved
	}
	const item = (legacyIdent: string) => `self[${JSON.stringify(name(legacyIdent))}]?.[0]`
	return { name, item, value: (legacyIdent) => `parseContent(${item(legacyIdent)}?.content)` }
}

/** Sets `computedProperties.value` on a field, returning the previous body if any. */
const applyToField = (form: CuratedForm, fieldName: string, body: string): string | undefined => {
	let previous: string | undefined
	walk(form.json, (node) => {
		if (node.clazz !== 'field' || node.field !== fieldName) return
		node.computedProperties = { ...(node.computedProperties ?? {}) }
		previous = node.computedProperties.value
		node.computedProperties.value = body
	})
	return previous
}

type Outcome =
	| { kind: 'ported'; destinations: string[] }
	| { kind: 'no-port'; reason: string }
	| { kind: 'unportable'; reason: string }
	| { kind: 'no-descendant' }
	| { kind: 'missing-fields'; nearest: string; missing: string[] }

const main = () => {
	const args = process.argv.slice(2)
	const flag = (name: string, fallback: string) => {
		const index = args.indexOf(`--${name}`)
		return index >= 0 ? args[index + 1] : fallback
	}
	const legacyDir = flag('legacy', 'app/samples/legacy')
	const curatedDir = flag('curated', 'app/samples/curated')
	const reportFile = flag('report', 'tools/convert-legacy/FORMULA-PORTS.md')
	const dryRun = args.includes('--dry-run')

	if (!fs.existsSync(legacyDir)) throw new Error(`No legacy forms in ${legacyDir}. Pass --legacy <dir>.`)

	const ports = new Map<string, FormulaPort>(FORMULA_PORTS.map((port) => [port.hash, port]))
	if (ports.size !== FORMULA_PORTS.length) throw new Error('formula-ports.ts has duplicate hashes')

	const legacyFormulas = readLegacyFormulas(legacyDir)
	const curatedForms = readCuratedForms(curatedDir)
	const byId = new Map<string, CuratedForm[]>()
	const byTitle = new Map<string, CuratedForm[]>()
	for (const form of curatedForms) {
		if (form.id) byId.set(form.id, [...(byId.get(form.id) ?? []), form])
		if (form.title) byTitle.set(form.title, [...(byTitle.get(form.title) ?? []), form])
	}

	/** (curated file, field) -> the bodies each legacy formula wants there. */
	const applied = new Map<string, { form: CuratedForm; field: string; bodies: Map<string, LegacyFormula[]> }>()
	const outcomes: [LegacyFormula, Outcome][] = []
	const usedHashes = new Set<string>()

	for (const formula of legacyFormulas) {
		const provenance = [...new Set([...(byId.get(formula.guid ?? '') ?? []), ...(byTitle.get(formula.title) ?? [])])]
		const needed = [formula.target, ...formula.identifiers]
		const destinations = provenance.filter((form) => needed.every((field) => form.fieldsByNormalisedName.has(normalise(field))))

		if (!destinations.length) {
			const reason = unportableReason(formula.formula)
			if (reason) outcomes.push([formula, { kind: 'unportable', reason }])
			else if (!provenance.length) outcomes.push([formula, { kind: 'no-descendant' }])
			else {
				const nearest = provenance
					.map((form) => ({ form, missing: needed.filter((field) => !form.fieldsByNormalisedName.has(normalise(field))) }))
					.sort((a, b) => a.missing.length - b.missing.length)[0]
				outcomes.push([formula, { kind: 'missing-fields', nearest: nearest.form.file, missing: nearest.missing }])
			}
			continue
		}

		const reason = unportableReason(formula.formula)
		if (reason) {
			outcomes.push([formula, { kind: 'unportable', reason }])
			continue
		}

		const port = ports.get(formula.hash)
		if (!port) {
			outcomes.push([formula, { kind: 'no-port', reason: `no entry for hash ${formula.hash} in formula-ports.ts` }])
			continue
		}
		usedHashes.add(port.hash)

		for (const form of destinations) {
			const context = contextFor(form)
			const field = context.name(formula.target)
			const body = port.build(context, formula.identifiers)
			const key = `${form.file}\u0000${field}`
			const entry = applied.get(key) ?? { form, field, bodies: new Map<string, LegacyFormula[]>() }
			entry.bodies.set(body, [...(entry.bodies.get(body) ?? []), formula])
			applied.set(key, entry)
		}
		outcomes.push([formula, { kind: 'ported', destinations: destinations.map((form) => form.file) }])
	}

	// Several legacy forms can claim the same field of the same curated form (the
	// curated set merged copies that each carried their own spelling of the same
	// formula). Identical bodies collapse; genuinely different ones are a conflict
	// resolved towards the body the most legacy forms asked for, and reported.
	const conflicts: string[] = []
	for (const { form, field, bodies } of applied.values()) {
		const ranked = [...bodies.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
		if (ranked.length > 1) {
			conflicts.push(
				`- \`${form.file}\` › **${field}** — ${ranked.length} different ported bodies; kept the one from ${ranked[0][1].length} legacy form(s) ` +
					`(${[...new Set(ranked[0][1].map((f) => f.legacyFile))].join(', ')}), dropped ${ranked
						.slice(1)
						.map(([, formulas]) => `\`${formulas[0].hash}\``)
						.join(', ')}`,
			)
		}
		applyToField(form, field, ranked[0][0])
	}

	// Repairs land last and never over a port: a field a legacy formula could be
	// ported onto is not a field in need of repair.
	const repaired: [FormulaRepair, CuratedForm][] = []
	for (const repair of FORMULA_REPAIRS) {
		const form = curatedForms.find((candidate) => candidate.file === repair.file)
		if (!form) throw new Error(`repair targets ${repair.file}, which is not in ${curatedDir}`)
		if (!form.fieldTypes.has(repair.field)) throw new Error(`repair targets ${repair.file} › ${repair.field}, which the form does not have`)
		if (applied.has(`${repair.file}\u0000${repair.field}`)) {
			console.error(`repair of ${repair.file} › ${repair.field} skipped: a legacy formula was ported onto it`)
			process.exitCode = 1
			continue
		}
		applyToField(form, repair.field, repair.build(contextFor(form)))
		repaired.push([repair, form])
	}

	const touched = [...new Set([...[...applied.values()].map(({ form }) => form), ...repaired.map(([, form]) => form)])]
	if (!dryRun) {
		for (const form of touched) fs.writeFileSync(path.join(curatedDir, form.file), `${JSON.stringify(form.json, null, 2)}\n`)
		fs.writeFileSync(reportFile, report(legacyFormulas, outcomes, applied, conflicts, usedHashes, repaired))
	}

	const counts = outcomes.reduce((acc, [, outcome]) => ({ ...acc, [outcome.kind]: (acc[outcome.kind] ?? 0) + 1 }), {} as Record<string, number>)
	console.log(`${legacyFormulas.length} legacy formulas:`, counts)
	console.log(`${applied.size} computed fields from ports, ${repaired.length} from repairs, across ${touched.length} curated forms${dryRun ? ' (dry run, nothing written)' : ''}`)
	if (conflicts.length) console.log(`${conflicts.length} field(s) claimed by more than one legacy formula — see ${reportFile}`)
	const unused = FORMULA_PORTS.filter((port) => !usedHashes.has(port.hash))
	if (unused.length) {
		console.error(`unused port entries: ${unused.map((port) => port.hash).join(', ')}`)
		process.exitCode = 1
	}
}

const report = (
	legacyFormulas: LegacyFormula[],
	outcomes: [LegacyFormula, Outcome][],
	applied: Map<string, { form: CuratedForm; field: string; bodies: Map<string, LegacyFormula[]> }>,
	conflicts: string[],
	usedHashes: Set<string>,
	repaired: [FormulaRepair, CuratedForm][],
): string => {
	const group = (kind: Outcome['kind']) => outcomes.filter(([, outcome]) => outcome.kind === kind)
	const out: string[] = []
	out.push('# Legacy formula port', '')
	out.push(
		'Generated by `tools/convert-legacy/port-formulas.ts`. It reads the legacy `formulas` of the pixel-positioned forms and writes the ones that still have a home as',
		'`computedProperties.value` on the matching curated form. Everything it leaves behind is listed here so the gap is visible rather than silent.',
		'',
	)
	out.push(`- legacy formulas found: **${legacyFormulas.length}** (${new Set(legacyFormulas.map((f) => f.formula)).size} distinct texts)`)
	out.push(`- ported: **${group('ported').length}** onto **${applied.size}** computed fields, from **${usedHashes.size}** hand-written translations`)
	out.push(`- repaired: **${repaired.length}** field(s) whose legacy formula was broken beyond porting`)
	out.push(`- the legacy form has no curated descendant: **${group('no-descendant').length}**`)
	out.push(`- needs data the sandbox cannot reach: **${group('unportable').length}**`)
	out.push(`- reads a field the curated form does not have: **${group('missing-fields').length}**`)
	out.push(`- no translation written yet: **${group('no-port').length}**`, '')

	out.push('## Ported', '')
	out.push('| curated form | field | legacy formula(s) |', '| --- | --- | --- |')
	for (const { form, field, bodies } of [...applied.values()].sort((a, b) => a.form.file.localeCompare(b.form.file) || a.field.localeCompare(b.field))) {
		const sources = [...new Set([...bodies.values()].flat().map((formula) => formula.hash))].sort()
		out.push(`| \`${form.file}\` | ${field} | ${sources.map((hash) => `\`${hash}\``).join(', ')} |`)
	}
	out.push('')

	if (conflicts.length) out.push('### Fields claimed by more than one legacy formula', '', ...conflicts, '')

	if (repaired.length) {
		out.push(
			'## Repaired',
			'',
			'Not ports. The legacy formula on these fields reads a field its own form never had, but the intent is unambiguous and the curated form carries the operands under other names.',
			'',
		)
		out.push('| curated form | field | legacy formula | assumption |', '| --- | --- | --- | --- |')
		for (const [repair] of repaired) out.push(`| \`${repair.file}\` | ${repair.field} | \`${repair.legacy}\` | ${repair.notes} |`)
		out.push('')
	}

	const listing = (title: string, rows: [LegacyFormula, Outcome][], detail: (outcome: Outcome) => string) => {
		if (!rows.length) return
		out.push(`## ${title}`, '')
		out.push('| legacy form | field | detail | formula |', '| --- | --- | --- | --- |')
		for (const [formula, outcome] of rows.sort(([a], [b]) => a.legacyFile.localeCompare(b.legacyFile) || a.target.localeCompare(b.target))) {
			const text = formula.formula.replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 160)
			out.push(`| \`${formula.legacyFile}\` | ${formula.target} | ${detail(outcome)} | \`${text}\` |`)
		}
		out.push('')
	}

	listing('Needs data the sandbox cannot reach', group('unportable'), (outcome) => (outcome as { reason: string }).reason)
	listing('Reads a field the curated form does not have', group('missing-fields'), (outcome) => {
		const { nearest, missing } = outcome as { nearest: string; missing: string[] }
		return `absent from \`${nearest}\`: ${missing.map((field) => `\`${field}\``).join(', ')}`
	})
	listing('No translation written yet', group('no-port'), (outcome) => (outcome as { reason: string }).reason)

	const orphans = group('no-descendant')
	if (orphans.length) {
		out.push('## The legacy form has no curated descendant', '')
		const byFile = orphans.reduce((acc, [formula]) => ({ ...acc, [formula.legacyFile]: (acc[formula.legacyFile] ?? 0) + 1 }), {} as Record<string, number>)
		out.push('| legacy form | formulas |', '| --- | --- |')
		for (const [file, count] of Object.entries(byFile).sort(([a], [b]) => a.localeCompare(b))) out.push(`| \`${file}\` | ${count} |`)
		out.push('')
	}
	return `${out.join('\n')}\n`
}

main()
