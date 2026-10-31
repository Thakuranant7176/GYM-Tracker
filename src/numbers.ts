export type Parsed = { blank: true } | { blank: false; value: number } | { blank: false; value: null }

/**
 * Parses a number typed into a form field. Plain decimals only.
 *
 * - A single comma followed by one or two digits is a decimal comma: "6,5" is 6.5, "2,25" is 2.25.
 * - A comma followed by three digits ("1,000") is ambiguous with a thousands separator, so it is
 *   rejected instead of guessed.
 * - Exponents ("1e3"), signs, spaces inside the number and text are rejected.
 *
 * Returns `{ blank: true }` for an empty field and `{ blank: false, value: null }` for invalid text.
 */
export function parseDecimal(text: string): Parsed {
  const trimmed = text.trim()
  if (trimmed === '') return { blank: true }
  const normalised = /^\d+,\d{1,2}$/.test(trimmed) ? trimmed.replace(',', '.') : trimmed
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalised)) return { blank: false, value: null }
  return { blank: false, value: Number(normalised) }
}
