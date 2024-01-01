import { Field, Code } from '../components/model'
import { CodeStub } from '@icure/api'

export function optionMapper(language: string, field: Field, translationProvider?: (language: string, text: string) => string): Code[] {
	return Object.keys(field?.options ?? []).map((optionKey) => {
		const text: string = (field?.options?.[optionKey] as string) ?? ''
		return {
			id: optionKey,
			label: { [language]: translationProvider ? translationProvider(language, text) : text },
		}
	})
}

export const codeStubToCode = (c: CodeStub) => ({ id: c.id ?? `${c.type}|${c.code}|${c.version}`, label: c.label ?? {} })
