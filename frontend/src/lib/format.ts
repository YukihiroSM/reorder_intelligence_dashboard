// Display formatters. Numbers come from the API already computed.

export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

/** Compact money for chart axes / chips: $1.2k, $3.4M. */
export function shortMoney(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'k'
  return '$' + Math.round(n)
}

export function num(n: number, dp = 1): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

/** "7 Apr" style; appends the year ("Apr 7, 2027") when it isn't the data year,
 *  so a far-future reorder date isn't misread as the current year. */
export function shortDate(iso: string | null, today?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  const base = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  const refYear = today
    ? new Date(today + 'T00:00:00').getFullYear()
    : new Date().getFullYear()
  return d.getFullYear() === refYear ? base : `${base}, ${d.getFullYear()}`
}

/** Whole days between an ISO date and `today` (positive = in the past / overdue). */
export function daysAgo(iso: string | null, today: string | null): number | null {
  if (!iso || !today) return null
  const ms = new Date(today + 'T00:00:00').getTime() - new Date(iso + 'T00:00:00').getTime()
  return Math.round(ms / 86_400_000)
}
