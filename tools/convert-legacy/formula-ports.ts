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
 */
const INTERPOLATE = lines(
	'const interpolate = (table, v) => {',
	"\tconst pts = table.split(';').map((p) => p.split(',').map(Number))",
	'\tif (v <= pts[0][0]) { return pts[0][1] }',
	'\tfor (let i = 1; i < pts.length; i++) {',
	'\t\tif (v <= pts[i][0]) { return pts[i - 1][1] + ((v - pts[i - 1][0]) * (pts[i][1] - pts[i - 1][1])) / (pts[i][0] - pts[i - 1][0]) }',
	'\t}',
	'\treturn pts[pts.length - 1][1]',
	'}',
)

/**
 * Millimetres from a parsed measure. `parseContent` normalises a measure that
 * carries a unit to metres, so anything below 1 is metres and is scaled back up;
 * a measure typed without a unit is already the millimetre figure the legacy
 * lookup tables expect.
 */
const TO_MM = 'const toMm = (v) => (v < 1 ? v * 1000 : v)'

/** `"<w> sem. <d> j."`, the legacy `""+days/7l+" sem. "+days%7+" j."` with its integer division. */
const WEEKS_AND_DAYS = (daysExpr: string, separator = ' sem. ') => `return '' + Math.floor(${daysExpr} / 7) + '${separator}' + (${daysExpr} % 7) + ' j.'`

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
const OBSTETRIC_WEIGHT = (c: PortContext) =>
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
		'if (!weight) { return undefined }',
		"return { value: weight, unit: 'g' }",
	)

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
