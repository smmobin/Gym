/**
 * Debounced live search — fires while the user types (no Search button).
 *
 * @template {unknown[]} A
 * @param {(...args: A) => void} fn
 * @param {number} [ms]
 */
export function debounce(fn, ms = 300) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null
  /** @param {A} args */
  return (...args) => {
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }
}

/**
 * @param {HTMLInputElement | null | undefined} input
 * @param {(query: string) => void} onQuery
 * @param {{ delayMs?: number }} [opts]
 * @returns {() => void} unbind
 */
export function bindLiveSearch(input, onQuery, opts = {}) {
  if (!(input instanceof HTMLInputElement)) return () => {}
  const delayMs = opts.delayMs ?? 300
  const run = debounce(() => {
    onQuery(input.value)
  }, delayMs)

  input.addEventListener('input', run)
  // Native clear (x) on type=search
  input.addEventListener('search', run)

  return () => {
    input.removeEventListener('input', run)
    input.removeEventListener('search', run)
  }
}
