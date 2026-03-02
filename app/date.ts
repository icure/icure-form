import { differenceInDays, differenceInMonths, differenceInYears, format, parse } from 'date-fns'

export const getNumericDate = (date: Date | number): number => {
	return Number(format(date, 'yyyyMMddHHmmss'))
}

export const formatTimestampToHumanReadable = (timestamp: number | undefined): string | undefined => {
	if (!timestamp) {
		return undefined
	}
	const parsedDate = parse(timestamp.toString(), 'yyyyMMddHHmmss', new Date())
	return format(parsedDate, 'd MMMM yyyy')
}

export const convertTimeInSeconds = (text?: string) => {
	const getPart = (part: string): [number, string] => {
		let match = part.match(/([0-9.,]+)\s*(?:uur|uren|heures|heure|hours|hour|h\.|u\.|h|u)(?:\s+(?:and|et|en))?\s*/)
		if (match) {
			return [Number(match[1].replaceAll(',', '.')) * 3600, part.replace(match[0], '').trim()]
		}
		match = part.match(/([0-9.,]+)\s*(?:minuten|minutes|minute|minuut|min\.|min|m\.|m)(?:\s+(?:and|et|en))?\s*/)
		if (match) {
			return [Number(match[1].replaceAll(',', '.')) * 60, part.replace(match[0], '').trim()]
		}
		match = part.match(/([0-9.,]+)\s*(?:seconden|secondes|seconde|second|sec\.|s\.|sec|s)\s*/)
		if (match) {
			return [Number(match[1].replaceAll(',', '.')), part.replace(match[0], '').trim()]
		}
		return [0, part.trim()]
	}

	if (!text || text.trim() === '') {
		return 0
	}

	let match
	if ((match = text.trim().match(/^([0-9.,]+)$/))) {
		return Number(match[1].replaceAll(',', '.')) * 3600
	}

	if ((match = text.trim().match(/^([0-9.,]+):([0-9.,]+):([0-9.,]+)$/))) {
		return Number(match[1].replaceAll(',', '.')) * 3600 + Number(match[2].replaceAll(',', '.')) * 60 + Number(match[3].replaceAll(',', '.'))
	}
	if ((match = text.trim().match(/^([0-9.,]+):([0-9.,]+)$/))) {
		return Number(match[1].replaceAll(',', '.')) * 3600 + Number(match[2].replaceAll(',', '.')) * 60
	}

	let part = text.trim()
	let sum = 0
	while (part.length > 0) {
		const [value, rest] = getPart(part) || [0, '']
		if (rest === part) {
			break
		}
		part = rest.trim()

		if (isNaN(value)) {
			continue
		}
		if (isFinite(value)) {
			sum += value
		}
	}
	return sum
}

export const getAge = (date: number | undefined): number | undefined => (date ? differenceInYears(new Date(), new Date(date / 10000, (date % 10000) / 100 - 1, date % 100)) : undefined)

export const getAgeDescription = (date: number | undefined, language = 'fr'): string | undefined => {
	if (!date) {
		return '-'
	}

	const units =
		language === 'fr'
			? [
					['an', 'ans'],
					['mois', 'mois'],
					['jour', 'jours'],
			  ]
			: language === 'nl'
			? [
					['jaar', 'jaar'],
					['maand', 'maanden'],
					['dag', 'dagen'],
			  ]
			: [
					['year', 'years'],
					['month', 'months'],
					['day', 'days'],
			  ]

	const now = new Date()
	const birthDate = new Date(date / 10000, (date % 10000) / 100 - 1, date % 100)

	const years = differenceInYears(now, birthDate)
	if (years !== 0) {
		return `${years} ${units[0][years === 1 ? 0 : 1]}`
	}

	const months = differenceInMonths(now, birthDate)
	if (months !== 0) {
		return `${months} ${units[1][months === 1 ? 0 : 1]}`
	}

	const days = differenceInDays(now, birthDate)
	if (days !== 0) {
		return `${days} ${units[2][days === 1 ? 0 : 1]}`
	}

	return 'just born'
}
