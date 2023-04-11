import { Form } from '../model'
import { TemplateResult } from 'lit'
import { FormValuesContainer } from '../../iqr-form-loader/formValuesContainer'

export type Renderer = (
	form: Form,
	skin: string,
	props: { [p: string]: unknown },
	formsValueContainer?: FormValuesContainer,
	formValuesContainerChanged?: (newValue: FormValuesContainer) => void,
) => TemplateResult
