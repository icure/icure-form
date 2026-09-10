import { TemplateResult } from 'lit'
import { FormValuesContainer, Suggestion, Version } from '../../../generic'
import { Field, FieldMetadata, FieldValue, Form } from '../../model'

export interface RendererProps {
	language?: string
	labelPosition?: 'top' | 'left' | 'right' | 'bottom' | 'float'
	defaultOwner?: string
	/** Effective read-only flag: `<icure-form>` passes `readonly && hideEmptyFields`. Form renderers omit empty fields when set. */
	hideEmptyFields?: boolean
	/**
	 * Host-level palette provider for text, token and items-list fields that opt in (`codifications` declared, or
	 * `suggestions: true`). Receives the field's `codifications` so one provider can serve several codifications.
	 * A `suggestionProvider` function set on a field's `options` takes precedence.
	 */
	suggestionProvider?: (terms: string[], codifications: string[]) => Promise<Suggestion[]>
	/**
	 * Host-level link builder: turns an inserted suggestion into the link mark carried by the text, and serves fields
	 * with `links: true`. Applies to the fields the suggestion provider applies to, plus `links: true` fields.
	 * A `linksProvider` function set on a field's `options` takes precedence.
	 */
	linksProvider?: (sug: Suggestion) => Promise<{ href: string; title: string } | undefined>
	/**
	 * Host-level colour category for the codes shown in text, token and items-list fields (`(type, code) => category`).
	 * Applies to every such field; a `codeColorProvider` function set on a field's `options` takes precedence.
	 */
	codeColorProvider?: (type: string, code: string) => string
}

export type Renderer = (
	form: Form,
	props: RendererProps,
	formsValueContainer?: FormValuesContainer<FieldValue, FieldMetadata>,
	translationProvider?: (language: string, text: string) => string,
	revisionsFilter?: (field: Field, id: string, history: Version<FieldMetadata>[]) => string[],
	ownersProvider?: (terms: string[], ids?: string[], specialties?: string[]) => Promise<Suggestion[]>,
	optionsProvider?: (language: string, codifications: string[], terms?: string[]) => Promise<Suggestion[]>,
	actionListener?: (event: string, payload: unknown, domEvent?: Event) => void,
	languages?: { [iso: string]: string },
	readonly?: boolean,
	displayMetadata?: boolean,
	sectionWrapper?: (index: number, section: () => Promise<TemplateResult>) => Promise<TemplateResult>,
) => Promise<TemplateResult>
