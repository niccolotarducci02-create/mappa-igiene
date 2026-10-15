import { describe, expect, it } from 'vitest'
import {
  applyAiCheck,
  buyLead,
  canBuyLead,
  canSubmitReport,
  deriveVenueStatus,
  isDefinitive,
  moderate,
  newLeadFromReport,
  priceForCompany,
  removeReport,
  resolveWithCertificate,
  RuleViolation,
  sortQuotesForVenue,
} from './stateMachine'
import type { Company, Profile, Report, Venue } from './types'
import { LEAD_MAX_BUYERS, LEAD_PRICE_CENTS, MAX_REPORTS_PER_MONTH } from './rules'

const now = '2026-10-15T10:00:00.000Z'
const venue: Venue = { id: 'v1', name: 'Trattoria Demo', type: 'trattoria', address: 'Via Demo 1', lat: 43.7711, lng: 11.2556, status: 'nessuna', createdAt: now }
const user: Profile = { id: 'u1', displayName: 'Giulia', role: 'utente', phoneVerified: true, spidVerified: false, createdAt: now }
const moderator: Profile = { id: 'm1', displayName: 'Mod', role: 'moderatore', phoneVerified: true, spidVerified: true, createdAt: now }
const company: Company = { id: 'c1', name: 'Ditta Uno', vat: '1', zones: [], services: ['blatte'], ownerUserId: 'd1', sameConditionsAck: true }
const founder: Company = { ...company, id: 'c0', name: 'Ditta del fondatore', isFounderCompany: true }

function baseReport(over: Partial<Report> = {}): Report {
  return {
    id: 'r1', venueId: 'v1', userId: 'u1', source: 'utente', category: 'blatte', description: 'x', photo: 'data:', photoHash: 'h',
    captureMode: 'fotocamera', capturedAt: now, lat: 43.7711, lng: 11.2556, distanceM: 0, state: 'in_verifica', submittedAt: now,
    facesBlurred: true, ...over,
  }
}

const ctx = { profile: user, venue, reportsThisMonth: 0, nowIso: now, enforceCamera: true, deviceBlocked: false, consentAccepted: true, captureMode: 'fotocamera' as const, capturedAt: now, lat: 43.7711, lng: 11.2556 }

describe('canSubmitReport', () => {
  it('accepts a verified user next to the venue with a fresh in-app photo', () => {
    expect(canSubmitReport(ctx).ok).toBe(true)
  })
  it(`refuses the ${MAX_REPORTS_PER_MONTH + 1}th report of the month`, () => {
    const r = canSubmitReport({ ...ctx, reportsThisMonth: MAX_REPORTS_PER_MONTH })
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('rule.max_reports')
  })
  it('refuses gallery photos in production', () => {
    expect(canSubmitReport({ ...ctx, captureMode: 'file_demo' }).reasons).toContain('rule.camera_only')
    expect(canSubmitReport({ ...ctx, captureMode: 'file_demo', enforceCamera: false }).ok).toBe(true)
  })
  it('refuses unverified users and far-away positions', () => {
    expect(canSubmitReport({ ...ctx, profile: { ...user, phoneVerified: false } }).reasons).toContain('rule.verified_user_required')
    expect(canSubmitReport({ ...ctx, lat: 43.80 }).reasons).toContain('rule.too_far')
  })
  it('refuses photos older than the capture window', () => {
    expect(canSubmitReport({ ...ctx, capturedAt: '2026-10-15T08:00:00.000Z' }).reasons).toContain('rule.capture_too_old')
  })
})

describe('AI check + moderation', () => {
  it('discards incoherent photos and keeps uncertain ones for a human', () => {
    const check = { verdict: 'non_coerente' as const, score: 0.1, reasons: [], simulated: true, checkedAt: now }
    expect(applyAiCheck(baseReport(), check).state).toBe('scartata')
    expect(applyAiCheck(baseReport(), { ...check, verdict: 'incerta', score: 0.4 }).state).toBe('in_verifica')
  })
  it('publishes with a 7-day reply window', () => {
    const r = moderate(baseReport(), 'conferma', 'm1', now)
    expect(r.state).toBe('pubblicata')
    expect(r.replyDeadlineAt).toBe('2026-10-22T10:00:00.000Z')
    expect(isDefinitive(r, '2026-10-22T10:00:01.000Z')).toBe(true)
    expect(isDefinitive(r, '2026-10-20T10:00:00.000Z')).toBe(false)
  })
  it('refuses to publish a photo whose faces are not blurred', () => {
    expect(() => moderate(baseReport({ facesBlurred: false }), 'conferma', 'm1', now)).toThrow(RuleViolation)
  })
  it('archives without publishing', () => {
    expect(moderate(baseReport(), 'archivia', 'm1', now).state).toBe('archiviata')
  })
})

describe('removal (rule 4)', () => {
  const published = moderate(baseReport(), 'conferma', 'm1', now)
  it('only moderators remove, and only for a listed reason', () => {
    expect(() => removeReport(published, 'prova_insufficiente', user, now)).toThrow(RuleViolation)
    expect(() => removeReport(published, 'pagamento', moderator, now)).toThrow(RuleViolation)
    expect(removeReport(published, 'prova_insufficiente', moderator, now).state).toBe('rimossa')
  })
})

describe('leads (same conditions for everyone)', () => {
  const published = moderate(baseReport(), 'conferma', 'm1', now)
  const lead = newLeadFromReport(published, 'Centro storico', now, 'l1')
  it('charges the founder company exactly the same price', () => {
    expect(priceForCompany(lead, founder)).toBe(LEAD_PRICE_CENTS)
    expect(priceForCompany(lead, company)).toBe(LEAD_PRICE_CENTS)
  })
  it(`sells to at most ${LEAD_MAX_BUYERS} companies, once each`, () => {
    let l = buyLead(lead, company, now)
    expect(canBuyLead(l, company).reasons).toContain('rule.lead_already_bought')
    l = buyLead(l, { ...company, id: 'c2' }, now)
    l = buyLead(l, { ...company, id: 'c3' }, now)
    expect(l.status).toBe('completo')
    expect(canBuyLead(l, { ...company, id: 'c4' }).ok).toBe(false)
  })
  it('requires the explicit same-conditions acknowledgement', () => {
    expect(canBuyLead(lead, { ...company, sameConditionsAck: false }).reasons).toContain('rule.same_conditions_ack')
  })
  it('cannot be created from an unpublished report', () => {
    expect(() => newLeadFromReport(baseReport(), 'z', now, 'l2')).toThrow(RuleViolation)
  })
})

describe('quotes ordering', () => {
  const sponsor: Company = { ...company, id: 'c_sp', sponsorUntil: '2027-01-01T00:00:00.000Z' }
  const founderSponsor: Company = { ...founder, sponsorUntil: '2027-01-01T00:00:00.000Z' }
  const quotes = [
    { id: 'q1', companyId: 'c1', createdAt: '2026-10-15T10:00:00.000Z' },
    { id: 'q2', companyId: 'c_sp', createdAt: '2026-10-15T11:00:00.000Z' },
    { id: 'q3', companyId: 'c0', createdAt: '2026-10-15T09:00:00.000Z' },
  ]
  it('puts active sponsors first, then arrival order; the founder never gets priority', () => {
    const sorted = sortQuotesForVenue(quotes, [company, sponsor, founderSponsor], now)
    expect(sorted.map((q) => q.id)).toEqual(['q2', 'q3', 'q1'])
  })
  it('an expired sponsorship gives no priority', () => {
    const expired: Company = { ...sponsor, sponsorUntil: '2026-01-01T00:00:00.000Z' }
    const sorted = sortQuotesForVenue(quotes, [company, expired, founder], now)
    expect(sorted.map((q) => q.id)).toEqual(['q3', 'q1', 'q2'])
  })
})

describe('venue status', () => {
  it('confirmed beats verifying beats resolved beats none', () => {
    const pub = moderate(baseReport(), 'conferma', 'm1', now)
    expect(deriveVenueStatus([])).toBe('nessuna')
    expect(deriveVenueStatus([baseReport()])).toBe('in_verifica')
    expect(deriveVenueStatus([baseReport(), pub])).toBe('confermata')
    expect(deriveVenueStatus([resolveWithCertificate(pub, now)])).toBe('risolta')
    expect(deriveVenueStatus([resolveWithCertificate(pub, now), baseReport({ state: 'archiviata' })])).toBe('risolta')
  })
})
