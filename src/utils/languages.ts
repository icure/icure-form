import { TranslationTable } from '../components/model'

export const languages = {
	en: 'English',
	fr: 'French',
	es: 'Spanish',
	nl: 'Dutch',
	de: 'German',
}

export const languageName = (iso: string): string => languages[iso] || iso

export const defaultTranslationProvider = (translations: TranslationTable[]) => (language: string, text: string) =>
	translations?.find((tt) => tt.language === language)?.translations?.[text] ?? text
