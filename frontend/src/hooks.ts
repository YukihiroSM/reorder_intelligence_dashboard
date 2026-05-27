import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import {
  getAIStatus,
  getConfig,
  getHealth,
  getSKU,
  getSKUs,
  getSKUsPage,
  getScenarios,
} from './api/api'
import type { Scenario, SKUTableQuery } from './types'

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

// Paginated, infinite-scroll table data. Stops when all matching rows are loaded.
export function useInfiniteSKUs(scenario: Scenario, q: SKUTableQuery) {
  return useInfiniteQuery({
    queryKey: ['skus-page', scenario, q],
    queryFn: ({ pageParam }) => getSKUsPage(scenario, q, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    placeholderData: (prev) => prev,
  })
}

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: getConfig })
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: getHealth })
}

export function useScenarios() {
  return useQuery({ queryKey: ['scenarios'], queryFn: getScenarios })
}

// Whether a live LLM is configured (so the UI can label fallback mode). Rarely
// changes, so cache it for the session.
export function useAIStatus() {
  return useQuery({ queryKey: ['ai-status'], queryFn: getAIStatus, staleTime: Infinity })
}
