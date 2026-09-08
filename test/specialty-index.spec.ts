import { reconcileSpecialtyIndex, SpecialtyIndex } from '../app/specialty-index'

// The committed app/samples/curated/index.json is a generated snapshot: it goes stale as
// soon as forms are deleted from (or added to) the submodule without re-running
// build-specialty-index.ts. The demo app therefore reconciles it against the files that
// are actually bundled before trusting it.
describe('reconcileSpecialtyIndex', () => {
	const index: SpecialtyIndex = {
		'cardiology-fr': [
			{ file: 'consultation.json', id: 'c1', title: 'Consultation', embeds: ['ecg1'] },
			{ file: 'ecg.json', id: 'ecg1', title: 'ECG', embeds: [] },
			{ file: 'ordonnance.json', id: 'o1', title: 'Ordonnance', embeds: [] },
		],
		'psychiatry-fr': [{ file: 'consultation.json', id: 'p1', title: 'Consultation', embeds: [] }],
	}

	test('keeps indexed entries whose file is present, with their metadata intact', () => {
		const result = reconcileSpecialtyIndex(index, ['cardiology-fr/consultation.json', 'cardiology-fr/ecg.json', 'cardiology-fr/ordonnance.json', 'psychiatry-fr/consultation.json'])
		expect(result).toEqual(index)
	})

	test('drops indexed entries whose file has been deleted', () => {
		const result = reconcileSpecialtyIndex(index, ['cardiology-fr/consultation.json', 'cardiology-fr/ecg.json', 'psychiatry-fr/consultation.json'])
		expect(result['cardiology-fr'].map((e) => e.file)).toEqual(['consultation.json', 'ecg.json'])
	})

	test('drops a specialty once none of its files are left', () => {
		const result = reconcileSpecialtyIndex(index, ['cardiology-fr/consultation.json', 'cardiology-fr/ecg.json', 'cardiology-fr/ordonnance.json'])
		expect(Object.keys(result)).toEqual(['cardiology-fr'])
	})

	test('adds a bare entry, titled after the file, for a present file the index does not know', () => {
		const result = reconcileSpecialtyIndex(index, [
			'cardiology-fr/consultation.json',
			'cardiology-fr/ecg.json',
			'cardiology-fr/ordonnance.json',
			'cardiology-fr/holter.json',
			'psychiatry-fr/consultation.json',
		])
		expect(result['cardiology-fr']).toContainEqual({ file: 'holter.json', id: null, title: 'holter', embeds: [] })
	})

	test('adds a specialty directory the index does not know, with bare entries', () => {
		const result = reconcileSpecialtyIndex(index, ['cardiology-fr/consultation.json', 'common_fr/protocol.json'])
		expect(result['common_fr']).toEqual([{ file: 'protocol.json', id: null, title: 'protocol', embeds: [] }])
	})

	test('lists entries of a specialty sorted by file name, like build-specialty-index.ts does', () => {
		const result = reconcileSpecialtyIndex(index, ['cardiology-fr/ordonnance.json', 'cardiology-fr/aaa-new.json', 'cardiology-fr/consultation.json'])
		expect(result['cardiology-fr'].map((e) => e.file)).toEqual(['aaa-new.json', 'consultation.json', 'ordonnance.json'])
	})
})
