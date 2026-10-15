/** Passo 3: categoria (schede radio) e descrizione dei fatti, massimo 300 caratteri. */
import type { ReportCategory } from '../../domain/types'
import { REPORT_CATEGORIES } from '../../domain/rules'
import { useT } from '../../i18n'
import { Notice } from '../ui'
import { DESCRIPTION_MAX } from './types'

interface Props {
  category: ReportCategory | null
  description: string
  onCategory: (c: ReportCategory) => void
  onDescription: (d: string) => void
}

export function StepDetails({ category, description, onCategory, onDescription }: Props) {
  const t = useT()
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2 min-w-0">
        <legend className="text-base font-bold mb-2">{t('report.what.category')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {REPORT_CATEGORIES.map((c) => {
            const active = category === c
            return (
              <label
                key={c}
                className={`card p-3 cursor-pointer grid gap-1 min-h-[44px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-offset-2 ${active ? 'border-accent bg-accent-soft' : 'hover:bg-muted'}`}
              >
                <input type="radio" name="category" value={c} checked={active} onChange={() => onCategory(c)} className="sr-only" />
                <span className="font-semibold text-sm leading-tight">{t(`category.${c}`)}</span>
                <span className="text-xs text-fg-muted leading-snug">{t(`report.what.helper.${c}`)}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="report-description">{t('report.what.description')}</label>
        <textarea
          id="report-description"
          className="textarea"
          maxLength={DESCRIPTION_MAX}
          placeholder={t('report.what.placeholder')}
          value={description}
          onChange={(e) => onDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
        />
        <div className="text-xs text-fg-muted text-right tnum" aria-live="polite">
          {t('report.what.chars', { n: description.length, m: DESCRIPTION_MAX })}
        </div>
      </div>

      <Notice tone="info">{t('report.what.facts_reminder')}</Notice>
    </div>
  )
}
