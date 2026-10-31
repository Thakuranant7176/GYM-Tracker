// Module hooks for the unit tests.
//  - The app's source uses extensionless relative imports (Vite resolves them); Node's ESM loader does
//    not, so ".js" is added when a relative import cannot be found as written.
//  - CSS imports become empty modules.
//  - The Supabase client module (which reads Vite's import.meta.env) is replaced by a stub, so screens
//    can be server-rendered with fixture data without any network or credentials.
export async function resolve(specifier, context, nextResolve) {
  if (/\.css$/.test(specifier)) {
    return { url: 'data:text/javascript,export default {}', shortCircuit: true }
  }
  if (/(^|\/)supabase$/.test(specifier) && context.parentURL && context.parentURL.includes('/.test-build/src/')) {
    return { url: new URL('../.test-build/tests/stubs/supabase.js', import.meta.url).href, shortCircuit: true }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND' && /^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.js`, context)
    }
    throw error
  }
}
