export type VersionedData<T, V extends Version<T>> = {
	[id: string]: V[]
}

export interface Version<T> {
	value: T
}

export type Suggestion = { id: string; code: string; text: string; terms: string[] }
