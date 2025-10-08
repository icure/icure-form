import { FormLayout } from '@icure/api'
import {
	Button,
	CheckBox,
	DatePicker,
	DateTimePicker,
	DropdownField,
	Field,
	Form,
	ItemsListField,
	MeasureField,
	NumberField,
	Section,
	Subform,
	TextField,
	TokenField,
} from '../components/model'
import { FormLayoutData } from '@icure/api/icc-api/model/FormLayoutData'
import { cluster } from './ckmeans-grouping'

export function convertLegacy(form: FormLayout, formsLibrary: FormLayout[]): Form {
	const TOTAL_COLUMNS = 24
	const makeTextField = (formData: FormLayoutData, width: number, height: number) =>
		new TextField(formData.name ?? '', { shortLabel: formData.label, span: width, rowSpan: height > 1 ? height : undefined })
	const makeItemsListField = (formData: FormLayoutData, width: number, height: number) =>
		new ItemsListField(formData.name ?? '', { shortLabel: formData.label, span: width, rowSpan: height > 1 ? height : undefined })
	const makeTokenField = (formData: FormLayoutData, width: number, height: number) =>
		new TokenField(formData.name ?? '', { shortLabel: formData.label, span: width, rowSpan: height > 1 ? height : undefined })
	const makeCheckBox = (formData: FormLayoutData, width: number, height: number) =>
		new CheckBox(formData.name ?? '', { shortLabel: formData.label, options: { [formData.label ?? '']: formData.label }, span: width, rowSpan: height > 1 ? height : undefined })
	const makeMeasureField = (formData: FormLayoutData, width: number, height: number) =>
		new MeasureField(formData.name ?? '', { shortLabel: formData.label, span: width, rowSpan: height > 1 ? height : undefined })
	const makeNumberField = (formData: FormLayoutData, width: number, height: number) =>
		new NumberField(formData.name ?? '', { shortLabel: formData.label, span: width, rowSpan: height > 1 ? height : undefined })
	const makeDateTimeField = (formData: FormLayoutData, width: number, height: number) =>
		(formData.editor as any)?.displayTime
			? new DateTimePicker(formData.name ?? '', { shortLabel: formData.label, span: width, rowSpan: height > 1 ? height : undefined })
			: new DatePicker(formData.name ?? '', { shortLabel: formData.label, span: width, rowSpan: height > 1 ? height : undefined })

	const makeDropdownField = (formData: FormLayoutData, width: number, height: number) =>
		new DropdownField(formData.name ?? '', {
			shortLabel: formData.label,
			span: width,
			options: (formData.editor as any)?.menuOptions
				? (formData.editor as any)?.menuOptions.reduce(
						(
							acc: {
								[key: string]: unknown
							},
							v: string,
						) => ({ ...acc, [`LEGACY|${v}|1`]: v }),
						{},
				  )
				: undefined,
		})

	const makeSubForm = (formData: FormLayoutData, width: number, height: number) => {
		const subForms = ((formData.editor as any)?.optionalFormGuids as string[])?.map((guid: string) => {
			const subForm = formsLibrary.find((it) => it.guid === guid)
			if (!subForm) {
				throw new Error(`Cannot find subform ${guid}`)
			}
			return convertLegacy(subForm as FormLayout, formsLibrary)
		})
		return new Subform(
			formData.name ?? '',
			subForms.reduce((acc, sf) => ({ ...acc, [sf.form]: sf }), {}),
			{
				shortLabel: formData.label,
				span: width,
				rowSpan: height,
			},
		)
	}

	const makeActionButton = (formData: FormLayoutData, width: number, height: number) =>
		new Button(formData.name ?? '', { shortLabel: formData.label, span: width, rowSpan: height > 1 ? height : undefined })

	// noinspection UnnecessaryLocalVariableJS
	const translated = new Form(
		(form.group ? `${form.group}/${form.name}` : form.name) ?? 'Unknown',
		(form.sections ?? []).map((section) => {
			const fld = (section.formColumns ?? []).flatMap((column) => column.formDataList ?? [])
			const sortedList = fld.sort((a, b) => (a.editor?.top ?? 0) - (b.editor?.top ?? 0))

			const rowClusters = cluster(
				fld.map((f) => f.editor?.top ?? 0),
				5,
				16,
			)
			const rows = rowClusters.clusters

			const intraCentroids = rowClusters.centroids.map((v, idx, centroids) => (idx > 0 ? v - centroids[idx - 1] : 0)).filter((x) => x > 0)
			const meanHeightWithOutliers = intraCentroids.reduce((sum, v) => v + sum, 0) / intraCentroids.length
			const intraCentroidsWithoutOutliers = intraCentroids.filter((x) => x < meanHeightWithOutliers * 2)
			const meanHeight = intraCentroidsWithoutOutliers.reduce((sum, v) => v + sum, 0) / intraCentroidsWithoutOutliers.length

			const formDataClusters = sortedList
				.reduce(
					(cs, fd) => {
						cs[rows.findIndex((c) => c.includes(fd.editor?.top ?? 0))].push(fd)
						return cs
					},
					new Array(rows.length).fill(null).map(() => [] as FormLayoutData[]),
				)
				.map((c) => c.sort((a, b) => (a.editor?.left ?? 0) - (b.editor?.left ?? 0)))

			const leftMostField = sortedList.filter((f) => !f.subForm).reduce((a, b) => ((a.editor?.left ?? 0) < (b.editor?.left ?? 0) ? a : b))
			const rightMostField = sortedList
				.filter((f) => !f.subForm)
				.reduce((a, b) => ((a.editor?.left ?? 0) + (a.editor?.width ?? 0) < (b.editor?.left ?? 0) + (b.editor?.width ?? 0) ? b : a))

			const leftSide = leftMostField.editor?.left ?? 0
			const formWidth = (rightMostField?.editor?.left ?? 0) + (rightMostField?.editor?.width ?? 1024) - leftSide
			const interColumnsDistance = formWidth / TOTAL_COLUMNS
			const columns = cluster(
				fld.map((f) => (f.editor?.left ?? 0) + (f.editor?.width ?? 0) - leftSide),
				formWidth / (TOTAL_COLUMNS * 2),
				Math.ceil((formWidth ?? 1024) / (TOTAL_COLUMNS * 4)),
				Math.max(Math.min(TOTAL_COLUMNS, fld.length / 2), 1),
			)
			const columnsWidth = columns.centroids.map((v, idx, t) => v - (t[idx - 1] ?? 0))

			const acc = columnsWidth.map(() => 1)
			while (acc.reduce((s, v) => s + v, 0) < TOTAL_COLUMNS) {
				const idx = acc.reduce(
					(s: [number | undefined, number], size: number, idx: number): [number | undefined, number] => {
						const diff = size * interColumnsDistance - columnsWidth[idx]
						return diff < 0 && -diff > s[1] ? [idx, -diff] : s
					},
					[undefined, 0],
				)
				const selected = idx[0]
				if (selected === undefined) {
					break
				}
				acc[selected]++
			}
			// noinspection UnnecessaryLocalVariableJS
			const columnsRoundedWidth = acc

			const columnsAccumulatedWidth = columnsRoundedWidth.reduce((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], [])
			const columnsAccumulatedWidthWithInterColumns = columnsAccumulatedWidth.map((v) => v * interColumnsDistance)

			return new Section(
				'Main',
				formDataClusters.flatMap((formDataRow: FormLayoutData[]) => {
					const cols = formDataRow
						.map((formData: FormLayoutData) => {
							return columnsAccumulatedWidth[
								columnsAccumulatedWidthWithInterColumns.reduce(
									([idx, min]: [number, number], x, n) => {
										const right = (formData.editor?.left ?? 0) + (formData.editor?.width ?? 0) - leftSide
										return Math.abs(x - right) < min ? [n, Math.abs(x - right)] : [idx, min]
									},
									[0, 99999],
								)[0]
							]
						})
						.map((x, idx, cols) => {
							//Try to solve inverted positions in columns by adding or removing one column
							const prev = cols[idx - 1] ?? 0
							const next = cols[idx + 1] ?? TOTAL_COLUMNS
							return x > prev + 1 && x >= next - 1 ? x - 1 : x === prev ? x + 1 : x
						})
					const subRows = cols.reduce((acc, v, idx, cols) => {
						if (idx === 0) {
							return [[[idx, v]]]
						}
						let row = 0
						while (row < acc.length && acc[row][acc[row].length - 1][1] > v) {
							row++
						}
						;(acc[row] ?? (acc[row] = [])).push([idx, v] as [number, number])
						return acc
					}, [] as [number, number][][])

					return subRows.flatMap((subRow) => {
						const acc = subRow.map((x) => x[1])
						while (acc[acc.length - 1] < TOTAL_COLUMNS) {
							const idx = acc.reduce(
								([minIdx, min]: [number | undefined, number], size: number, idx: number, columns: number[]): [number | undefined, number] => {
									const scenario = columns.map((x, cidx) => (cidx === idx ? x + 1 : x))
									const penalty = scenario.reduce((acc, v) => {
										const right = (formDataRow[subRow[idx][0]].editor?.left ?? 0) + (formDataRow[subRow[idx][0]].editor?.width ?? 0) - leftSide
										return acc + Math.abs(v * interColumnsDistance - right)
									}, 0)
									return penalty < min ? [idx, penalty] : [minIdx, min]
								},
								[undefined, 999999],
							)
							const selected = idx[0]
							if (selected === undefined) {
								break
							}
							for (let i = selected; i < acc.length; i++) {
								acc[i]++
							}
						}
						const expandedCols = acc
						let idx = 0
						return subRow
							.map(([idx]) => formDataRow[idx])
							.map((formData: FormLayoutData, index) => {
								const width = expandedCols[index] - idx
								idx += width
								return (
									{
										StringEditor: makeTextField,
										CheckBoxEditor: makeCheckBox,
										MeasureEditor: makeMeasureField,
										NumberEditor: makeNumberField,
										PopupMenuEditor: makeDropdownField,
										DateTimeEditor: makeDateTimeField,
										StringTableEditor: makeItemsListField,
										TokenFieldEditor: makeTokenField,
										SubFormEditor: makeSubForm,
										ActionButton: makeActionButton,
									} as { [key: string]: (fd: FormLayoutData, w: number, h: number) => Field | Subform }
								)[formData.editor?.key ?? '']?.(formData, width, Math.max(1, Math.floor((formData.editor?.height ?? 0) / meanHeight)))
							})
					})
				}),
			)
		}),
		form.guid,
	)
	return translated
}
