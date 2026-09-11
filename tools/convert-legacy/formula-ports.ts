/**
 * Hand-written ports of the legacy `formulas` found on legacy `FormLayout` fields
 * to the `computedProperties.value` bodies understood by `@icure/form`.
 *
 * Why a table and not a transpiler: the legacy corpus mixes three unrelated
 * dialects (a Java-flavoured expression language with `void`, `l` long suffixes
 * and `new Long(...)`; a later `x.<field>` / `h.dateUtils` JavaScript; and an
 * async `withServices(p.id, ...)` callback style), and only a few dozen distinct
 * formulas survive the move to the curated forms. Translating those by hand is
 * both shorter and far more trustworthy than a parser for dialects nobody
 * maintains any more.
 *
 * Each entry is keyed by the SHA-1 (first 8 hex chars) of the *exact* legacy
 * formula text, so a port can never drift onto a formula it was not written for.
 * `hash` is the only thing matched on; the `legacy` text is there to be read, and
 * the longest ones are abbreviated with an ellipsis.
 * `build` receives a `PortContext` that resolves a legacy identifier (the legacy
 * field `name` with spaces/accents/punctuation removed) to the field name as it
 * appears in the destination curated form, so one entry serves every form the
 * legacy source fanned out to.
 *
 * Sandbox contract the bodies rely on (see `BridgedFormValuesContainer.compute`):
 * - a field label resolves to its versions, most recent first, so a value is
 *   `self['<label>']?.[0]`;
 * - `parseContent(content)` turns the raw content into a primitive: a number for
 *   number fields, a **unit-normalised** number for measures (`normalizeUnit`
 *   converts cm/mm to metres, g to kg…), a `Date` for date fields, and an array
 *   of booleans for a checkbox's compound content;
 * - the returned value is converted by `convertRawValue`, so a body may return a
 *   plain number, string, boolean, `Date`, or `{ value, unit }` for a measure;
 * - returning `undefined` leaves the field alone.
 */

/** Resolves legacy identifiers to expressions against the destination form. */
export type PortContext = {
	/** The destination field name for a legacy identifier. */
	name: (legacyIdent: string) => string
	/** `self['<field>']?.[0]` — the most recent value of the field. */
	item: (legacyIdent: string) => string
	/** `parseContent(self['<field>']?.[0]?.content)` — its parsed primitive. */
	value: (legacyIdent: string) => string
	/** The option ids of a field that has them, in the order the form declares them. */
	options: (legacyIdent: string) => string[]
}

export type FormulaPort = {
	/** First 8 hex chars of the SHA-1 of the legacy formula text. */
	hash: string
	/** The legacy formula, verbatim, for review. */
	legacy: string
	/** What the port does and every judgement call it makes. */
	notes: string
	/** Emits the `computedProperties.value` body for one destination form. */
	build: (c: PortContext, refs: readonly string[]) => string
}

const lines = (...parts: (string | undefined)[]) => parts.filter((p) => p !== undefined).join('\n')

/** `true` when a checkbox has at least one option ticked. */
const CHECKED = 'const checked = (v) => { const c = parseContent(v?.content); return Array.isArray(c) ? c.some(Boolean) : !!c }'

/**
 * Days since 1970 for a local date, ignoring the time of day — the equivalent of
 * the legacy `h.dateUtils.dateToDaysSince1970` / `fuzzyDateToDaysSince1970`.
 */
const DAY_NUMBER = 'const dayNumber = (d) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)'

/** A `Date` from what `parseContent` returns for a date field (a `Date`, or a `yyyyMMdd[HHmmss]` fuzzy date). */
const AS_DATE =
	"const asDate = (v) => { if (v instanceof Date) { return v } if (typeof v !== 'number') { return undefined } const s = '' + v; return s.length >= 8 ? new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) : new Date(v) }"

/**
 * Adds whole days to a date through its calendar fields. Adding
 * `n * 86400000` milliseconds instead would drift by an hour across a daylight
 * saving change — and land on the previous day when the clocks go forward.
 */
const ADD_DAYS = 'const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)'

/**
 * Piecewise-linear lookup over a `"x1,y1;x2,y2;…"` table — a transcription of
 * `org.taktik.icure.utils.Math.interpolate` in kraken-cloud
 * (`kraken-common/domain/.../utils/Math.kt`), which walks the pairs until the
 * first whose x is at or above the wanted value and interpolates against the
 * previous one. Below the first point it returns the first y and above the last
 * it returns the last, so this clamps at both ends too.
 *
 * Empty segments are skipped. The Kotlin drops trailing ones (`dropLastWhile`)
 * and throws on any other, and one table in the corpus — the 97th centile row of
 * the head circumference chart, which reads `97>;16,136.11;…` — has a stray
 * separator at the *front*. Skipping instead of throwing reads that row as the
 * curve it plainly is; see the note on `97d6ebdf`.
 */
const INTERPOLATE = lines(
	'const interpolate = (table, v) => {',
	"\tconst pts = table.split(';').filter((p) => p).map((p) => p.split(',').map(Number))",
	'\tif (v <= pts[0][0]) { return pts[0][1] }',
	'\tfor (let i = 1; i < pts.length; i++) {',
	'\t\tif (v <= pts[i][0]) { return pts[i - 1][1] + ((v - pts[i - 1][0]) * (pts[i][1] - pts[i - 1][1])) / (pts[i][0] - pts[i - 1][0]) }',
	'\t}',
	'\treturn pts[pts.length - 1][1]',
	'}',
)

/**
 * The percentile a measurement `y` falls on at `x`, over a `"p1>table1|p2>table2|…"`
 * chart of one interpolable curve per percentile — a transcription of
 * `org.taktik.icure.utils.Math.percentile` in the same Math.kt.
 *
 * It walks the curves upwards until one reaches `y` and interpolates between that
 * curve's percentile and the previous one. Below the lowest curve it returns the
 * lowest percentile and above the highest it returns the highest, so, like
 * `interpolate`, it clamps rather than extrapolating.
 */
const PERCENTILE = lines(
	INTERPOLATE,
	'const percentile = (desc, x, y) => {',
	'\tlet prevPerc',
	'\tlet prevVal',
	"\tfor (const row of desc.split('|').filter((r) => r)) {",
	"\t\tconst cut = row.indexOf('>')",
	'\t\tconst perc = Number(row.slice(0, cut))',
	'\t\tconst val = interpolate(row.slice(cut + 1), x)',
	'\t\tif (val >= y) {',
	'\t\t\treturn prevVal === undefined ? perc : ((y - prevVal) * perc + (val - y) * prevPerc) / (val - prevVal)',
	'\t\t}',
	'\t\tprevPerc = perc',
	'\t\tprevVal = val',
	'\t}',
	'\treturn prevPerc',
	'}',
)

/**
 * Millimetres from a parsed measure. `parseContent` normalises a measure that
 * carries a unit to metres, so anything below 1 is metres and is scaled back up;
 * a measure typed without a unit is already the millimetre figure the legacy
 * lookup tables expect.
 */
const TO_MM = 'const toMm = (v) => (v < 1 ? v * 1000 : v)'

/** `"<w> sem. <d> j."` as an expression, the legacy `""+days/7l+" sem. "+days%7+" j."` with its integer division. */
const weeksAndDaysExpr = (daysExpr: string, separator = ' sem. ') => `'' + Math.floor(${daysExpr} / 7) + '${separator}' + (${daysExpr} % 7) + ' j.'`

/** The same, returned — for the bodies that are not inside a Promise executor. */
const WEEKS_AND_DAYS = (daysExpr: string, separator = ' sem. ') => `return ${weeksAndDaysExpr(daysExpr, separator)}`

/**
 * Estimated fetal weight in grams, from the six estimators
 * `h.StatMath.obsWeights` entries that the legacy formula actually consults —
 * transcribed from `org.taktik.icure.utils.Math.obsWeights` in kraken-cloud
 * (`kraken-common/domain/.../utils/Math.kt`), whose coefficients take the
 * measurements in millimetres.
 *
 * `obsWeights` fills four maps — by one, two, three and four measurements — and
 * merges them in that order, so the more specific variant of a name wins. The
 * cascades below reproduce that precedence for the names the formula reads, and,
 * as `obsWeights` does, treat a measurement of zero as absent. The base 2.718281
 * in Warsof is the truncated `e` the Kotlin uses, kept as-is.
 */
const OBSTETRIC_WEIGHT_VALUE = (c: PortContext) =>
	lines(
		TO_MM,
		"const mm = (v) => (typeof v === 'number' && v !== 0 ? toMm(v) : undefined)",
		`const ac = mm(${c.value('Circonferenceabdominale')})`,
		`const hc = mm(${c.value('Perimetrecranien')})`,
		`const bipd = mm(${c.value('Diametrebiparietal')})`,
		`const fl = mm(${c.value('Longueurfemorale')})`,
		'const pow10 = (e) => Math.pow(10, e)',
		'const hadlock1985 = ac && hc && fl && bipd',
		'\t? pow10(1.3596 + 0.00064 * hc + 0.00424 * ac + 0.0174 * fl + 0.0000061 * bipd * ac - 0.0000386 * ac * fl)',
		'\t: ac && hc && fl',
		'\t? pow10(1.326 - 0.0000326 * ac * fl + 0.00107 * hc + 0.00438 * ac + 0.0158 * fl)',
		'\t: ac && bipd && fl',
		'\t? pow10(1.335 - 0.000034 * ac * fl + 0.00316 * bipd + 0.00457 * ac + 0.01623 * fl)',
		'\t: ac && fl',
		'\t? pow10(1.304 + 0.005281 * ac + 0.01938 * fl - 0.00004 * ac * fl)',
		'\t: undefined',
		'const jordaan1983 = ac && hc && bipd',
		'\t? pow10(2.3231 + 0.002904 * ac + 0.00079 * hc - 0.00058 * bipd)',
		'\t: ac && bipd',
		'\t? pow10(-1.1683 + 0.00377 * ac + 0.0095 * bipd - 0.000015 * bipd * ac) * 1000',
		'\t: undefined',
		'const hadlock = ac && hc ? pow10(1.182 + (0.0273 * hc) / 10 + (0.07057 * ac) / 10 - (0.00063 * ac * ac) / 100 - (0.0002184 * ac * ac) / 100) : undefined',
		'const hadlock1984 = ac && bipd ? pow10(1.1134 + 0.005845 * ac - 0.00000604 * ac * ac - 0.00007365 * bipd * bipd + 0.00000595 * bipd * ac + 0.01694 * bipd) : undefined',
		'const warsof1986 = fl ? Math.pow(2.718281, 4.6914 + 0.00151 * fl * fl - 0.0000119 * fl * fl * fl) : undefined',
		'const jordaan = ac ? pow10(0.6328 + 0.01881 * ac - 0.000043 * ac * ac + 0.000000036239 * ac * ac * ac) : undefined',
		'const weight = hadlock1985 || jordaan1983 || hadlock || hadlock1984 || warsof1986 || jordaan',
	)

/** `OBSTETRIC_WEIGHT_VALUE` returned as the measure the `Poids estimé` field holds. */
const OBSTETRIC_WEIGHT = (c: PortContext) => lines(OBSTETRIC_WEIGHT_VALUE(c), 'if (!weight) { return undefined }', "return { value: weight, unit: 'g' }")

/**
 * weight / height², height taken as metres when it already looks like metres. A
 * height of zero yields no value rather than the legacy's infinity.
 */
const bmi = (c: PortContext, weight: string, height: string) =>
	lines(
		`const w = ${c.value(weight)}`,
		`let h = ${c.value(height)}`,
		"if (typeof w !== 'number' || typeof h !== 'number' || h === 0) { return undefined }",
		'if (h > 3) { h = h / 100 }',
		'return w / (h * h)',
	)

/** a / b, `undefined` unless both are numbers and b is non-zero. */
const ratio = (c: PortContext, numerator: string, denominator: string) =>
	lines(`const a = ${c.value(numerator)}`, `const b = ${c.value(denominator)}`, "if (typeof a !== 'number' || typeof b !== 'number' || b === 0) { return undefined }", 'return a / b')

/** The largest of several number fields, missing ones counting as 0 (legacy `Math.max(… ==void?0: …)`). */
const maxOf = (c: PortContext, idents: string[]) => `return Math.max(${idents.map((i) => `${c.value(i)} ?? 0`).join(', ')})`

/** Sum of number fields, a missing one counting as 0 (legacy `(X==void?0:X)+…`). */
const numberSum = (c: PortContext, idents: readonly string[]) => `return ${idents.map((i) => `(${c.value(i)} ?? 0)`).join(' + ')}`

/**
 * Sum of per-checkbox weights. Every legacy checkbox score in this corpus gives a
 * never-filled field the same weight as an unticked one, so presence and
 * "unticked" collapse into a single branch.
 */
const checkboxScore = (c: PortContext, items: readonly [string, number, number][]) => {
	// An item worth nothing either way contributes nothing but noise: the UPDRS has
	// one such "normal" box per question.
	const scoring = items.filter(([, ticked, unticked]) => ticked !== 0 || unticked !== 0)
	return lines(CHECKED, 'return (', scoring.map(([ident, ticked, unticked]) => `\t(checked(${c.item(ident)}) ? ${ticked} : ${unticked})`).join(' +\n'), ')')
}

/**
 * The legacy "due date" cascade, bound to `term`: ovulation + 38 weeks, else the
 * corrected term as entered, else last period + `lastPeriodOffsetInDays`.
 */
const dueDateCascade = (c: PortContext, lastPeriodOffsetInDays: number) =>
	lines(
		AS_DATE,
		ADD_DAYS,
		`const ovulation = asDate(${c.value('Dateovulation')})`,
		`const corrected = asDate(${c.value('Termecorrige')})`,
		`const lastPeriod = asDate(${c.value('Datedesdernieresregles')})`,
		`const term = ovulation ? addDays(ovulation, 266) : corrected ? corrected : lastPeriod ? addDays(lastPeriod, ${lastPeriodOffsetInDays}) : undefined`,
	)

/** Gestational age in days read off a biometry lookup table, rendered as `"<w> sem. <d> j."`. */
const gestationalAgeFromTable = (c: PortContext, ident: string, table: string, tableUnit: 'days' | 'weeks') =>
	lines(
		INTERPOLATE,
		TO_MM,
		`const m = ${c.value(ident)}`,
		"if (typeof m !== 'number') { return undefined }",
		`const days = Math.round(interpolate('${table}', toMm(m))${tableUnit === 'weeks' ? ' * 7' : ''})`,
		WEEKS_AND_DAYS('days'),
	)

/** Indents a block by one tab, for the bodies that sit inside a Promise executor. */
const indent = (block: string) =>
	block
		.split('\n')
		.map((line) => (line ? `\t${line}` : line))
		.join('\n')

/**
 * Wraps a body in the `new Promise(async (resolve) => { … })` the sandbox needs
 * for anything that reaches the host. `computedProperties.value` is compiled with
 * `new Function`, which is not an async function, so a top-level `await` is a
 * syntax error and the interpreter would reject the whole formula; returning a
 * promise is the supported route (see `03-async-formulas.yaml`) and the bridge
 * awaits it. Inside the executor an early exit is `resolve(x); return`.
 *
 * The `try`/`catch` is what makes that safe. The interpreter catches a throw from
 * a synchronous body and returns `undefined`, but a throw inside an async executor
 * rejects only the executor's own invisible promise: the promise the body returned
 * never settles, and whatever awaited the computed value waits for ever. A host
 * that does not provide `services` is exactly that case — the sandbox resolves the
 * unknown name to `[]` and calling it throws — so catching here turns a hung
 * computation into the empty field the synchronous bodies would have produced.
 */
const deferred = (body: string) => lines('return new Promise(async (resolve) => {', '\ttry {', indent(indent(body)), '\t} catch (e) {', '\t\tresolve(undefined)', '\t}', '})')

/**
 * The legacy gestational-age preamble, shared by fifteen formulas across the two
 * obstetric follow-up forms, binding `gaInDays`.
 *
 * It asks the host for the three most recent `CD-GYNECOLOGY|duedate` services of
 * the patient — the legacy `withServices(p.id, "CD-GYNECOLOGY", "duedate",
 * {"direction":"descending","limit":3}, …)`, limit included, so a patient with
 * more than three of them is read exactly as the legacy read them — and picks the
 * term out of them by label: ovulation plus 38 weeks, else the corrected term as
 * recorded, else the last period plus 40 weeks less a day.
 *
 * `whenNoServices` is what the field shows when the patient has no due-date
 * service at all; the legacy always resolved the string `"N/A"`, which only says
 * anything on a text field.
 *
 * The 280-day offset is deliberately not a parameter. The legacy formulas of this
 * family disagreed about it — `Age gestationnel` counted 280 where the days count
 * and every centile counted 279, so two fields of the same record could report
 * gestational ages a day apart — and they are reconciled here on 280. Holding it
 * as one constant is what keeps them reconciled.
 *
 * Two judgement calls, both narrow:
 * - the legacy fed a null term to `dateToDaysSince1970` and published whatever
 *   came back; here a missing term yields no value;
 * - `consultDate` falls back to today when the host does not supply one, as the
 *   already-ported `39dfbd84`-era formulas do.
 */
const GESTATIONAL_AGE_OFFSET_IN_DAYS = 280

const gestationalAgeFromServices = (whenNoServices: string) =>
	lines(
		AS_DATE,
		ADD_DAYS,
		DAY_NUMBER,
		"const dueDateServices = await services({ codeType: 'CD-GYNECOLOGY', code: 'duedate', limit: 3 })",
		`if (!dueDateServices.length) { resolve(${whenNoServices}); return }`,
		'const dated = (label) => { const found = dueDateServices.find((svc) => svc.label === label); return found ? asDate(parseContent(found.content)) : undefined }',
		"const ovulation = dated('Date ovulation')",
		"const corrected = dated('Terme corrigé')",
		"const lastPeriod = dated('Date des dernières règles')",
		'const term = ovulation ? addDays(ovulation, 266) : corrected ? corrected : lastPeriod ? addDays(lastPeriod, 279) : undefined',
		'if (!term) { resolve(undefined); return }',
		'const today = consultDate ? dayNumber(consultDate) : dayNumber(new Date())',
		`const gaInDays = ${GESTATIONAL_AGE_OFFSET_IN_DAYS} + today - dayNumber(term)`,
	)

/**
 * The percentile a biometric measurement of this form falls on for the patient's
 * gestational age, off a per-percentile chart indexed in weeks.
 *
 * `scale` is `'mm'` for the charts drawn in millimetres — every fetal dimension
 * here — and `'raw'` for the two Doppler indices, which are ratios the chart
 * tabulates as they are entered. It is not a property of the sandbox but of the
 * chart: a measure carrying a unit reaches a formula normalised to metres, and
 * running that through `toMm` recovers the millimetre figure, whereas doing it to
 * an index of order 1 would multiply it by a thousand.
 */
const percentileFromServices = (c: PortContext, ident: string, desc: string, scale: 'mm' | 'raw') =>
	deferred(
		lines(
			PERCENTILE,
			scale === 'mm' ? TO_MM : undefined,
			`const m = ${c.value(ident)}`,
			"if (typeof m !== 'number') { resolve(undefined); return }",
			gestationalAgeFromServices('undefined'),
			`resolve(percentile('${desc}', gaInDays / 7, ${scale === 'mm' ? 'toMm(m)' : 'm'}))`,
		),
	)

/** Weight for gestational age in grams, 5th/50th/95th centile — used by `06518025` and `3dbc4c2f`. */
const BIRTH_WEIGHT_CHART =
	'5>16,120;17,150;18,185;19,226;20,275;21,331;22,395;23,468;24,549;25,640;26,740;27,850;28,968;29,1095;30,1231;31,1374;32,1524;33,1680;34,1840;35,2005;36,2172;37,2341;38,2511;39,2680;40,2848;41,3013;42,3176|50>16,142;17,176;18,218;19,267;20,324;21,390;22,465;23,551;24,647;25,754;26,872;27,1001;28,1140;29,1290;30,1450;31,1618;32,1795;33,1978;34,2168;35,2361;36,2558;37,2757;38,2957;39,3156;40,3354;41,3549;42,3741|95>16,163;17,203;18,251;19,307;20,373;21,448;22,535;23,634;24,744;25,867;26,1003;27,1152;28,1312;29,1485;30,1669;31,1863;32,2066;33,2277;34,2495;35,2718;36,2945;37,3174;38,3403;39,3633;40,3860;41,4085;42,4305'

/**
 * The `FieldValue` that ticks a single-option checkbox.
 *
 * A bare boolean will not do here, however faithful it looks. `convertRawValue`
 * turns one into `{ type: 'boolean' }`, and `icure-button-group` ticks an option
 * only when it finds the option id among the compound content's keys — so a
 * boolean stores perfectly cleanly and renders as an empty box, for either
 * answer. Returning a whole `FieldValue` is the supported route: `convertRawValue`
 * passes an object carrying `content` through untouched, and the bridge then moves
 * `'*'` to the form language, which is the key the button group reads.
 *
 * No `codes`, deliberately, even though the button group would also tick from
 * them: a code id has to be a normalisable `TYPE|CODE|VERSION` stub, and these
 * option ids are plain labels like `Toxo (Ig M&G)`. Passing one throws in
 * `normalizeCode`, and the throw is caught upstream of the write, so the field
 * silently stores nothing at all — strictly worse than the boolean it replaced.
 */
const tickedValue = (c: PortContext, ident: string) => `{ content: { '*': { type: 'compound', value: { [${JSON.stringify(c.options(ident)[0])}]: { type: 'boolean', value: true } } } } }`

/**
 * Resolves the ticked checkbox when `condition` holds and nothing otherwise —
 * the shape of all six antenatal screening boxes on
 * `gynecology-fr/grossesse.json`, whose legacy formulas resolved `true` when the
 * test still needs doing and `false` when it does not.
 *
 * The false branch resolves `undefined` rather than an unticked compound: the
 * bridge stores nothing for a falsy value in any case, and an empty box is what
 * "no longer needed" should look like.
 */
const resolveTickWhen = (c: PortContext, ident: string, condition: string) => lines(`if (!(${condition})) { resolve(undefined); return }`, `resolve(${tickedValue(c, ident)})`)

/**
 * "This screening has not been recorded yet" — ticked when the patient has no
 * service under the given code at all. The legacy asked for one service and only
 * looked at whether it came back.
 */
const screeningMissing = (c: PortContext, ident: string, codeType: string, code: string) =>
	deferred(lines(`const recorded = await services({ codeType: '${codeType}', code: '${code}', limit: 1 })`, resolveTickWhen(c, ident, '!recorded.length')))

/**
 * "This serology has not shown immunity yet" — ticked unless a recorded service
 * reads `protégée`. The legacy looped over the services, but asked for a single
 * one, so the loop could only ever see it; the meaning is the same either way.
 */
const serologyUnprotected = (c: PortContext, ident: string, code: string) =>
	deferred(
		lines(
			`const recorded = await services({ codeType: 'ICURE', code: '${code}', limit: 1 })`,
			"const immune = recorded.some((svc) => parseContent(svc.content) === 'protégée')",
			resolveTickWhen(c, ident, '!immune'),
		),
	)

/**
 * "The window for this screening is still open" — ticked below `limitInDays` of
 * gestational age, and ticked when the patient has no due-date service at all, as
 * the legacy's `resolve(true)` did: not knowing how far along she is is not a
 * reason to drop the test from the list.
 */
const screeningWindowOpen = (c: PortContext, ident: string, limitInDays: number) =>
	deferred(lines(gestationalAgeFromServices(tickedValue(c, ident)), resolveTickWhen(c, ident, `gaInDays < ${limitInDays}`)))

const CRL_TABLE =
	'2,42;4,45;6,48;8,51;10,53;12,55;14,58;16,59;18,61;20,63;22,65;24,66;26,68;28,69;30,71;32,72;34,74;36,75;38,76;40,77;42,79;44,80;46,81;48,82;50,83;52,85;54,86;56,87;58,88;60,89;62,90;64,91;66,92;68,93;70,94;72,95;74,96;76,97;78,98'

const BIP_TABLE =
	'14.9,12;18.5,13;22,14;25.6,15;29,16;32.4,17;35.7,18;39,19;42.3,20;45.4,21;48.5,22;51.5,23;54.4,24;57.3,25;60.1,26;62.8,27;65.3,28;67.9,29;70.3,30;72.6,31;74.8,32;76.9,33;78.9,34;80.7,35;82.5,36;84.1,37;85.6,38;87,39;88.3,40;89.4,41;90.4,42'

const GESTATIONAL_SAC_TABLE = '7,4;8,5;11,6;12,7;13,8;14,9;15,10;16,11;17,12'

/** GDS-15 items, `[legacy identifier, weight when ticked, weight when unticked]`. */
const MOOD_ITEMS: [string, number, number][] = [
	['Etes_voussatisfaitdevotrevie', 0, 1],
	['Avez_vousrenonceaungrandnombred_activites', 1, 0],
	['Avez_vouslesentimentquevotrevieestvide', 1, 0],
	['Vousennuyez_voussouvent', 1, 0],
	['Etes_vousdebonnehumeurlaplupartdutemps', 0, 1],
	['Avez_vouspeurquequelquechosedemauvaisvousarrive', 1, 0],
	['Etes_vousheureuxlaplupartdutemps', 0, 1],
	['Avezvouslesentimentd_etredesormaisfaible', 1, 0],
	['Preferez_vousrestezseuldansvotrechambreplutotquedesortir', 1, 0],
	['Pensez_vousquevotrememoireestplusmauvaisequecelledelaplupartdesgens', 1, 0],
	['Pensez_vousqu_ilestmerveilleuxdevivreanotreepoque', 0, 1],
	['Voussentez_vousunepersonnesansvaleuractuellement', 1, 0],
	['Avez_vousbeaucoupd_energie', 0, 1],
	['Pensez_vousquevotresituationactuelleestdesesperee', 1, 0],
	['Pensez_vousquelasituationdesautresestmeilleurequelavotre', 1, 0],
]

/** MMSE sub-scores, in the order the legacy formulas added them. */
const MMSE_LANGUAGE_ITEMS = ['Language_designation', 'Language_repetition', 'Comprehensionorale', 'Comprehensionecrite', 'Languageecrit']

const MMSE_TOTAL_ITEMS = ['Orientationdansletemps', 'Orientationdansl_espace', 'Apprentissage', 'Attentionetcalcul', 'Rappel', ...MMSE_LANGUAGE_ITEMS, 'Praxieconstructive']

export const FORMULA_PORTS: FormulaPort[] = [
	{
		hash: '174c2cfe',
		legacy: 'Poids/((Taille/100.0)*(Taille/100.0))',
		notes:
			"BMI. Both operands are measures, so `parseContent` already returns kg and metres; a height above 3 is assumed to be centimetres typed without a unit. A height of zero yields no value rather than the legacy's infinity.",
		build: (c) => bmi(c, 'Poids', 'Taille'),
	},
	{
		hash: '79b7fac5',
		legacy: 'Poids/Math.pow(Taille/100.0,2)',
		notes: 'Same BMI as 174c2cfe, written with Math.pow.',
		build: (c) => bmi(c, 'Poids', 'Taille'),
	},
	{
		hash: 'cce78de9',
		legacy: 'return x.Poids && x.Taille ? x.Poids/((x.Taille/100.0)*(x.Taille/100.0)) : null',
		notes: 'Same BMI as 174c2cfe in the later `x.<field>` dialect.',
		build: (c) => bmi(c, 'Poids', 'Taille'),
	},
	{
		hash: 'bdc59ded',
		legacy: '(Poids==void)||(Taille==void)||(Poids==null)||(Taille==null)||(Taille==0)?null:Poids/((Taille/100.0)*(Taille/100.0))',
		notes: 'Same BMI as 174c2cfe with the guards spelled out; the ported body guards the same cases.',
		build: (c) => bmi(c, 'Poids', 'Taille'),
	},
	{
		hash: 'fa810402',
		legacy: 'return (!x.Poidsavantgrossesse)||(!x.Taille) ? null:x.Poidsavantgrossesse/((x.Taille/100.0)*(x.Taille/100.0))',
		notes: 'Pre-pregnancy BMI: same formula, weight taken from "Poids avant grossesse".',
		build: (c) => bmi(c, 'Poidsavantgrossesse', 'Taille'),
	},
	{
		hash: '97fec7ce',
		legacy: 'Gewicht/((Lengte/100.0)*(Lengte/100.0))',
		notes: 'BMI on the Dutch forms.',
		build: (c) => bmi(c, 'Gewicht', 'Lengte'),
	},
	{
		hash: '1365b7b2',
		legacy: 'Gewicht/((Maat/100.0)*(Maat/100.0))',
		notes: 'BMI on the Dutch forms whose height field is "Maat".',
		build: (c) => bmi(c, 'Gewicht', 'Maat'),
	},
	{
		hash: '44234ca8',
		legacy: 'poids/((taille/100)*(taille/100))',
		notes: 'BMI on the plastic surgery forms (lower-case field names).',
		build: (c) => bmi(c, 'poids', 'taille'),
	},
	{
		hash: 'a696ba12',
		legacy: 'poids / Math.pow(taille/100.0,2)',
		notes: 'Same BMI as 44234ca8, written with Math.pow.',
		build: (c) => bmi(c, 'poids', 'taille'),
	},
	{
		hash: 'c4d3e008',
		legacy: 'poids /((taille/100)*(Taille/100))',
		notes: 'Same BMI as 44234ca8. The legacy text mixes "taille" and "Taille"; both spellings resolve to the single height field of the destination form.',
		build: (c) => bmi(c, 'poids', 'taille'),
	},
	{
		hash: '254b8ee0',
		legacy: 'poidsmaximum/((taille/100)*(Taille/100))',
		notes: "BMI at the patient's maximum recorded weight; same mixed-case height as c4d3e008.",
		build: (c) => bmi(c, 'poidsmaximum', 'taille'),
	},
	{
		hash: 'f62d30cf',
		legacy: 'new org.taktik.eof.Measure("LO","m2",Math.pow(Lengte*Gewicht/3600,0.5))',
		notes:
			'Body surface area (Mosteller). Mosteller needs centimetres, and `parseContent` normalises a height that carries a unit to metres, so a value below 3 is scaled back up. The legacy unit string "m2" is emitted as "m²".',
		build: (c) =>
			lines(
				`const w = ${c.value('Gewicht')}`,
				`let h = ${c.value('Lengte')}`,
				"if (typeof w !== 'number' || typeof h !== 'number') { return undefined }",
				'if (h < 3) { h = h * 100 }',
				"return { value: Math.sqrt((h * w) / 3600), unit: 'm²' }",
			),
	},
	{
		hash: '39dfbd84',
		legacy:
			'var ws = h.StatMath.obsWeights(x.Circonferenceabdominale, x.Perimetrecranien ,x.Diametrebiparietal, x.Longueurfemorale); var ow = ws[\'Hadlock et al. 1985\']||ws[\'Jordaan. 1983\']||ws[\'Hadlock\']||ws[\'Hadlock et al. 1984\']||ws[\'Warsof et al. 1986\']||ws[\'Jordaan\']; return ow?{"content":{"fr":{"measureValue":{"value":ow,"unit":"g"}}}}:null',
		notes:
			'Estimated fetal weight: the first of six estimators that the available measurements support, in the order the legacy formula asks for them. See OBSTETRIC_WEIGHT for the transcription of the host `obsWeights` those names come from. The legacy body returned a raw iCure content object; a `{ value, unit }` is enough here.',
		build: (c) => OBSTETRIC_WEIGHT(c),
	},
	{
		hash: '7d4a9616',
		legacy: 'return x.DIO && x.Diametrebiparietal ? x.DIO/x.Diametrebiparietal:null',
		notes: 'Occipito-frontal over biparietal diameter. Both are measures in the same unit, so the ratio needs no unit handling.',
		build: (c) => ratio(c, 'DIO', 'Diametrebiparietal'),
	},
	{
		hash: '62185700',
		legacy: 'return x.Indiceresistancearterecerebralemoyenne && x.Indicederesistanceombilical ? x.Indiceresistancearterecerebralemoyenne/x.Indicederesistanceombilical : null',
		notes: 'Cerebro-placental ratio; both operands are unitless indices.',
		build: (c) => ratio(c, 'Indiceresistancearterecerebralemoyenne', 'Indicederesistanceombilical'),
	},
	{
		hash: 'abc2943d',
		legacy:
			'Math.max(Math.max(lunettesloinvisionOD==void?0: lunettesloinvisionOD, refractionobjectivevisionOD==void?0: refractionobjectivevisionOD),refractionsubjectivedeloinvisionOD==void?0:refractionsubjectivedeloinvisionOD)',
		notes: 'Best far visual acuity of the right eye across the three measurements, a missing one counting as 0.',
		build: (c) => maxOf(c, ['lunettesloinvisionOD', 'refractionobjectivevisionOD', 'refractionsubjectivedeloinvisionOD']),
	},
	{
		hash: '420d8075',
		legacy:
			'Math.max(Math.max(lunettesloinvisionOG==void?0: lunettesloinvisionOG, refractionobjectivevisionOG==void?0: refractionobjectivevisionOG),refractionsubjectivedeloinvisionOG==void?0: refractionsubjectivedeloinvisionOG)',
		notes: 'Left-eye counterpart of abc2943d.',
		build: (c) => maxOf(c, ['lunettesloinvisionOG', 'refractionobjectivevisionOG', 'refractionsubjectivedeloinvisionOG']),
	},
	{
		hash: 'acca1787',
		legacy:
			'(Language_designation==void?0:Language_designation)+(Language_repetition==void?0:Language_repetition)+(Comprehensionorale==void?0:Comprehensionorale)+(Comprehensionecrite==void?0:Comprehensionecrite)+(Languageecrit==void?0:Languageecrit)',
		notes: 'MMSE language sub-score: the sum of five number fields.',
		build: (c) => numberSum(c, MMSE_LANGUAGE_ITEMS),
	},
	{
		hash: '4cedebda',
		legacy:
			'(Orientationdansletemps==void?0:Orientationdansletemps)+(Orientationdansl_espace==void?0:Orientationdansl_espace)+(Apprentissage==void?0:Apprentissage)+(Attentionetcalcul==void?0:Attentionetcalcul)+(Rappel==void?0:Rappel)+(Language_designation==void?0:Language_designation)+(Language_repetition==void?0:Language_repetition)+(Comprehensionorale==void?0:Comprehensionorale)+(Comprehensionecrite==void?0:Comprehensionecrite)+(Languageecrit==void?0:Languageecrit)+(Praxieconstructive==void?0:Praxieconstructive)',
		notes: 'MMSE total: the sum of the eleven item scores, language items included individually rather than through the language sub-score.',
		build: (c) => numberSum(c, MMSE_TOTAL_ITEMS),
	},
	{
		hash: '67ffcad3',
		legacy: '(Etes_voussatisfaitdevotrevie==void?1:(Etes_voussatisfaitdevotrevie?0:1))+(Avez_vousrenonceaungrandnombred_activites==void?0:(Avez_vousrenonceaungrandnombred_activites?1:0))+…',
		notes:
			'GDS-15 mood score over 15 checkboxes, five of them reverse-scored. The legacy weights are reproduced item by item in MOOD_ITEMS; a never-filled field carries the same weight as an unticked one in every legacy term, so the port has a single branch.',
		build: (c) => checkboxScore(c, MOOD_ITEMS),
	},
	{
		hash: '6f5732bf',
		legacy: '(Updrs_1_0==void?0:(Updrs_1_0?0:0))+(Updrs_1_1==void?0:(Updrs_1_1?1:0))+…',
		notes:
			'UPDRS total over 189 checkboxes. Every legacy term scores the trailing index of its field name when ticked and 0 otherwise, so the weights are read off the field names instead of being restated.',
		build: (c, refs) =>
			checkboxScore(
				c,
				[...refs].sort().map((ref) => [ref, Number(ref.split('_')[2]), 0] as [string, number, number]),
			),
	},
	{
		hash: '3fae55cf',
		legacy: 'days=(CRL==void)?null:Math.round(org.taktik.icure.util.Math.interpolate("2,42;4,45;…;78,98",CRL));days==null?"":""+days/7l+" sem. "+days%7+" j."',
		notes: 'Gestational age from the crown-rump length. The legacy table maps millimetres straight to days.',
		build: (c) => gestationalAgeFromTable(c, 'CRL', CRL_TABLE, 'days'),
	},
	{
		hash: '6c230e62',
		legacy: 'days=(Diametrebiparietal==void)?null:Math.round(org.taktik.icure.util.Math.interpolate("14.9,12;18.5,13;…;90.4,42", Diametrebiparietal)*7);days==null?"":""+days/7l+" sem. "+days%7+" j."',
		notes: 'Gestational age from the biparietal diameter. The legacy table maps millimetres to weeks, hence the ×7.',
		build: (c) => gestationalAgeFromTable(c, 'Diametrebiparietal', BIP_TABLE, 'weeks'),
	},
	{
		hash: '51cb62a0',
		legacy: 'days=(Taillesacgestationnel==void)?null:Math.round(org.taktik.icure.util.Math.interpolate("7,4;8,5;…;17,12",Taillesacgestationnel)*7);days==null?"":""+days/7l+" sem. "+days%7+" j."',
		notes: 'Gestational age from the gestational sac size; the table maps millimetres to weeks.',
		build: (c) => gestationalAgeFromTable(c, 'Taillesacgestationnel', GESTATIONAL_SAC_TABLE, 'weeks'),
	},
	{
		hash: 'b7b15817',
		legacy: 'return (!x.Datedesdernieresregles) ? null : new Date((h.dateUtils.fuzzyDateToDaysSince1970(x.Datedesdernieresregles) + 7*40 - 1)*3600000*24)',
		notes: 'Due date from the last period: + 40 weeks − 1 day.',
		build: (c) => lines(AS_DATE, ADD_DAYS, `const lastPeriod = asDate(${c.value('Datedesdernieresregles')})`, 'if (!lastPeriod) { return undefined }', 'return addDays(lastPeriod, 279)'),
	},
	{
		hash: '97591a27',
		legacy: 'return (!x.Dateovulation) ? null : new Date((h.dateUtils.fuzzyDateToDaysSince1970(x.Dateovulation) + 7*38)*3600000*24)',
		notes: 'Due date from ovulation: + 38 weeks.',
		build: (c) => lines(AS_DATE, ADD_DAYS, `const ovulation = asDate(${c.value('Dateovulation')})`, 'if (!ovulation) { return undefined }', 'return addDays(ovulation, 266)'),
	},
	{
		hash: 'fb753b40',
		legacy:
			'return (!x.Dateovulation) ? (!x.Termecorrige) ? (!x.Datedesdernieresregles) ? null : new Date((h.dateUtils.fuzzyDateToDaysSince1970(x.Datedesdernieresregles) + 7*40 - 1)*3600000*24) : h.dateUtils.fuzzyDateToDate(x.Termecorrige) : new Date((h.dateUtils.fuzzyDateToDaysSince1970(x.Dateovulation) + 7*38)*3600000*24)',
		notes: 'Definitive term: ovulation + 38 weeks, else the corrected term as entered, else last period + 40 weeks − 1 day.',
		build: (c) => lines(dueDateCascade(c, 279), 'return term'),
	},
	{
		hash: '87934ed3',
		legacy:
			'var dueDate = (!x.Dateovulation) ? … + 7*40-1 … ; if (dueDate===null) { return "N/A"; } var today = h.dateUtils.dateToDaysSince1970(new Date()); var days = 280+today-h.dateUtils.dateToDaysSince1970(dueDate); return ""+Math.floor(days/7)+" sem."+Math.floor(days)%7+" j."',
		notes:
			'Gestational age today, counted back from the due-date cascade. Keeps the legacy 280-day offset against a term computed with 40 weeks \u2212 1 day, and the legacy rendering, which has no space between "sem." and the day count.',
		build: (c) => lines(dueDateCascade(c, 279), DAY_NUMBER, "if (!term) { return 'N/A' }", 'const days = 280 + dayNumber(new Date()) - dayNumber(term)', WEEKS_AND_DAYS('days', ' sem.')),
	},
	{
		hash: '4fa5248e',
		legacy:
			'var dueDate = (!x.Dateovulation) ? … + 7*40 … ; if (dueDate===null) { return "N/A"; } var today = h.dateUtils.dateToDaysSince1970(new Date()); var days = 279+today-h.dateUtils.dateToDaysSince1970(dueDate); return days<30?"moins d\'un mois":days<84?"moins de trois mois":days<150?"plus de 3 mois":days<180?"plus de 5 mois":"plus de 6 mois";',
		notes: 'Gestational age today as a coarse band. Keeps the legacy 279-day offset against a term computed with a full 40 weeks.',
		build: (c) =>
			lines(
				dueDateCascade(c, 280),
				DAY_NUMBER,
				"if (!term) { return 'N/A' }",
				'const days = 279 + dayNumber(new Date()) - dayNumber(term)',
				"return days < 30 ? \"moins d'un mois\" : days < 84 ? 'moins de trois mois' : days < 150 ? 'plus de 3 mois' : days < 180 ? 'plus de 5 mois' : 'plus de 6 mois'",
			),
	},
	{
		hash: 'c6044e5f',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Percentile of the measured biparietal diameter for the patient's gestational age, off the legacy 3/10/50/90/97-centile chart indexed in weeks. Needs the host `services` and `consultDate`.",
		build: (c) =>
			percentileFromServices(
				c,
				'Diametrebiparietal',
				'3>11,12.08;12,15.81;13,19.47;14,23.05;15,26.56;16,29.97;17,33.32;18,36.55;19,39.76;20,42.85;21,45.86;22,48.79;23,51.63;24,54.38;25,57.04;26,59.62;27,62.12;28,64.50;29,66.84;30,69.07;31,71.22;32,73.30;33,75.24;34,77.14;35,78.94;36,80.64;37,82.27;38,83.78;39,85.22;40,86.57;41,87.00|10>11,13.12;12,16.96;13,20.71;14,24.36;15,27.93;16,31.41;17,34.85;18,38.15;19,41.46;20,44.56;21,47.66;22,50.61;23,53.48;24,56.31;25,59.00;26,61.64;27,64.15;28,66.61;29,68.98;30,71.21;31,73.39;32,75.49;33,77.46;34,79.36;35,81.14;36,82.88;37,84.50;38,86.00;39,87.43;40,88.78;41,89.00|50>11,15.36;12,19.40;13,23.30;14,27.14;15,30.89;16,34.53;17,38.12;18,41.58;19,45.00;20,48.22;21,51.43;22,54.53;23,57.51;24,60.42;25,63.25;26,65.94;27,68.55;28,71.03;29,73.50;30,75.80;31,78.00;32,80.16;33,82.14;34,84.07;35,85.90;36,87.61;37,89.24;38,90.70;39,92.10;40,93.45;41,94.00|90>11,17.60;12,21.81;13,25.92;14,29.92;15,33.82;16,37.62;17,41.35;18,44.97;19,48.52;20,51.90;21,55.23;22,58.44;23,61.54;24,64.57;25,67.48;26,70.24;27,72.92;28,75.52;29,77.97;30,80.37;31,82.63;32,84.80;33,86.84;34,88.80;35,90.61;36,92.35;37,93.97;38,95.42;39,96.86;40,98.13;41,99.00|97>11,18.63;12,22.92;13,27.12;14,31.23;15,35.23;16,39.08;17,42.87;18,46.56;19,50.18;20,53.64;21,57.00;22,60.30;23,63.45;24,66.50;25,69.42;26,72.27;27,75.00;28,77.60;29,80.09;30,82.52;31,84.80;32,87.00;33,89.04;34,91.00;35,92.83;36,94.56;37,96.19;38,97.66;39,99.05;40,100.31;41,101.00|',
				'mm',
			),
	},
	{
		hash: '97d6ebdf',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Percentile of the measured head circumference for the patient's gestational age, off the legacy 3/10/50/90/97-centile chart indexed in weeks. Needs the host `services` and `consultDate`. The 97th centile row of this chart begins with a stray separator (`97>;16,136.11;…`); the Kotlin `interpolate` would throw on it, and only for a measurement above the 90th centile, so the legacy field silently blanked for exactly the large heads it mattered for. The ported `interpolate` skips empty segments and reads the row as written.",
		build: (c) =>
			percentileFromServices(
				c,
				'Perimetrecranien',
				'3>16,105.80;17,118.67;18,131.08;19,143.00;20,154.53;21,165.41;22,176.12;23,186.32;24,196.19;25,205.50;26,214.44;27,222.87;28,231.00;29,238.40;30,245.86;31,252.54;32,258.86;33,264.62;34,270.14;35,275.33;36,279.79;37,283.90;38,287.63;39,290.88;40,293.00|10>16,110.58;17,123.78;18,136.36;19,148.53;20,160.21;21,171.49;22,182.35;23,192.31;24,203.00;25,212.40;26,221.57;27,230.33;28,238.56;29,246.35;30,253.74;31,260.81;32,267.22;33,273.38;34,279.00;35,284.23;36,289.00;37,293.32;38,297.29;39,300.76;40,303.00|50>16,120.86;17,134.49;18,147.55;19,160.29;20,172.47;21,184.21;22,195.74;23,206.64;24,217.18;25,227.32;26,236.72;27,246.00;28,254.77;29,263.00;30,270.84;31,278.33;32,285.29;33,292.00;34,298.10;35,303.62;36,308.81;37,313.52;38,317.88;39,321.86;40,324.00|90>16,131.25;17,145.38;18,158.92;19,172.14;20,184.86;21,197.12;22,208.91;23,220.26;24,231.39;25,241.91;26,252.00;27,261.75;28,271.00;29,279.71;30,288.13;31,296.00;32,303.54;33,310.40;34,317.00;35,323.00;36,328.75;37,334.00;38,338.64;39,343.00;40,346.00|97>;16,136.11;17,150.39;18,164.11;19,177.48;20,190.54;21,203.09;22,215.15;23,226.76;24,238.00;25,248.81;26,259.23;27,269.13;28,278.57;29,287.56;30,296.00;31,304.27;32,312.00;33,319.10;34,325.91;35,332.16;36,338.00;37,343.34;38,348.29;39,352.67;40,356.00',
				'mm',
			),
	},
	{
		hash: '6bd805c8',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Percentile of the measured abdominal circumference for the patient's gestational age, off the legacy 3/10/50/90/97-centile chart indexed in weeks. Needs the host `services` and `consultDate`.",
		build: (c) =>
			percentileFromServices(
				c,
				'Circonferenceabdominale',
				'3>15,80.70;16,91.30;17,101.70;18,111.80;19,122.00;20,132.00;21,141.60;22,151.40;23,160.90;24,170.20;25,179.30;26,188.40;27,197.30;28,206.20;29,214.70;30,223.20;31,231.60;32,239.70;33,247.80;34,255.60;35,263.20;36,271.00;37,278.30;38,285.60;39,292.70;40,298.00|10>15,85.30;16,96.10;17,106.80;18,117.40;19,128.00;20,138.00;21,148.20;22,158.20;23,168.20;24,177.80;25,187.30;26,196.70;27,206.00;28,215.10;29,224.00;30,232.80;31,241.60;32,250.00;33,258.40;34,266.70;35,274.70;36,282.60;37,290.30;38,298.00;39,305.30;40,311.00|50>15,95.00;16,106.40;17,118.00;18,129.20;19,140.40;20,151.40;21,162.30;22,173.00;23,183.60;24,194.00;25,204.40;26,214.50;27,224.50;28,234.40;29,244.00;30,253.60;31,263.00;32,272.20;33,281.20;34,290.20;35,298.80;36,307.40;37,316.00;38,324.70;39,332.40;40,339.00|90>15,104.40;16,116.80;17,129.00;18,141.00;19,153.00;20,164.70;21,176.30;22,187.80;23,199.00;24,210.30;25,221.30;26,232.30;27,243.00;28,253.60;29,264.00;30,274.20;31,284.20;32,294.30;33,304.00;34,313.80;35,323.30;36,332.50;37,341.70;38,350.70;39,359.60;40,367.00|97>15,108.80;16,121.60;17,134.00;18,146.60;19,158.80;20,171.00;21,183.00;22,194.70;23,206.30;24,218.00;25,229.30;26,240.60;27,251.60;28,262.60;29,273.30;30,283.70;31,294.40;32,304.60;33,314.80;34,324.80;35,334.50;36,344.30;37,353.80;38,363.00;39,372.20;40,380.00',
				'mm',
			),
	},
	{
		hash: 'ca5dfafe',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes: "Percentile of the measured femur length for the patient's gestational age, off the legacy 3/10/50/90/97-centile chart indexed in weeks. Needs the host `services` and `consultDate`.",
		build: (c) =>
			percentileFromServices(
				c,
				'Longueurfemorale',
				'3>12,2.76;13,6.09;14,9.40;15,12.56;16,15.70;17,18.74;18,21.69;19,24.59;20,27.42;21,30.12;22,32.83;23,35.34;24,37.89;25,40.33;26,42.66;27,44.95;28,47.13;29,49.22;30,51.30;31,53.26;32,55.12;33,56.96;34,58.69;35,60.33;36,61.90;37,63.40;38,64.81;39,66.16;40,67.42;41,68.00|10>12,3.89;13,7.29;14,10.65;15,13.87;16,17.00;17,20.12;18,23.14;19,26.06;20,28.94;21,31.72;22,34.39;23,37.00;24,39.58;25,42.04;26,44.40;27,46.72;28,48.94;29,51.06;30,53.14;31,55.13;32,57.04;33,58.87;34,60.62;35,62.29;36,63.89;37,65.36;38,66.79;39,68.19;40,69.47;41,70.00|50>12,6.33;13,9.88;14,13.33;15,16.66;16,19.95;17,23.12;18,26.23;19,29.25;20,32.23;21,35.05;22,37.87;23,40.50;24,43.16;25,45.69;26,48.17;27,50.53;28,52.80;29,54.94;30,57.13;31,59.15;32,61.11;33,63.00;34,64.76;35,66.47;36,68.13;37,69.63;38,71.11;39,72.48;40,73.79;41,74.00|90>12,8.79;13,12.42;14,16.00;15,19.44;16,22.80;17,26.13;18,29.30;19,32.44;20,35.48;21,38.41;22,41.30;23,44.03;24,46.75;25,49.36;26,51.88;27,54.32;28,56.64;29,58.91;30,61.08;31,63.14;32,65.19;33,67.10;34,68.88;35,70.65;36,72.34;37,73.91;38,75.38;39,76.81;40,78.14;41,79.00|97>12,10.00;13,13.65;14,17.27;15,20.77;16,24.18;17,27.53;18,30.80;19,33.91;20,37.03;21,40.00;22,42.91;23,45.71;24,48.42;25,51.08;26,53.62;27,56.09;28,58.45;29,60.72;30,62.92;31,65.04;32,67.07;33,69.03;34,70.84;35,72.63;36,74.30;37,75.89;38,77.41;39,78.84;40,80.17;41,81.00|',
				'mm',
			),
	},
	{
		hash: '24d1b527',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Percentile of the measured occipito-frontal diameter for the patient's gestational age, off the legacy 5/50/95-centile chart indexed in weeks. Needs the host `services` and `consultDate`.",
		build: (c) =>
			percentileFromServices(
				c,
				'Diametreoccipitofrontal',
				'5>13,28;14,31;15,35;16,39;17,43;18,47;19,51;20,56;21,60;22,64;23,68;24,72;25,75;26,79;27,82;28,86;29,89;30,92;31,94;32,97;33,99;34,101;35,103;36,104;37,105;38,106;39,107;40,108;41,108|50>13,32;14,35;15,39;16,43;17,47;18,52;19,56;20,60;21,65;22,69;23,73;24,77;25,81;26,84;27,88;28,91;29,94;30,97;31,100;32,102;33,105;34,107;35,109;36,110;37,112;38,113;39,114;40,114;41,115|95>13,36;14,40;15,43;16,48;17,52;18,56;19,61;20,65;21,69;22,74;23,78;24,82;25,86;26,90;27,93;28,97;29,100;30,103;31,106;32,108;33,111;34,113;35,115;36,116;37,118;38,119;39,120;40,121;41,121',
				'mm',
			),
	},
	{
		hash: 'e8784cff',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Percentile of the measured antero-posterior abdominal diameter for the patient's gestational age, off the legacy 10/25/50/75/90-centile chart indexed in weeks. Needs the host `services` and `consultDate`.",
		build: (c) =>
			percentileFromServices(
				c,
				'Diametreabdominalanteroposterieur',
				'10>15,26;16,30;17,34;18,36;19,39;20,43;21,46;22,49;23,52;24,54;25,58;26,62;27,64;28,66;29,69;30,73;31,75;32,79;33,82;34,83;35,86;36,89;37,91;38,93;39,96;40,102|25>15,28;16,32;17,35;18,38;19,42;20,45;21,49;22,52;23,55;24,58;25,61;26,65;27,67;28,72;29,75;30,79;31,81;32,84;33,87;34,90;35,92;36,95;37,97;38,100;39,101;40,102|50>15,30;16,33;17,37;18,41;19,44;20,49;21,52;22,55;23,58;24,62;25,65;26,69;27,72;28,76;29,80;30,83;31,85;32,89;33,91;34,95;35,97;36,100;37,102;38,105;39,107;40,108|75>15,32;16,35;17,39;18,44;19,46;20,51;21,55;22,58;23,62;24,65;25,69;26,74;27,75;28,79;29,83;30,88;31,90;32,93;33,97;34,100;35,102;36,106;37,109;38,111;39,113;40,114|90>15,35;16,37;17,42;18,46;19,49;20,53;21,58;22,61;23,64;24,68;25,73;26,77;27,80;28,82;29,87;30,91;31,93;32,97;33,101;34,104;35,107;36,111;37,114;38,117;39,119;40,122',
				'mm',
			),
	},
	{
		hash: 'ad576eb0',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Percentile of the measured transverse abdominal diameter for the patient's gestational age, off the legacy 10/25/50/75/90-centile chart indexed in weeks. Needs the host `services` and `consultDate`.",
		build: (c) =>
			percentileFromServices(
				c,
				'Diametreabdominaltransverse',
				'10>15,27;16,31;17,33;18,36;19,39;20,43;21,46;22,48;23,52;24,54;25,56;26,59;27,60;28,63;29,66;30,71;31,74;32,77;33,79;34,81;35,83;36,85;37,88;38,91;39,92;40,93|25>15,29;16,33;17,35;18,39;19,41;20,45;21,48;22,51;23,54;24,57;25,59;26,62;27,65;28,69;29,72;30,75;31,78;32,81;33,84;34,86;35,89;36,91;37,93;38,95;39,98;40,99|50>15,30;16,34;17,37;18,41;19,44;20,48;21,51;22,54;23,57;24,60;25,63;26,66;27,69;28,74;29,77;30,79;31,82;32,86;33,89;34,91;35,95;36,97;37,100;38,101;39,102;40,103|75>15,32;16,35;17,40;18,44;19,46;20,50;21,53;22,57;23,60;24,63;25,66;26,70;27,74;28,77;29,80;30,84;31,87;32,90;33,94;34,96;35,100;36,104;37,107;38,110;39,111;40,112|90>15,36;16,38;17,41;18,46;19,49;20,52;21,56;22,59;23,63;24,66;25,70;26,73;27,77;28,81;29,84;30,89;31,92;32,95;33,98;34,101;35,106;36,109;37,111;38,115;39,117;40,119',
				'mm',
			),
	},
	{
		hash: '1c1280fa',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes: "Percentile of the measured amniotic fluid index for the patient's gestational age, off the legacy 5/50/95-centile chart indexed in weeks. Needs the host `services` and `consultDate`.",
		build: (c) =>
			percentileFromServices(
				c,
				'AFI',
				'5>16,79;17,83;18,87;19,90;20,93;21,95;22,97;23,98;24,98;25,97;26,97;27,95;28,94;29,92;30,90;31,88;32,86;33,83;34,81;35,79;36,77;37,75;38,73;39,72;40,71;41,70;42,69|50>16,121;17,127;18,133;19,137;20,141;21,143;22,145;23,146;24,147;25,147;26,147;27,146;28,146;29,145;30,145;31,144;32,144;33,143;34,142;35,140;36,138;37,135;38,132;39,127;40,123;41,116;42,110|95>16,185;17,194;18,202;19,207;20,212;21,214;22,216;23,218;24,219;25,221;26,223;27,226;28,228;29,231;30,234;31,238;32,242;33,245;34,248;35,249;36,249;37,244;38,239;39,226;40,214;41,194;42,175',
				'mm',
			),
	},
	{
		hash: 'b52710e4',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Percentile of the measured umbilical pulsatility index for the patient's gestational age, off the legacy 10/50/90-centile chart indexed in weeks. Needs the host `services` and `consultDate`. The chart is left in the units it tabulates: it is a ratio, not a length, so the millimetre recovery the biometric charts need would inflate it a thousandfold. Its values rise with gestation, which an umbilical pulsatility index does not; the port reproduces the legacy arithmetic rather than guessing a rescale.",
		build: (c) =>
			percentileFromServices(
				c,
				'Indicedepulsabiliteombilical',
				'10>12,7.7;13,10.9;14,14.1;15,17.2;16,20.3;17,23.3;18,26.3;19,29.2;20,32.1;21,34.9;22,37.6;23,40.3;24,42.9;25,45.5;26,48;27,50.4;28,52.7;29,55;30,57.1;31,59.2;32,61.2;33,63.1;34,64.9;35,66.6;36,68.2;37,69.7;38,71.1;39,72.4;40,73.6;41,74.6;42,75.6|50>12,4.8;13,7.9;14,11;15,14;16,17;17,19.9;18,22.8;19,25.6;20,28.4;21,31.1;22,33.8;23,36.4;24,38.9;25,41.4;26,43.7;27,46;28,48.3;29,50.4;30,52.5;31,54.5;32,56.4;33,58.2;34,59.9;35,61.5;36,63;37,64.4;38,65.7;39,66.9;40,68;41,68.9;42,69.8|90>12,10.6;13,13.9;14,17.2;15,20.4;16,23.6;17,26.7;18,29.7;19,32.8;20,35.7;21,38.6;22,41.5;23,44.3;24,47;25,49.6;26,52.2;27,54.7;28,57.1;29,59.5;30,61.7;31,63.9;32,66;33,68;34,69.9;35,71.7;36,73.4;37,75;38,76.5;39,77.9;40,79.1;41,80.3;42,81.3',
				'raw',
			),
	},
	{
		hash: 'e160f605',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Percentile of the measured umbilical resistance index for the patient's gestational age, off the legacy 5/50/95-centile chart indexed in weeks. Needs the host `services` and `consultDate`. The chart is left in the units it tabulates: it is a ratio, not a length, so the millimetre recovery the biometric charts need would inflate it a thousandfold. Its values rise with gestation, which an umbilical resistance index does not; the port reproduces the legacy arithmetic rather than guessing a rescale.",
		build: (c) =>
			percentileFromServices(
				c,
				'Indicederesistanceombilical',
				'5>20,1.04;21,0.98;22,0.92;23,0.86;24,0.81;25,0.76;26,0.71;27,0.67;28,0.63;29,0.59;30,0.56;31,0.53;32,0.5;33,0.48;34,0.46;35,0.44;36,0.43;37,0.42;38,0.42;39,0.42;40,0.42;41,0.42;42,0.43|50>20,1.54;21,1.47;22,1.41;23,1.35;24,1.3;25,1.25;26,1.2;27,1.16;28,1.12;29,1.08;30,1.05;31,1.02;32,0.99;33,0.97;34,0.95;35,0.94;36,0.92;37,0.92;38,0.91;39,0.91;40,0.91;41,0.92;42,0.93|95>20,2.03;21,1.96;22,1.9;23,1.85;24,1.79;25,1.74;26,1.69;27,1.65;28,1.61;29,1.57;30,1.54;31,1.51;32,1.48;33,1.46;34,1.44;35,1.43;36,1.42;37,1.41;38,1.4;39,1.4;40,1.4;41,1.41;42,1.42',
				'raw',
			),
	},
	{
		hash: '06518025',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Projected birth weight: the estimated fetal weight is placed on the 5/50/95-centile weight-for-gestational-age chart, and that centile is then read off the same chart's term row (5,2848;50,3354;95,3860) to give the weight the baby is tracking towards. Self-contained — it computes the estimate itself, the same six-estimator cascade as 39dfbd84 — but needs the host `services` and `consultDate` for the gestational age.",
		build: (c) =>
			deferred(
				lines(
					PERCENTILE,
					OBSTETRIC_WEIGHT_VALUE(c),
					'if (!weight) { resolve(undefined); return }',
					gestationalAgeFromServices('undefined'),
					`const perc = percentile('${BIRTH_WEIGHT_CHART}', gaInDays / 7, weight)`,
					"resolve(perc === undefined ? undefined : { value: interpolate('5,2848;50,3354;95,3860', perc), unit: 'g' })",
				),
			),
	},
	{
		hash: '3dbc4c2f',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Centile of the estimated fetal weight for the patient's gestational age. Computes the estimate itself through the same cascade as 39dfbd84, so unlike 4e8b5757 and 01f9a82a it does not depend on a variable leaking out of another formula.",
		build: (c) =>
			deferred(
				lines(
					PERCENTILE,
					OBSTETRIC_WEIGHT_VALUE(c),
					'if (!weight) { resolve(undefined); return }',
					gestationalAgeFromServices('undefined'),
					`resolve(percentile('${BIRTH_WEIGHT_CHART}', gaInDays / 7, weight))`,
				),
			),
	},
	{
		hash: '0eb124b5',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			'Gestational age in days. Counted on the reconciled 280-day offset rather than the 279 this formula carried, so it agrees with 7b288ab4 on the sibling form; see the note there. The legacy resolved the string "N/A" when the patient had no due-date service; on a number field that stores nothing, so it is left undefined.',
		build: () => deferred(lines(gestationalAgeFromServices('undefined'), 'resolve(gaInDays)')),
	},
	{
		hash: '7b288ab4',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			'Gestational age as "<w> sem. <d> j.". Keeps the legacy 280-day offset, which is one day more than the 279 every other formula in this family uses — including 0eb124b5, the days count on the sibling form — so the two disagree by a day; the discrepancy is the legacy\'s and is preserved rather than reconciled. Being a text field it keeps the literal "N/A" for a patient with no due-date service.',
		build: () => deferred(lines(gestationalAgeFromServices("'N/A'"), `resolve(${weeksAndDaysExpr('gaInDays')})`)),
	},
	{
		hash: '356df209',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","weightbeforepregnancy",{"direction":"descending","limit":1}, function(services) { if (services.length) { var pag =  …',
		notes:
			"Weight gained since before the pregnancy: this form's Poids less the most recent CD-GYNECOLOGY|weightbeforepregnancy service. The legacy read the service's raw measureValue.value while this reads it through parseContent, so both operands are normalised the same way and a service recorded in grams no longer reads as kilograms. Either operand missing or zero yields no value, as the legacy's !pag||!x.Poids did. An unchanged weight computes 0, which the bridge's truthiness gate stores as nothing, so the field reads blank rather than as a zero — the same gate that blanks an all-zero MMSE, and what the legacy did too.",
		build: (c) =>
			deferred(
				lines(
					`const weightNow = ${c.value('Poids')}`,
					"const before = await services({ codeType: 'CD-GYNECOLOGY', code: 'weightbeforepregnancy', limit: 1 })",
					'if (!before.length) { resolve(undefined); return }',
					'const pag = parseContent(before[0].content)',
					"if (typeof pag !== 'number' || !pag || typeof weightNow !== 'number' || !weightNow) { resolve(undefined); return }",
					'resolve(weightNow - pag)',
				),
			),
	},
	{
		hash: '62c8e3f5',
		legacy: 'consultDate',
		notes: 'The date of the consultation, straight from the host.',
		build: () => 'return consultDate',
	},
	{
		hash: '80056419',
		legacy:
			'var dueDate = (!x.Dateovulation) ? … ; if (dueDate===null) { return "N/A"; } var today = h.dateUtils.dateToDaysSince1970(h.dateUtils.new(x.consultDate)); var days = 280+today-h.dateUtils.dateToDaysSince1970(dueDate); return ""+Math.floor(days/7)+" sem."+Math.floor(days)%7+" j."',
		notes:
			'Gestational age at the consultation, as "<w> sem.<d> j." — the separator carries no trailing space, as the legacy string did. Reads the three term dates from the form rather than from the host, so it needs only `consultDate`, and falls back to today without one. Keeps the legacy 280-day offset.',
		build: (c) =>
			lines(
				dueDateCascade(c, 279),
				DAY_NUMBER,
				"if (!term) { return 'N/A' }",
				'const today = consultDate ? dayNumber(consultDate) : dayNumber(new Date())',
				'const days = 280 + today - dayNumber(term)',
				WEEKS_AND_DAYS('days', ' sem.'),
			),
	},
	{
		hash: 'c3cb86ff',
		legacy: 'days=(CRL==void)?null:Math.round(org.taktik.icure.util.Math.interpolate("2,42;4,45;…;78,98",CRL));new Date(consultDate.time-days*24l*3600000l+3600000l*24l*7l*40l)',
		notes:
			'Term from the crown-rump length: the CRL gives the gestational age in days off the same table as the sibling `Terme` port, and the term is that many days back from the consultation, plus 40 weeks. The measurement goes through `toMm` as it does in that sibling — the legacy read it raw because legacy measures were not unit-normalised. Falls back to today without a host `consultDate`.',
		build: (c) =>
			lines(
				INTERPOLATE,
				TO_MM,
				ADD_DAYS,
				`const crl = ${c.value('CRL')}`,
				"if (typeof crl !== 'number') { return undefined }",
				`const days = Math.round(interpolate('${CRL_TABLE}', toMm(crl)))`,
				'return addDays(consultDate ? consultDate : new Date(), 280 - days)',
			),
	},
	{
		hash: '897e7228',
		legacy: 'withServices(p.id,"ICURE","GS",{"direction":"descending","limit":1}, function(services) { if (services.length) { resolve(false); } else { resolve(true …',
		notes: 'Ticks the blood-group box until a blood group has been recorded for the patient. Needs the host `services`.',
		build: (c) => screeningMissing(c, 'GroupeABORhesus', 'ICURE', 'GS'),
	},
	{
		hash: '1877e4cd',
		legacy: 'withServices(p.id,"ICURE","RH",{"direction":"descending","limit":1}, function(services) { if (services.length) { resolve(false); } else { resolve(true …',
		notes: 'Ticks the Rhesus subgroup box until a subgroup has been recorded. Same shape as 897e7228, different code.',
		build: (c) => screeningMissing(c, 'SousgroupesRhesus', 'ICURE', 'RH'),
	},
	{
		hash: '526ce117',
		legacy: 'withServices(p.id,"ICURE","TOXO",{"direction":"descending","limit":1}, function(services) { if (services.length) { var i; for(i=0;i<services.length;i+ …',
		notes:
			'Ticks the toxoplasmosis box until a recorded serology reads ‘protégée’. The comparison is against that exact string, as the legacy did; anything else, including an absent result, leaves the test on the list.',
		build: (c) => serologyUnprotected(c, 'SerologieToxoplasmoseIgMIgG', 'TOXO'),
	},
	{
		hash: '3bd3cac4',
		legacy: 'withServices(p.id,"ICURE","RUBEOLE",{"direction":"descending","limit":1}, function(services) { if (services.length) { var i; for(i=0;i<services.length …',
		notes: 'Ticks the rubella box until a recorded serology reads ‘protégée’. Same shape as 526ce117, different code.',
		build: (c) => serologyUnprotected(c, 'SerologieRubeoleIgG', 'RUBEOLE'),
	},
	{
		hash: '9336362b',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes:
			"Ticks the CMV box while the pregnancy is under 140 days — 20 weeks. The gestational age comes from the reconciled preamble rather than this formula's own basis, which took the term as a full 40 weeks after the last period and counted 279 from it; that read two days lower than the rest of the corpus, so the window now closes two days earlier than the legacy closed it. Ticked when no due-date service exists at all, as the legacy did.",
		build: (c) => screeningWindowOpen(c, 'SerologieCMV', 140),
	},
	{
		hash: '514075c0',
		legacy: 'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov  …',
		notes: 'Ticks the thyroid box while the pregnancy is under 154 days — 22 weeks. Same two-day shift as 9336362b, and the same reason; see the note there.',
		build: (c) => screeningWindowOpen(c, 'T4TSH', 154),
	},
]

/**
 * A declined port is not a gap in this table — it is a formula whose legacy
 * behaviour cannot be reconstructed, recorded so the report says why rather than
 * listing it as merely untranslated.
 *
 * Both entries below are the same fault. `Poids estimé` declares its estimated
 * weight with `var ow`, which in the old engine escaped into a scope these two
 * formulas then read. What they saw therefore depended on whether `Poids estimé`
 * had already run, and on which form it ran on — and in both, `ow` is only a
 * guard: the value published is the table lookup, which never uses it. Computing
 * the estimate inline here would be inventing a specification, and guessing
 * wrong would publish a plausible number into a patient record, so they stay
 * uncomputed until someone who owns the forms says what they should show.
 */
export type DeclinedPort = {
	hash: string
	legacy: string
	/** Why this cannot be ported as written. */
	reason: string
}

export const DECLINED_PORTS: DeclinedPort[] = [
	{
		hash: '4e8b5757',
		legacy:
			'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov = null; var tc = null; var i; for (i=0;i …',
		reason:
			'Publishes the median weight for the gestational age, but only when `ow` is truthy — and `ow` is never declared in this formula. It was the estimated fetal weight leaking out of the separate Poids estimé formula, so the field showed a value only once that one had run. Whether the guard was meant at all is unknowable: the median it returns does not depend on the estimate.',
	},
	{
		hash: '01f9a82a',
		legacy:
			'withServices(p.id,"CD-GYNECOLOGY","duedate",{"direction":"descending","limit":3}, function(services) { if (services.length) { var ddr = null; var dov = null; var tc = null; var i; for (i=0;i …',
		reason:
			'Same undeclared `ow` guard as 4e8b5757, over a second defect: it interpolates a months-to-centimetres length table at gaInDays/30, then returns the result with unit "g" in a variable still called meanWeight. Whether the field wants a length in cm or a weight in g cannot be read off the formula, and the label (Taille estimée à la naissance) contradicts the unit.',
	},
]

/**
 * A repair is not a port. These are fields whose legacy formula is broken — it
 * reads a field the form has never had — but where the intent is unambiguous and
 * the destination form does carry the operands under other names. The applier
 * writes them like a port, and the report lists them apart from the ports so the
 * distinction survives.
 */
export type FormulaRepair = {
	/** Curated form, relative to the curated root. */
	file: string
	/** Field to compute. */
	field: string
	/** The legacy form and formula this repairs. */
	legacyFile: string
	legacy: string
	/** Why the legacy formula cannot be ported as written, and what was assumed. */
	notes: string
	build: (c: PortContext) => string
}

export const FORMULA_REPAIRS: FormulaRepair[] = [
	{
		file: 'orthopedy-nl/fasciitis-plantaris.json',
		field: 'BMI',
		legacyFile: 'orthopedy-nl/fasciitis-plantaris.json',
		legacy: 'Poids/((Lengte/100.0)*(Gewicht/100.0))',
		notes:
			'The legacy formula divides by Lengte × Gewicht rather than by the square of the height, and its numerator "Poids" is a field this Dutch form never had. Read as the BMI the label promises, over the Gewicht and Lengte the form does carry.',
		build: (c) => bmi(c, 'Gewicht', 'Lengte'),
	},
	{
		file: 'common_nl/reis-van-diabeteszorg.json',
		field: 'BMI',
		legacyFile: 'oncology-nl/reis-van-diabeteszorg.json',
		legacy: 'Poids/((Taille/100.0)*(Taille/100.0))',
		notes: 'The legacy formula names the French Poids and Taille on a Dutch form whose weight and height fields are Gewicht and Maat. Same BMI, over the fields that exist.',
		build: (c) => bmi(c, 'Gewicht', 'Maat'),
	},
]
