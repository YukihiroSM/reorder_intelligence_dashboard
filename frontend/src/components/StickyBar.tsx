import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, History, Settings, X } from 'lucide-react'

import { createScenario, deleteScenario, updateConfig } from '../api/api'
import { useConfig, useScenarios } from '../hooks'
import {
  DEFAULT_SCENARIO,
  FORECAST_WINDOWS,
  GROWTH_TICKS,
  LEAD_BUFFERS,
} from '../lib/constants'
import type { Scenario, ScenarioSaved } from '../types'

const GROWTH_MIN = -20
const GROWTH_MAX = 100

function deltaCls(v: number): string {
  if (v === 0) return ''
  return v > 0 ? 'delta-up' : 'delta-dn'
}

function Stepper({
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const clamp = (v: number) => +Math.min(max, Math.max(min, v)).toFixed(2)
  return (
    <span className="stepper">
      <button onClick={() => onChange(clamp(value - step))} disabled={disabled || value <= min} aria-label="decrease">
        −
      </button>
      <span className="stepper-val">{value.toFixed(2)}×</span>
      <button onClick={() => onChange(clamp(value + step))} disabled={disabled || value >= max} aria-label="increase">
        +
      </button>
    </span>
  )
}

export function StickyBar({
  scenario,
  setScenario,
  dataDate,
}: {
  scenario: Scenario
  setScenario: (s: Scenario) => void
  dataDate: string | null
}) {
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState<'history' | 'settings' | null>(null)
  const qc = useQueryClient()
  const scenarios = useScenarios()
  const config = useConfig()

  // Health thresholds live in app_config (not the scenario query overrides), so a
  // change must refetch every metric view to recompute statuses.
  const updateMut = useMutation({
    mutationFn: updateConfig,
    onSuccess: () => {
      for (const key of ['config', 'skus', 'skus-page', 'sku']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
  const crit = config.data?.critical_multiplier ?? 1
  const low = config.data?.low_multiplier ?? 1.5

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.brand-meta')) setMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menu])

  const saveMut = useMutation({
    mutationFn: createScenario,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }),
  })
  const deleteMut = useMutation({
    mutationFn: deleteScenario,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }),
  })

  function onSave() {
    const name = window.prompt('Name this scenario:')
    if (!name?.trim()) return
    saveMut.mutate({
      name: name.trim(),
      growth_pct: scenario.growth,
      shipping_buffer_days: scenario.leadBuffer,
      forecast_window_days: scenario.forecastDays,
    })
  }

  function loadSaved(s: ScenarioSaved) {
    setScenario({
      growth: s.growth_pct,
      leadBuffer: s.shipping_buffer_days,
      forecastDays: s.forecast_window_days,
    })
    setMenu(null)
  }

  const saved = scenarios.data ?? []

  return (
    <header className={`sticky-bar ${scrolled ? 'scrolled' : ''}`}>
      <div className="shell sticky-inner">
        <div className="sticky-row1">
          <div className="brand">
            <div className="brand-mark">R</div>
            <div>
              <div className="brand-title">Reorder Intelligence</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                GLOW Supplements · operations
              </div>
            </div>
          </div>
          <div className="brand-meta" style={{ position: 'relative' }}>
            <span className="data-badge">
              <span className="dot" />
              Data as of {dataDate ?? '—'}
            </span>
            <div style={{ position: 'relative' }}>
              <button
                className={`icon-btn ${menu === 'history' ? 'active' : ''}`}
                onClick={() => setMenu((m) => (m === 'history' ? null : 'history'))}
              >
                <History size={13} /> History
              </button>
              {menu === 'history' && (
                <div className="bar-menu">
                  <div className="bar-menu-head">Saved scenarios</div>
                  {saved.length === 0 && (
                    <div className="bar-menu-row">
                      <div className="bar-menu-row-sub" style={{ fontFamily: 'var(--font-sans)' }}>
                        None yet — tune the controls and hit “Save scenario”.
                      </div>
                    </div>
                  )}
                  {saved.map((s) => (
                    <div className="bar-menu-row" key={s.id}>
                      <div>
                        <div className="bar-menu-row-title">{s.name}</div>
                        <div className="bar-menu-row-sub">
                          {s.growth_pct > 0 ? '+' : ''}
                          {s.growth_pct}% · {s.shipping_buffer_days}d buf · {s.forecast_window_days}d
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="bar-menu-link" onClick={() => loadSaved(s)}>
                          load
                        </button>
                        <button
                          className="bar-menu-link"
                          style={{ color: 'var(--text-tertiary)' }}
                          onClick={() => deleteMut.mutate(s.id)}
                          aria-label={`delete ${s.name}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="bar-menu-divider" />
                  <div className="bar-menu-head">Recent syncs</div>
                  <div className="bar-menu-row">
                    <div>
                      <div className="bar-menu-row-title">Inventory snapshot</div>
                      <div className="bar-menu-row-sub">{dataDate} · live</div>
                    </div>
                    <span className="bar-menu-tag ok">live</span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button
                className={`icon-btn ${menu === 'settings' ? 'active' : ''}`}
                onClick={() => setMenu((m) => (m === 'settings' ? null : 'settings'))}
              >
                <Settings size={13} /> Settings
              </button>
              {menu === 'settings' && (
                <div className="bar-menu">
                  <div
                    className="bar-menu-head"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span>Stock-health thresholds</span>
                    {(crit !== 1 || low !== 1.5) && (
                      <button
                        className="bar-menu-link"
                        onClick={() =>
                          updateMut.mutate({ critical_multiplier: 1, low_multiplier: 1.5 })
                        }
                      >
                        reset
                      </button>
                    )}
                  </div>
                  <div className="bar-menu-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="bar-menu-row-title">Critical</div>
                      <div className="bar-menu-row-sub">days &lt; lead × {crit.toFixed(2)}</div>
                    </div>
                    <Stepper
                      value={crit}
                      min={0.5}
                      max={low}
                      step={0.25}
                      disabled={config.isPending || updateMut.isPending}
                      onChange={(v) => updateMut.mutate({ critical_multiplier: v })}
                    />
                  </div>
                  <div className="bar-menu-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="bar-menu-row-title">Low</div>
                      <div className="bar-menu-row-sub">days &lt; lead × {low.toFixed(2)}</div>
                    </div>
                    <Stepper
                      value={low}
                      min={crit}
                      max={4}
                      step={0.25}
                      disabled={config.isPending || updateMut.isPending}
                      onChange={(v) => updateMut.mutate({ low_multiplier: v })}
                    />
                  </div>
                  <div className="bar-menu-divider" />
                  <div className="bar-menu-row">
                    <div className="bar-menu-row-sub" style={{ fontFamily: 'var(--font-sans)' }}>
                      Applies live to every SKU's status. Currency is USD for this dataset.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="scenario-bar" role="group" aria-label="Scenario controls">
          <div className="scenario-field">
            <div className="scenario-label">
              <span>Demand growth</span>
              <span className={`v ${deltaCls(scenario.growth)}`}>
                {scenario.growth > 0 ? '+' : ''}
                {scenario.growth}%
              </span>
            </div>
            <input
              type="range"
              min={GROWTH_MIN}
              max={GROWTH_MAX}
              step={5}
              value={scenario.growth}
              onChange={(e) => setScenario({ ...scenario, growth: parseInt(e.target.value, 10) })}
              className="slider"
              aria-label="Demand growth percent"
            />
            <div className="tick-row" style={{ position: 'relative', height: 14 }}>
              {GROWTH_TICKS.map((t) => {
                const frac = (t - GROWTH_MIN) / (GROWTH_MAX - GROWTH_MIN)
                return (
                  <button
                    key={t}
                    onClick={() => setScenario({ ...scenario, growth: t })}
                    style={{
                      position: 'absolute',
                      left: `calc(7px + (100% - 14px) * ${frac})`,
                      transform: 'translateX(-50%)',
                      background: 'transparent',
                      border: 'none',
                      padding: '0 2px',
                      color: scenario.growth === t ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      fontWeight: scenario.growth === t ? 600 : 400,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t > 0 ? `+${t}` : t}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="scenario-field">
            <div className="scenario-label">
              <span>Lead time buffer</span>
              <span className="v">{scenario.leadBuffer}d</span>
            </div>
            <div className="scenario-segment">
              {LEAD_BUFFERS.map((o) => (
                <button
                  key={o}
                  className={scenario.leadBuffer === o ? 'active' : ''}
                  onClick={() => setScenario({ ...scenario, leadBuffer: o })}
                >
                  {o}d
                </button>
              ))}
            </div>
          </div>

          <div className="scenario-field">
            <div className="scenario-label">
              <span>Forecast window</span>
              <span className="v">{scenario.forecastDays}d</span>
            </div>
            <div className="scenario-segment">
              {FORECAST_WINDOWS.map((o) => (
                <button
                  key={o}
                  className={scenario.forecastDays === o ? 'active' : ''}
                  onClick={() => setScenario({ ...scenario, forecastDays: o })}
                >
                  {o}d
                </button>
              ))}
            </div>
          </div>

          <div className="scenario-actions">
            <button className="btn btn-ghost" onClick={() => setScenario(DEFAULT_SCENARIO)}>
              Reset
            </button>
            <button className="btn" onClick={onSave} disabled={saveMut.isPending}>
              <Download size={12} strokeWidth={2.2} /> Save scenario
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
