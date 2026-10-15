/**
 * Replica del titolare (regola 3): repliche già pubblicate, conto alla rovescia dei 7 giorni,
 * casella per pubblicarne una nuova. La finestra chiusa non impedisce la replica: lo stato resta confermato.
 */
import { useState, type FormEvent } from 'react'
import type { Reply, Report } from '../../domain/types'
import { replyHoursLeft } from '../../domain/stateMachine'
import { errorKeys, useStore } from '../../data/StoreContext'
import { useLang, useT } from '../../i18n'
import { fmtDate, fmtHours } from '../../lib/format'
import { ErrorBox, Notice } from '../ui'

interface Props {
  report: Report
  replies: Reply[]
  authorId: string
  nowIso: string
}

export function ReplyBox({ report, replies, authorId, nowIso }: Props) {
  const t = useT()
  const { lang } = useLang()
  const store = useStore()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(replies.length === 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string[] | null>(null)
  const hoursLeft = replyHoursLeft(report, nowIso)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await store.addReply(report.id, authorId, text)
      setText('')
      setOpen(false)
    } catch (ex) {
      setErr(errorKeys(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[var(--radius)] border border-line bg-accent-soft/40 p-3 grid gap-2" aria-label={t('manage.reply_title')}>
      <h4 className="text-sm font-bold">{t('manage.reply_title')}</h4>

      {report.state === 'risolta' ? (
        <Notice tone="ok">{t('manage.reply_resolved')}</Notice>
      ) : hoursLeft !== null && hoursLeft > 0 ? (
        <Notice tone="warn">
          <span className="tnum">{t('manage.reply_time_left', { time: fmtHours(hoursLeft, lang) })}</span>
        </Notice>
      ) : (
        <Notice tone="info">{t('manage.reply_window_closed')}</Notice>
      )}

      {replies.map((r) => (
        <div key={r.id} className="text-sm grid gap-0.5 rounded-[var(--radius)] bg-elev border border-line p-2.5">
          <div className="text-xs text-fg-muted tnum">{t('manage.reply_published_on', { date: fmtDate(r.createdAt, lang, true) })}</div>
          <p>{r.text}</p>
        </div>
      ))}

      {open ? (
        <form className="grid gap-2" onSubmit={submit}>
          <label htmlFor={`reply-${report.id}`} className="sr-only">
            {t('manage.reply_title')}
          </label>
          <textarea
            id={`reply-${report.id}`}
            className="textarea"
            placeholder={t('manage.reply_placeholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1200}
            required
          />
          {err && <ErrorBox keys={err} onClose={() => setErr(null)} />}
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
              {busy ? t('manage.reply_busy') : t('manage.reply_submit')}
            </button>
            {replies.length > 0 && (
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </button>
            )}
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-outline justify-self-start" onClick={() => setOpen(true)}>
          {t('manage.reply_add_another')}
        </button>
      )}
    </div>
  )
}
