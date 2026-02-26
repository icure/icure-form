import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 3100

const MIME_TYPES = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.yaml': 'text/yaml',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`)
	let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname)

	if (!fs.existsSync(filePath)) {
		res.writeHead(404)
		res.end('Not found')
		return
	}

	const ext = path.extname(filePath)
	const contentType = MIME_TYPES[ext] || 'application/octet-stream'

	const content = fs.readFileSync(filePath)
	res.writeHead(200, { 'Content-Type': contentType })
	res.end(content)
})

server.listen(PORT, () => {
	console.log(`Test server running at http://localhost:${PORT}`)
})
