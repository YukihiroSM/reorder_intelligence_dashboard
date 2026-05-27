import { useEffect } from 'react'

// Shared body scroll-lock. A plain save/restore-`prev` per component leaks when two
// overlays (the SKU drawer + the AI briefing sheet) are open at once: whoever closes
// last restores a stale `hidden`. A reference count fixes it — the body only unlocks
// once every locker has released.
let locks = 0

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    locks += 1
    document.body.style.overflow = 'hidden'
    return () => {
      locks = Math.max(0, locks - 1)
      if (locks === 0) document.body.style.overflow = ''
    }
  }, [active])
}
