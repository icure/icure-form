import { TemplateResult } from 'lit'
import { FormValuesContainer, Suggestion, Version } from '../../../generic'
import { Field, FieldMetadata, FieldValue, Form } from '../../model'

export interface RendererProps {
	language?: string
	labelPosition?: 'top' | 'left' | 'right' | 'bottom' | 'float'
	defaultOwner?: string
	/** Card renderer only: max interactive fields per card (1 or 2, default 1). */
	questionsPerCard?: number
}

export type Renderer = (
	form: Form,
	props: RendererProps,
	formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>,
	translationProvider?: (language: string, text: string) => string,
	revisionsFilter?: (field: Field, id: string, history: Version<FieldMetadata>[]) => string[],
	ownersProvider?: (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]>,
	optionsProvider?: (language: string, codifications: string[], terms?: string[]) => Promise<Suggestion[]>,
	actionListener?: (event: string, payload: unknown) => void,
	languages?: { [iso: string]: string },
	readonly?: boolean,
	displayMetadata?: boolean,
	sectionWrapper?: (index: number, section: () => TemplateResult) => TemplateResult,
) => Promise<TemplateResult>
