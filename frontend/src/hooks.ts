import { useQuery } from '@tanstack/react-query'

import { getConfig, getHealth, getSKU, getSKUs } from './api/api'
import type { Scenario } from './types'

// Scenario params live in the query key, so moving a slider refetches cleanly.
export function useSKUs(scenario: Scenario) {
  return useQuery({
    queryKey: ['skus', scenario],
    queryFn: () => getSKUs(scenario),
    placeholderData: (prev) => prev, // keep old rows visible while refetching
  })
}

export function useSKU(code: string | null, scenario: Scenario) {
  return useQuery({
    queryKey: ['sku', code, scenario],
    queryFn: () => getSKU(code as string, scenario),
    enabled: !!code,
  })
}

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: getConfig })
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: getHealth })
}
