export const makeInterpreter = () => {
	const sb = new Map()
	const cs: Map<string, any> = new Map()

	return <T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox: S): T | undefined => {
		function compileCode(src: string) {
			if (cs.has(src)) {
				return cs.get(src)
			}

			src = 'with (sandbox) {' + src + '}'
			const code = new Function('sandbox', src)

			const result = function (sandbox: S) {
				if (!sb.has(sandbox)) {
					const sandboxProxy = new Proxy<S>(sandbox, { has, get })
					sb.set(sandbox, sandboxProxy)
				}
				return code(sb.get(sandbox))
			}

			cs.set(src, result)

			return result
		}

		function has() {
			return true
		}

		function get(target: S, key: string | symbol) {
			if (key === Symbol.unscopables) return undefined
			return target[key]
		}

		let compiledCode: any
		try {
			compiledCode = compileCode(formula)
		} catch (e) {
			console.info('Invalid Formula: ' + formula)
			return undefined
		}
		try {
			return compiledCode(sandbox)
		} catch (e) {
			console.info('Error while executing formula: ' + formula, e)
			return undefined
		}
	}
}
