import obstetrics from './samples/obstetrics.json'
import prescription from './samples/prescription.json'
import obstetrics_followup_long from './samples/obstetrics-followup-long.json'
import obstetrics_followup_short from './samples/obstetrics-followup-short.json'
import obstetrics_followup_midwife from './samples/obstetrics-followup-midwife.json'
import incapacity from './samples/incapacity.json'

import YAML from 'yaml'
import { FormLayout } from '@icure/api'
import { convertLegacy } from '../../src/conversion/icure-convert'

describe('Form conversion', () => {
	it('should convert an obstetrics form', () => {
		const form: FormLayout = obstetrics as FormLayout
		const translated = convertLegacy(form, [incapacity, prescription, obstetrics_followup_short, obstetrics_followup_long, obstetrics_followup_midwife] as FormLayout[])
		const json = YAML.stringify(JSON.parse(JSON.stringify(translated)))
		console.log(json)
	})
})
