/**
 * Coda delle rivendicazioni nella demo: la richiesta non rende titolare, decide solo la moderazione,
 * e l'esito arriva al richiedente come notifica (stesse regole di claim_venue / decide_venue_claim in SQL).
 */
import { describe, expect, it } from 'vitest'
import { LocalStore } from './localStore'

const VENUE = 'v_duomo_caffe'

async function newUser(store: LocalStore, phone: string) {
  const { demoCode } = await store.requestOtp(phone)
  return store.verifyOtp(phone, demoCode!, 'Titolare test')
}

describe('LocalStore: rivendicazione moderata', () => {
  it('i titolari dei dati di partenza risultano da richieste approvate', async () => {
    const store = new LocalStore()
    const approved = await store.listVenueClaims({ status: ['approvata'] })
    expect(approved.map((c) => [c.venueId, c.userId]).sort()).toEqual([
      ['v_arnolfo', 'u_sara'],
      ['v_giglio', 'u_marco'],
    ])
    expect(await store.listVenueClaims({ status: ['in_verifica'] })).toEqual([])
  })

  it('la richiesta resta in verifica e non dà la titolarità; una seconda richiesta è rifiutata', async () => {
    const store = new LocalStore()
    const user = await newUser(store, '+39 333 111 2222')
    const { venue, claim } = await store.claimVenue(VENUE, user.id, { vat: 'IT 12345678901', phone: '+39 055 123456' })
    expect(claim.status).toBe('in_verifica')
    expect(claim.vat).toBe('IT12345678901')
    expect(venue.claimedBy).toBeUndefined()
    const profile = (await store.getSession())!
    expect(profile.role).toBe('utente')
    expect(profile.venueIds ?? []).not.toContain(VENUE)

    await expect(store.claimVenue(VENUE, user.id, { vat: '12345678901', phone: '' })).rejects.toMatchObject({ reasons: ['rule.claim_pending'] })
    // come in SQL, la partita IVA viene controllata prima della richiesta già in attesa
    await expect(store.claimVenue(VENUE, user.id, { vat: '123', phone: '' })).rejects.toMatchObject({ reasons: ['rule.invalid_vat'] })
    // la moderazione è stata avvisata
    const modNotif = await store.listNotifications('u_mod')
    expect(modNotif.some((n) => n.link === '/moderazione' && n.body.includes('12345678901'))).toBe(true)
    // la richiesta è visibile al richiedente e alla moderazione
    expect((await store.listVenueClaims({ userId: user.id, status: ['in_verifica'] })).map((c) => c.id)).toEqual([claim.id])
  })

  it('partita IVA non valida', async () => {
    const store = new LocalStore()
    const user = await newUser(store, '+39 333 111 3333')
    await expect(store.claimVenue(VENUE, user.id, { vat: '1234', phone: '' })).rejects.toMatchObject({ reasons: ['rule.invalid_vat'] })
  })

  it('solo la moderazione decide; approvare rende titolare e avvisa; non si decide due volte', async () => {
    const store = new LocalStore()
    const user = await newUser(store, '+39 333 111 4444')
    const { claim } = await store.claimVenue(VENUE, user.id, { vat: '12345678901', phone: '+39 055 1' })

    await expect(store.decideVenueClaim(claim.id, true, user.id)).rejects.toMatchObject({ reasons: ['rule.moderator_only'] })
    await expect(store.decideVenueClaim(claim.id, true, 'u_giulia')).rejects.toMatchObject({ reasons: ['rule.moderator_only'] })

    const decided = await store.decideVenueClaim(claim.id, true, 'u_mod')
    expect(decided.status).toBe('approvata')
    expect(decided.decidedBy).toBe('u_mod')
    expect(decided.decidedAt).toBeTruthy()
    const venue = (await store.getVenue(VENUE))!
    expect(venue.claimedBy).toBe(user.id)
    const profile = (await store.getSession())!
    expect(profile.role).toBe('locale')
    expect(profile.venueIds).toContain(VENUE)
    const notif = await store.listNotifications(user.id)
    expect(notif[0]).toMatchObject({ kind: 'generico', link: `/locale/${VENUE}/gestisci`, read: false })
    const audit = await store.listAudit(5)
    expect(audit[0]).toMatchObject({ actorId: 'u_mod', action: 'claim_venue_approved', targetId: VENUE })

    await expect(store.decideVenueClaim(claim.id, false, 'u_mod', 'x')).rejects.toMatchObject({ reasons: ['rule.already_decided'] })
    await expect(store.decideVenueClaim('claim_inesistente', true, 'u_mod')).rejects.toMatchObject({ reasons: ['rule.unknown_claim'] })
  })

  it('il rifiuto conserva il motivo, avvisa il richiedente e permette una nuova richiesta', async () => {
    const store = new LocalStore()
    const user = await newUser(store, '+39 333 111 5555')
    const { claim } = await store.claimVenue(VENUE, user.id, { vat: '12345678901', phone: '' })
    const decided = await store.decideVenueClaim(claim.id, false, 'u_mod', 'La partita IVA non corrisponde.')
    expect(decided.status).toBe('rifiutata')
    expect(decided.note).toBe('La partita IVA non corrisponde.')
    expect((await store.getVenue(VENUE))!.claimedBy).toBeUndefined()
    expect((await store.getSession())!.role).toBe('utente')
    const notif = await store.listNotifications(user.id)
    expect(notif[0].body).toContain('La partita IVA non corrisponde.')

    const again = await store.claimVenue(VENUE, user.id, { vat: '12345678901', phone: '' })
    expect(again.claim.status).toBe('in_verifica')
    expect(again.claim.id).not.toBe(claim.id)
  })

  it('un locale già di un altro titolare non si rivendica né si approva', async () => {
    const store = new LocalStore()
    const user = await newUser(store, '+39 333 111 6666')
    await expect(store.claimVenue('v_giglio', user.id, { vat: '12345678901', phone: '' })).rejects.toMatchObject({ reasons: ['rule.venue_already_claimed'] })
    // chi è già titolare non crea una nuova richiesta
    const marco = await store.claimVenue('v_giglio', 'u_marco', { vat: '01234567890', phone: '' })
    expect(marco.claim.status).toBe('approvata')
    expect(await store.listVenueClaims({ status: ['in_verifica'] })).toEqual([])
  })
})
