export const makeInterpreter = () => {
	const sb = new Map()
	const cs: Map<string, any> = new Map()

	return async <T, S extends { [key: string | symbol]: unknown }>(formula: string, sandbox: S): Promise<T | undefined> => {
		function compileCode(src: string) {
			if (cs.has(src)) {
				return cs.get(src)
			}

			src = 'with (sandbox) {' + src + '}'
			const code = new Function('sandbox', src)

			const wrapper = function (sandbox: S) {
				if (!sb.has(sandbox)) {
					const sandboxProxy = new Proxy<S>(sandbox, { has, get })
					sb.set(sandbox, sandboxProxy)
				}
				return code(sb.get(sandbox))
			}

			cs.set(src, wrapper)

			return wrapper
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
			const result = compiledCode(sandbox)
			return result
		} catch (e) {
			console.info('Error while executing formula: ' + formula, e)
			return undefined
		}
	}
}
