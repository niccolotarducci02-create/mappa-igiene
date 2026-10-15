/** Badge di verifica dell'identità: telefono verificato e/o SPID/CIE. */
import type { Profile } from '../../domain/types'
import { useT } from '../../i18n'

export function VerificationBadges({ profile }: { profile: Profile }) {
  const t = useT()
  const badges: string[] = []
  if (profile.phoneVerified) badges.push(t('auth.verified.phone'))
  if (profile.spidVerified) badges.push(t('auth.verified.spid'))
  if (!badges.length) badges.push(t('auth.verified.none'))
  return (
    <ul className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <li key={b} className={`chip ${profile.phoneVerified || profile.spidVerified ? 'chip-risolta' : 'chip-nessuna'}`}>
          {b}
        </li>
      ))}
    </ul>
  )
}
