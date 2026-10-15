import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { EmptyState } from '../components/ui'

export default function NotFoundPage() {
  const t = useT()
  return (
    <div className="gutter py-10">
      <EmptyState title={t('common.not_found')} action={<Link className="btn btn-primary" to="/">{t('nav.map')}</Link>} />
    </div>
  )
}
