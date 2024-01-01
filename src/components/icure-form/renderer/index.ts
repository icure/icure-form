import { TemplateResult } from 'lit'
import { CodeStub, HealthcareParty } from '@icure/api'
import { FormValuesContainer } from '../../../generic'
import { Code, FieldMetadata, FieldValue, Form } from '../../model'

export interface RendererProps {
	defaultLanguage?: string
	labelPosition?: 'top' | 'left' | 'right' | 'bottom' | 'float'
	defaultOwner?: string
}

export type Renderer = (
	form: Form,
	props: RendererProps,
	formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>,
	translationProvider?: (language: string, text: string) => string,
	ownersProvider?: (speciality: string[]) => HealthcareParty[],
	codesProvider?: (codifications: string[], searchTerm: string) => Promise<CodeStub[]>,
	optionsProvider?: (language: string, codifications: string[], searchTerm?: string) => Promise<Code[]>,
	readonly?: boolean,
) => TemplateResult
