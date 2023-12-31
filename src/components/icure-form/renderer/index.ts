import { TemplateResult } from 'lit'
import { CodeStub, HealthcareParty } from '@icure/api'
import { FormValuesContainer } from '../../../generic'
import { Code, FieldMetadata, FieldValue, Form } from '../../model'

export type Renderer = (
	form: Form,
	props: { [p: string]: unknown },
	formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>,
	formValuesContainerChanged?: (newValue: FormValuesContainer<FieldValue, FieldMetadata>) => void,
	translationProvider?: (language: string, text: string) => string,
	ownersProvider?: (speciality: string[]) => HealthcareParty[],
	codesProvider?: (codifications: string[], searchTerm: string) => Promise<CodeStub[]>,
	optionsProvider?: (language: string, codifications: string[], searchTerm?: string) => Promise<Code[]>,
	readonly?: boolean,
) => TemplateResult
