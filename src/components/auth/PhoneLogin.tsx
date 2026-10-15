/** Accesso con numero di telefono e codice OTP. In demo il codice viene mostrato (in produzione arriva via SMS). */
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorKeys, useStore } from '../../data/StoreContext'
import { useT } from '../../i18n'
import { ErrorBox, Notice } from '../ui'

export function PhoneLogin() {
  const t = useT()
  const store = useStore()
  const nav = useNavigate()
  const [phone, setPhone] = useState('+39 ')
  const [stage, setStage] = useState<'phone' | 'code'>('phone')
  const [demoCode, setDemoCode] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string[] | null>(null)

  const sendCode = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const res = await store.requestOtp(phone)
      setDemoCode(res.demoCode ?? null)
      setStage('code')
    } catch (ex) {
      setErr(errorKeys(ex))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await store.verifyOtp(phone, code.trim(), name.trim() || undefined)
      nav('/profilo')
    } catch (ex) {
      setErr(errorKeys(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card card-pad grid gap-3">
      <h2 className="text-lg font-bold">{t('auth.phone.title')}</h2>

      {stage === 'phone' && (
        <form className="grid gap-3" onSubmit={sendCode}>
          <div className="field">
            <label htmlFor="login-phone">{t('auth.phone.label')}</label>
            <input
              id="login-phone"
              className="input tnum"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <p className="text-xs text-fg-muted">{t('auth.phone.hint')}</p>
          </div>
          {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t('auth.phone.sending') : t('auth.phone.send')}
          </button>
        </form>
      )}

      {stage === 'code' && (
        <form className="grid gap-3" onSubmit={verify}>
          {demoCode && (
            <Notice tone="warn">
              <span className="tnum">{t('auth.phone.demo_code', { code: demoCode })}</span>
            </Notice>
          )}
          <div className="field">
            <label htmlFor="login-code">{t('auth.phone.code_label')}</label>
            <input
              id="login-code"
              className="input tnum"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="login-name">
              {t('auth.phone.name_label')} <span className="font-normal">({t('common.optional')})</span>
            </label>
            <input id="login-name" className="input" type="text" autoComplete="nickname" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
            <p className="text-xs text-fg-muted">{t('auth.phone.name_hint')}</p>
          </div>
          {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}
          <div className="grid gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy || code.length < 4}>
              {busy ? t('auth.phone.verifying') : t('auth.phone.verify')}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={busy}
              onClick={() => {
                setStage('phone')
                setCode('')
                setDemoCode(null)
                setErr(null)
              }}
            >
              {t('auth.phone.change_number')}
            </button>
          </div>
        </form>
      )}

      <div className="border-t border-line pt-3 grid gap-2">
        <h3 className="font-semibold text-sm">{t('auth.spid.title')}</h3>
        <button type="button" className="btn btn-outline" disabled aria-describedby="spid-note">
          {t('auth.spid.button')}
        </button>
        <p id="spid-note" className="text-xs text-fg-muted">
          {t('auth.spid.unavailable')}
        </p>
      </div>
    </section>
  )
}
