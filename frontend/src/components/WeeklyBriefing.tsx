import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowRight, RefreshCw, Sparkles, TriangleAlert, X } from 'lucide-react'

import { getWeeklyBriefing } from '../api/api'
import { money } from '../lib/format'
import { useBodyScrollLock } from '../lib/scrollLock'
import type { Scenario, WeeklyBriefing } from '../types'
import { ActionBadge, UrgencyDots } from './atoms'

function scenarioLabel(s: Scenario): string {
  if (s.growth === 0) return 'baseline'
  return `${s.growth > 0 ? '+' : ''}${s.growth}% growth`
}

// The briefing echoes the scenario it was reasoned under; if the live controls moved
// since, it's stale and we nudge a refresh.
function isStale(b: WeeklyBriefing, s: Scenario): boolean {
  return (
    b.scenario.growth_pct !== s.growth ||
    b.scenario.forecast_window_days !== s.forecastDays ||
    b.scenario.shipping_buffer_days !== s.leadBuffer
  )
}

// Punchy one-liner derived from the deterministic counts (no LLM prose to truncate).
function headline(b: WeeklyBriefing): string {
  const c = b.status_counts
  const fires = (c.STOCKOUT ?? 0) + (c.CRITICAL ?? 0)
  if (fires === 0 && b.actionable_count === 0) return 'All SKUs healthy — nothing to order this week'
  const parts: string[] = []
  if (c.STOCKOUT) parts.push(`${c.STOCKOUT} stockout`)
  if (c.CRITICAL) parts.push(`${c.CRITICAL} critical`)
  if (!parts.length && b.actionable_count) parts.push(`${b.actionable_count} need action`)
  return `${parts.join(' + ')} · ${money(b.total_revenue_at_risk_usd)} at risk`
}

/* ===== Slim banner (always on the page) ===== */
function Banner({
  briefing,
  pending,
  stale,
  scenario,
  onOpen,
}: {
  briefing: WeeklyBriefing | undefined
  pending: boolean
  stale: boolean
  scenario: Scenario
  onOpen: () => void
}) {
  return (
    <button className="ai-banner" onClick={onOpen}>
      <span className="ai-banner-icon">
        <Sparkles size={15} />
      </span>
      <span className="ai-banner-label">AI weekly briefing</span>
      <span className="ai-banner-scn">{scenarioLabel(scenario)}</span>

      {pending ? (
        <span className="ai-banner-mid muted">analysing the portfolio…</span>
      ) : briefing ? (
        <span className="ai-banner-mid">
          {headline(briefing)}
          {stale && <span className="ai-banner-stale" title="Scenario changed — refresh">scenario changed</span>}
        </span>
      ) : (
        <span className="ai-banner-mid muted">generate this week's plan under {scenarioLabel(scenario)}</span>
      )}

      <span className="ai-banner-cta">
        {briefing ? `View plan` : 'Generate'}
        <ArrowRight size={13} />
      </span>
    </button>
  )
}

/* ===== Full briefing in a right-side sheet ===== */
function BriefingSheet({
  open,
  skuOpen,
  briefing,
  pending,
  error,
  stale,
  scenario,
  aiEnabled,
  onRefresh,
  onClose,
  onOpenSku,
}: {
  open: boolean
  skuOpen: boolean
  briefing: WeeklyBriefing | undefined
  pending: boolean
  error: boolean
  stale: boolean
  scenario: Scenario
  aiEnabled: boolean
  onRefresh: () => void
  onClose: () => void
  onOpenSku: (code: string) => void
}) {
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const b = briefing
  return (
    <>
      {/* No own scrim while a SKU drawer is open — its backdrop covers both panels. */}
      <div className={`scrim ${open && !skuOpen ? 'open' : ''}`} onClick={onClose} />
      <aside
        className={`drawer briefing-drawer ${open ? 'open' : ''} ${skuOpen ? 'with-sku' : ''}`}
        aria-hidden={!open}
      >
        <div className="drawer-head">
          <div className="top-row">
            <div>
              <div className="code" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Sparkles size={13} /> AI WEEKLY BRIEFING
              </div>
              <div className="title">What to do this week</div>
              <div className="meta">
                {scenarioLabel(scenario)}
                {!aiEnabled && (
                  <>
                    <span className="sep">·</span>deterministic mode
                  </>
                )}
              </div>
            </div>
            <button className="drawer-close" onClick={onClose} aria-label="Close briefing">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {pending && (
            <div className="drawer-section">
              <div className="ai-skeleton">
                <div className="line l2" />
                <div className="line l3" />
                <div className="line l1" />
              </div>
            </div>
          )}

          {error && !pending && (
            <div className="drawer-section">
              <div className="ai-warning">
                <TriangleAlert size={13} />
                <span>Couldn't generate the briefing. Is the API running?</span>
              </div>
              <button className="ai-button" style={{ marginTop: 12 }} onClick={onRefresh}>
                Try again
              </button>
            </div>
          )}

          {b && !pending && (
            <>
              {stale && (
                <div className="briefing-stale" style={{ margin: '0 0 4px' }}>
                  Scenario changed since this was generated — refresh to re-reason.
                </div>
              )}

              <div className="drawer-section">
                <p className="briefing-summary" style={{ marginBottom: 0 }}>{b.summary}</p>
                <div className="briefing-stats" style={{ marginBottom: 0 }}>
                  <div className="bstat">
                    <span className="bstat-label">Cash to commit</span>
                    <span className="bstat-value">{money(b.total_cash_to_commit_usd)}</span>
                  </div>
                  <div className="bstat">
                    <span className="bstat-label">Revenue at risk</span>
                    <span className="bstat-value crit">{money(b.total_revenue_at_risk_usd)}</span>
                  </div>
                  <div className="bstat">
                    <span className="bstat-label">Need action</span>
                    <span className="bstat-value">{b.actionable_count} SKUs</span>
                  </div>
                </div>
              </div>

              {b.top_actions.length > 0 && (
                <div className="drawer-section">
                  <div className="drawer-section-title">
                    <span>Top actions</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>most urgent first</span>
                  </div>
                  <div className="briefing-actions">
                    {b.top_actions.map((a) => (
                      <button key={a.sku_code} className="baction" onClick={() => onOpenSku(a.sku_code)}>
                        <div className="baction-top">
                          <ActionBadge action={a.action} />
                          <span className="baction-code">{a.sku_code}</span>
                          <UrgencyDots urgency={a.urgency} />
                          <ArrowRight size={13} className="baction-arrow" />
                        </div>
                        <div className="baction-headline">{a.headline}</div>
                        <div className="baction-why">{a.why_now}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {b.watch_list.length > 0 && (
                <div className="drawer-section">
                  <div className="drawer-section-title">
                    <span>Worth watching</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>not urgent</span>
                  </div>
                  <div className="briefing-watch" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                    {b.watch_list.map((w) => (
                      <button key={w.sku_code} className="bwatch" onClick={() => onOpenSku(w.sku_code)}>
                        <span className="bwatch-code">{w.sku_code}</span>
                        <span className="bwatch-note">{w.note}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="briefing-foot" style={{ padding: '0 20px 16px' }}>
                <span>
                  {b.ai_status === 'fallback' ? 'deterministic' : b.model_name}
                  {b.cached ? ' · cached' : ' · fresh'}
                  {b.tokens_output ? ` · ${(b.tokens_input ?? 0) + b.tokens_output} tok` : ''}
                </span>
                <span>grounded · numbers verified</span>
              </div>
            </>
          )}
        </div>

        {b && !pending && (
          <div className="drawer-footer">
            <button className="btn btn-primary" onClick={onRefresh}>
              <RefreshCw size={12} /> Refresh{scenario.growth !== 0 ? ` · ${scenarioLabel(scenario)}` : ''}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

export function WeeklyBriefingSection({
  scenario,
  aiEnabled,
  skuOpen,
  onOpenSku,
}: {
  scenario: Scenario
  aiEnabled: boolean
  skuOpen: boolean
  onOpenSku: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const gen = useMutation({
    mutationFn: (force: boolean) => getWeeklyBriefing(scenario, force),
  })
  const b = gen.data
  const stale = b ? isStale(b, scenario) : false

  function openSheet() {
    setOpen(true)
    if (!gen.data && !gen.isPending) gen.mutate(false) // auto-generate on first open
  }

  // Keep the briefing open alongside the SKU drawer — it slides left to make room.
  function handleOpenSku(code: string) {
    onOpenSku(code)
  }

  return (
    <section className="section" id="ai-briefing">
      <div className="shell">
        <Banner
          briefing={b}
          pending={gen.isPending}
          stale={stale}
          scenario={scenario}
          onOpen={openSheet}
        />
      </div>
      <BriefingSheet
        open={open}
        skuOpen={skuOpen}
        briefing={b}
        pending={gen.isPending}
        error={gen.isError}
        stale={stale}
        scenario={scenario}
        aiEnabled={aiEnabled}
        onRefresh={() => gen.mutate(true)}
        onClose={() => setOpen(false)}
        onOpenSku={handleOpenSku}
      />
    </section>
  )
}
