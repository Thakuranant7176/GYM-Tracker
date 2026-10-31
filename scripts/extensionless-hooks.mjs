// The app's source uses extensionless relative imports (Vite resolves them). Node's ESM loader
// does not, so the tests add ".js" when a relative import cannot be found as written.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND' && /^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.js`, context)
    }
    throw error
  }
}
