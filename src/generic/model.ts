export interface VersionedData<T> {
	[id: string]: Version<T>[]
}

export interface Version<T> {
	revision?: string //undefined means that the version is not saved yet
	modified?: number
	value: T
}

export interface FormValuesContainer<Value, Metadata> {
	getValues(revisionsFilter: (id: string, history: Version<Metadata>[]) => string[]): VersionedData<Value>
	getMetadata(id: string, revisions: string[]): VersionedData<Metadata>
	setValue(label: string, language: string, data: Value, id?: string): string
	setMetadata(label: string, meta: Metadata, id?: string): string
	delete(serviceId: string): void
	compute<T, S>(formula: string, sandbox?: S): Promise<T | undefined>
	getChildren(subform: string): { [form: string]: FormValuesContainer<Value, Metadata>[] }
}

export type Suggestion = { id: string; code: string; text: string; terms: string[] }
