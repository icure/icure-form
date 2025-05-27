import { FieldMetadata, FieldValue } from '../components/model'

/**
 * VersionedData is a structure that contains the values of a form, organized by id and version.
 */
export interface VersionedData<T> {
	[id: string]: Version<T>[]
}

/**
 * Version is a structure that contains a value, a revision number and a modification timestamp used to sort the versions.
 */
export interface Version<T> {
	revision: string | null //null means that the version is not saved yet
	modified?: number
	value: T
}

export type ID = string
/**
 * FormValuesContainer is a readonly structure that provides and handle the values of a form.
 * It is a tree structure where each node is a FormValuesContainer with the same Value and Metadata types.
 *
 * The following methods are provided and must be implemented by the concrete class:
 * - `compute(formula: string, sandbox?: S): T?` : computes a formula based on the values of the form, inside a provided sandbox. If no sandbox is provided, the default sandbox is used.
 * - `getLabel(): string` : returns the label of the form values container (used to display the title of the form in hierarchical contexts)
 * - `getFormId(): string?` : returns the id of the form values container
 * - `getValues(revisionsFilter: Lambda): VersionedData<Value>` : obtains the values to be displayed in the form, using a filter
 * 			to select the desired versioned data that are to be displayed in a specific field.
 * - `getMetadata(id: string, revisions: (string | null)[]): VersionedData<Metadata>` : obtains the metadata of a specific value, for the specified revisions.
 * - `getValidationErrors(): [FieldMetadata, string][]`: returns the validation errors of the form values container for the values that are currently stored in it.
 * - `getChildren(): FormValuesContainer<Value, Metadata>[]` : returns the children of the form values container
 * - `setValue(label: string, language: string, data?: Value, id?: string, metadata?: Metadata): FormValuesContainerMutation<Value, Metadata, FormValuesContainer<Value, Metadata>, ID>` :
 * 			modifies the value associated to a field in the form values container. As a form values container is immutable, this method returns a mutation wrapping
 * 			a new form values container along with the modified value.
 * - `setMetadata(label: string, metadata: Metadata, id?: string): FormValuesContainerMutation<Value, Metadata, FormValuesContainer<Value, Metadata>, ID>` :
 * 			modifies the metadata associated to a value in the form values container. As a form values container is immutable, this method returns a mutation wrapping
 * 			a new form values container along with the modified metadata.
 * - `delete(valueId: string): FormValuesContainerMutation<Value, Metadata, FormValuesContainer<Value, Metadata>, void>` :
 * 			deletes a value from the form values container. As a form values container is immutable, this method returns a mutation wrapping
 * 			a new form values container without the deleted value.
 * - `addChild(anchorId: string, templateId: string, label: string): Promise<FormValuesContainerMutation<...>, FormValuesContainer<...>>>`:
 * 			adds a child to the form values container. As a form values container is immutable, this method returns a mutation wrapping
 * 			a new form values container with the added child.
 * - `removeChild(container: FormValuesContainer<Value, Metadata>): Promise<FormValuesContainerMutation<Value, Metadata, FormValuesContainer<Value, Metadata>, void>>` :
 * 			removes a child from the form values container. As a form values container is immutable, this method returns a mutation wrapping
 * 			a new form values container without the removed child.
 * - `registerChangeListener(listener: (newValue: FormValuesContainer<Value, Metadata>) => void): void` :
 * 			registers a listener that will be called whenever the form values container is modified.
 * - `unregisterChangeListener(listener: (newValue: FormValuesContainer<Value, Metadata>) => void): void` : unregisters a listener that was previously registered.
 *
 */
export interface FormValuesContainer<Value, Metadata> {
	//information retrieval
	compute<T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox?: S): Promise<T | undefined>
	getLabel(): string
	getFormId(): string | undefined
	getDefaultValue(label: string): Promise<FieldValue | undefined>
	getValues(revisionsFilter: (id: string, history: Version<Metadata>[]) => (string | null)[]): VersionedData<Value>
	getMetadata(id: string, revisions: (string | null)[]): VersionedData<Metadata>
	getChildren(): Promise<FormValuesContainer<Value, Metadata>[]>
	getValidationErrors(): Promise<[FieldMetadata, string][]>
	//modification
	setValue(label: string, language: string, data?: Value, id?: string, metadata?: Metadata, changeListenersOverrider?: (fvc: FormValuesContainer<Value, Metadata>) => void): void
	setMetadata(metadata: Metadata, id?: string): void
	delete(serviceId: string): void
	//hierarchy
	addChild(anchorId: string, templateId: string, label: string): Promise<void>
	removeChild(container: FormValuesContainer<Value, Metadata>): Promise<void>
	//listeners
	registerChangeListener(listener: (newValue: FormValuesContainer<Value, Metadata>) => void): void
	unregisterChangeListener(listener: (newValue: FormValuesContainer<Value, Metadata>) => void): void

	synchronise(): FormValuesContainer<Value, Metadata>
}

/**
 * FormValuesContainerMutation is a structure that wraps a new form values container along with the modified value.
 */
export interface FormValuesContainerMutation<Value, Metadata, FVC extends FormValuesContainer<Value, Metadata>, Result> {
	result: Result
	formValuesContainer: FVC
}

export type Suggestion = { id: string; code?: string; text: string; terms: string[]; label: { [lng: string]: string } }
