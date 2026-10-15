/** Ripristino dei dati demo con conferma in linea (niente confirm()). */
import { useState } from 'react'
import { errorKeys, useStore } from '../../data/StoreContext'
import { useT } from '../../i18n'
import { ErrorBox, Notice } from '../ui'

export function ResetDemo() {
  const t = useT()
  const store = useStore()
  const [stage, setStage] = useState<'idle' | 'confirm' | 'working' | 'done'>('idle')
  const [err, setErr] = useState<string[] | null>(null)

  const run = async () => {
    setStage('working')
    setErr(null)
    try {
      await store.resetDemo()
      setStage('done')
    } catch (ex) {
      setErr(errorKeys(ex))
      setStage('idle')
    }
  }

  return (
    <section className="card card-pad grid gap-2">
      <h2 className="font-semibold text-sm">{t('auth.reset.title')}</h2>
      {stage === 'idle' && (
        <button type="button" className="btn btn-outline btn-sm justify-self-start" onClick={() => setStage('confirm')}>
          {t('auth.reset.button')}
        </button>
      )}
      {stage === 'confirm' && (
        <div className="grid gap-2">
          <p className="text-sm text-fg-muted">{t('auth.reset.confirm_body')}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-danger btn-sm" onClick={run}>
              {t('auth.reset.confirm')}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setStage('idle')}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      {stage === 'working' && <p className="text-sm text-fg-muted">{t('auth.reset.working')}</p>}
      {stage === 'done' && (
        <div className="grid gap-2">
          <Notice tone="ok" live>
            {t('demo.reset_done')}
          </Notice>
          <button type="button" className="btn btn-outline btn-sm justify-self-start" onClick={() => setStage('idle')}>
            {t('common.close')}
          </button>
        </div>
      )}
      {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}
    </section>
  )
}
