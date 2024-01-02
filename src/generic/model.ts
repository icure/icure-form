export interface VersionedData<T> {
	[id: string]: Version<T>[]
}

export interface Version<T> {
	revision: string | null //null means that the version is not saved yet
	modified?: number
	value: T
}

/**
 * FormValuesContainer is a readonly structure that provides and handle the values of a form.
 */
export interface FormValuesContainer<Value, Metadata> {
	getValues(revisionsFilter: (id: string, history: Version<Metadata>[]) => (string | null)[]): VersionedData<Value>
	getMetadata(id: string, revisions: string[]): VersionedData<Metadata>
	setValue(label: string, language: string, data: Value, id?: string, metadata?: Metadata): string
	setMetadata(label: string, metadata: Metadata, id?: string): string
	delete(serviceId: string): void
	compute<T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox?: S): T | undefined
	getChildren(subform: string): { [form: string]: FormValuesContainer<Value, Metadata>[] }
	registerChangeListener(listener: (newValue: FormValuesContainer<Value, Metadata>) => void): void
	unregisterChangeListener(listener: (newValue: FormValuesContainer<Value, Metadata>) => void): void
}

export type Suggestion = { id: string; code: string; text: string; terms: string[] }
