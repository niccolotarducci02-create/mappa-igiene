/** Esegue un'azione sullo store tenendo traccia dell'attesa e delle RuleViolation da mostrare con <ErrorBox>. */
import { useCallback, useState } from 'react'
import { errorKeys } from '../../data/StoreContext'

export function useAsyncAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string[] | null>(null)

  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError(errorKeys(e))
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])
  return { run, busy, error, clearError }
}
