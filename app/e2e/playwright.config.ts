import { defineConfig } from '@playwright/test'
import * as path from 'path'

const projectRoot = path.resolve(__dirname, '../..')
const PORT = Number(process.env.DEMO_E2E_PORT ?? 3110)

// Playwright config for the demo app (app/) — boots the same rspack dev server
// the `yarn start` script uses, then runs the *.spec.ts files in this folder.
// If a server is already listening on PORT, it's reused (so you can iterate
// quickly with the dev server already running).
export default defineConfig({
	testDir: '.',
	testMatch: '*.spec.ts',
	timeout: 60_000,
	workers: 1,
	reporter: process.env.CI ? 'line' : 'list',
	use: {
		headless: true,
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure',
	},
	webServer: {
		command: `npx rspack serve --mode development --port ${PORT}`,
		cwd: projectRoot,
		port: PORT,
		reuseExistingServer: true,
		timeout: 60_000,
		stdout: 'ignore',
		stderr: 'pipe',
	},
})
