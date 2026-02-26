import { defineConfig } from '@playwright/test'
import * as path from 'path'

const projectRoot = path.resolve(__dirname, '../..')

export default defineConfig({
	testDir: '.',
	testMatch: '*.spec.ts',
	timeout: 60_000,
	use: {
		headless: false,
		baseURL: 'http://localhost:3100',
	},
	workers: 1,
	webServer: {
		command: `node test/e2e/test-page/build.mjs && node test/e2e/test-page/server.mjs`,
		cwd: projectRoot,
		port: 3100,
		reuseExistingServer: true,
		timeout: 30_000,
	},
})
