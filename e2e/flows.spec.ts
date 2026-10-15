import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Flussi end-to-end sulla build di produzione (vite preview) in modalità demo, viewport mobile (Pixel 7).
 * Ogni test riparte dai dati demo puliti (localStorage azzerato + ricarica) ed entra con un personaggio demo.
 * Fotocamera e GPS non esistono in Chromium headless: si usa il ripiego "file" (foto generata con un canvas)
 * e la posizione simulata (coordinate del locale), esattamente come nella demo pubblicata.
 */

/** Chiavi i18n grezze: non devono mai comparire nel testo visibile. */
const RAW_I18N_KEY = /\b(how|nav|lang|mod|profile|rules|terms|privacy|dsa|app|report|venue|company|legal|auth|transparency|manage|nas|common|status|rule|category|role|map|moderation)\.[a-z]+(_[a-z]+)*(\.[a-z0-9_]+)*\b/

async function resetDemo(page: Page): Promise<void> {
  await page.goto('/#/accedi')
  await expect(page.locator('#root')).not.toBeEmpty()
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Entra come' })).toBeVisible()
}

/** "Entra come" un personaggio demo da #/accedi; attende l'uscita dalla pagina di accesso. */
async function signInAs(page: Page, persona: RegExp): Promise<void> {
  await page.goto('/#/accedi')
  await expect(page.getByRole('heading', { name: 'Entra come' })).toBeVisible()
  await page.getByRole('button', { name: persona }).click()
  await expect(page.getByRole('heading', { name: 'Entra come' })).toBeHidden()
}

/**
 * Accesso con numero di telefono e codice OTP: nella demo il codice compare in pagina.
 * Se un profilo è già attivo, prima esce (il modulo OTP compare solo senza sessione).
 */
async function signInWithPhone(page: Page, phone: string, name?: string): Promise<void> {
  await page.goto('/#/accedi')
  await expect(page.locator('#root')).not.toBeEmpty()
  const logout = page.getByRole('button', { name: 'Esci' })
  if (await logout.isVisible()) {
    await logout.click()
    await page.goto('/#/accedi')
  }
  await page.getByLabel('Numero di telefono').fill(phone)
  await page.getByRole('button', { name: 'Invia codice' }).click()
  const notice = page.getByText(/Codice demo: \d{6}/)
  await expect(notice).toBeVisible()
  const code = /Codice demo: (\d{6})/.exec(await notice.innerText())![1]
  await page.getByLabel('Codice ricevuto').fill(code)
  if (name) await page.getByLabel(/Come vuoi chiamarti/).fill(name)
  await page.getByRole('button', { name: 'Verifica', exact: true }).click()
  await page.waitForURL(/profilo/)
}

/** Foto JPEG 640x480 generata con un canvas: colorata e contrastata, così il filtro demo la giudica coerente. */
async function makeJpeg(page: Page, seed: number): Promise<Buffer> {
  const dataUrl = await page.evaluate((s) => {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 480
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 640, 480)
    g.addColorStop(0, `hsl(${(s * 47) % 360} 70% 45%)`)
    g.addColorStop(1, `hsl(${(s * 47 + 150) % 360} 60% 25%)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 640, 480)
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `hsl(${(s * 31 + i * 23) % 360} 80% ${30 + ((i * 7) % 50)}%)`
      ctx.fillRect((i * 97 + s * 13) % 600, (i * 53 + s * 7) % 440, 60, 40)
    }
    ctx.fillStyle = '#fff'
    ctx.font = '28px sans-serif'
    ctx.fillText(`e2e ${s}`, 40, 60)
    return c.toDataURL('image/jpeg', 0.9)
  }, seed)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/** Piccolo PNG (certificato di prova). */
async function makePng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 320
    c.height = 200
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#f4f4f0'
    ctx.fillRect(0, 0, 320, 200)
    ctx.fillStyle = '#222'
    ctx.font = '20px sans-serif'
    ctx.fillText('Certificato di intervento (demo)', 16, 100)
    return c.toDataURL('image/png')
  })
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

/**
 * Percorre il flusso #/segnala/:venueId fino alla schermata di esito e restituisce il verdetto del filtro.
 * Ricarica la pagina all'ingresso, così lo stato del flusso precedente non resta in memoria.
 */
async function submitReport(page: Page, venueId: string, seed: number, description: string): Promise<string> {
  await page.goto(`/#/segnala/${venueId}`)
  await page.reload()
  const next = page.getByRole('button', { name: 'Avanti' })

  // 1. locale preselezionato dalla rotta
  await expect(page.getByText('Locale scelto dalla scheda')).toBeVisible()
  await expect(next).toBeEnabled()
  await next.click()

  // 2. foto: la fotocamera non c'è, compare il ripiego con <input type="file">
  await expect(page.getByText('Passo 2 di 5')).toBeVisible()
  const fileInput = page.locator('input[type="file"]')
  await expect(fileInput).toBeAttached({ timeout: 15_000 })
  await fileInput.setInputFiles({ name: `foto-${seed}.jpg`, mimeType: 'image/jpeg', buffer: await makeJpeg(page, seed) })
  await expect(page.getByRole('button', { name: 'Rifai la foto' })).toBeVisible()
  await expect(next).toBeEnabled()
  await next.click()

  // 3. categoria e descrizione
  await expect(page.getByText('Passo 3 di 5')).toBeVisible()
  await page.getByText('Blatte', { exact: true }).click()
  await page.getByLabel('Descrizione').fill(description)
  await expect(next).toBeEnabled()
  await next.click()

  // 4. posizione: senza GPS, in demo, coordinate del locale (dichiarate simulate)
  await expect(page.getByText('Passo 4 di 5')).toBeVisible()
  await expect(page.getByText('Simulata (coordinate del locale)')).toBeVisible({ timeout: 15_000 })
  await expect(next).toBeEnabled()
  await next.click()

  // 5. regole, consenso, invio
  await expect(page.getByText('Passo 5 di 5')).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Invia la segnalazione' }).click()

  await expect(page.getByText('Esito del filtro automatico')).toBeVisible()
  return (await page.getByTestId('ai-verdict').innerText()).trim()
}

function ownerReport(page: Page, reportId: string): Locator {
  return page.locator(`[data-testid="owner-report"][data-report-id="${reportId}"]`)
}

test.describe('Flussi demo', () => {
  test('1. Cliente segnala: Giulia invia una segnalazione con foto caricata e posizione simulata', async ({ page }) => {
    await resetDemo(page)
    await signInAs(page, /Giulia/)

    const description = 'Due blatte vive sotto il bancone, vicino alla macchina del caffè (test e2e).'
    const verdict = await submitReport(page, 'v_arnolfo', 1, description)
    expect(verdict).toMatch(/^(Coerente|Incerta)/)

    // esito: verdetto, punteggio, nota "simulato", stato in verifica
    await expect(page.getByText('Verdetto')).toBeVisible()
    await expect(page.getByText(/Punteggio|Score/)).toBeVisible()
    await expect(page.getByText('In verifica', { exact: true })).toBeVisible()
    await expect(page.getByText('Grazie. Un moderatore la verifica entro 24 ore.')).toBeVisible()

    // il profilo elenca la nuova segnalazione come "In verifica"
    await page.goto('/#/profilo')
    const card = page.getByTestId('profile-report').filter({ hasText: description })
    await expect(card).toHaveCount(1)
    await expect(card.getByText('Bar Arnolfo')).toBeVisible()
    await expect(card.getByText('In verifica', { exact: true })).toBeVisible()
    await expect(card.getByText(/foto caricata \(demo\)/)).toBeVisible()
  })

  test('2. Moderazione: Chiara controlla i volti, conferma e pubblica; la scheda mostra il conto alla rovescia', async ({ page }) => {
    await resetDemo(page)
    await signInAs(page, /Chiara/)
    await page.waitForURL(/moderazione/)

    const item = page.locator('[data-testid="queue-item"][data-report-id="r_arnolfo_1"]')
    await expect(item).toBeVisible()
    await expect(item.getByRole('link', { name: 'Bar Arnolfo' })).toBeVisible()
    // senza controllo dei volti non si pubblica (rule.blur_required)
    await expect(item.getByRole('button', { name: 'Conferma e pubblica' })).toBeDisabled()

    await item.getByRole('button', { name: 'Nessun volto visibile' }).click()
    await expect(item.getByText('Volti controllati')).toBeVisible()
    await item.getByRole('button', { name: 'Conferma e pubblica' }).click()
    await expect(item).toHaveCount(0)

    await page.goto('/#/locale/v_arnolfo')
    await expect(page.getByTestId('venue-status')).toHaveText('Confermata')
    const report = page.locator('[data-testid="venue-report"][data-report-id="r_arnolfo_1"]')
    await expect(report).toBeVisible()
    await expect(report.getByText('Pubblicata (confermata)')).toBeVisible()
    await expect(report.getByText(/Il locale può ancora rispondere: (6 giorni|\d+ ore)/)).toBeVisible()
  })

  test('3. Titolare replica e chiede preventivi: Marco sulla Trattoria del Giglio', async ({ page }) => {
    await resetDemo(page)
    await signInAs(page, /Marco/)
    await page.goto('/#/locale/v_giglio/gestisci')

    const card = ownerReport(page, 'r_giglio_1')
    await expect(card).toBeVisible()

    // una replica c'è già nei dati demo: la casella è chiusa, si riapre
    const addAnother = card.getByRole('button', { name: "Aggiungi un'altra replica" })
    if (await addAnother.isVisible()) await addAnother.click()
    const text = 'Replica di prova e2e: intervento programmato per domani mattina, certificato a seguire.'
    await card.getByRole('textbox', { name: 'La tua replica' }).fill(text)
    await card.getByRole('button', { name: 'Pubblica la replica' }).click()
    await expect(card.getByText(text)).toBeVisible()
    await expect(card.getByRole('textbox', { name: 'La tua replica' })).toHaveCount(0)

    // preventivi: la richiesta è idempotente (nei dati demo il contatto esiste già e il pulsante non compare)
    const request = card.getByRole('button', { name: 'Chiedi preventivi alle ditte partner' })
    if (await request.isVisible()) await request.click()
    await expect(card.getByTestId('lead-status')).toHaveText(/Contatto inviato: \d ditte su 3 lo hanno acquistato/)
    await expect(card.locator('li').filter({ hasText: 'Disinfesta Toscana Srl' }).filter({ hasText: /280\s€/ })).toHaveCount(1)

    // la replica è pubblica, accanto alla segnalazione
    await page.goto('/#/locale/v_giglio')
    const pub = page.locator('[data-testid="venue-report"][data-report-id="r_giglio_1"]')
    await expect(pub.getByText(text)).toBeVisible()
  })

  test('3b. Titolare chiede preventivi su una segnalazione appena pubblicata (Sara, Bar Arnolfo)', async ({ page }) => {
    await resetDemo(page)
    await signInAs(page, /Chiara/)
    const item = page.locator('[data-testid="queue-item"][data-report-id="r_arnolfo_1"]')
    await item.getByRole('button', { name: 'Nessun volto visibile' }).click()
    await item.getByRole('button', { name: 'Conferma e pubblica' }).click()
    await expect(item).toHaveCount(0)

    await signInAs(page, /Sara/)
    await page.waitForURL(/locale\/v_arnolfo\/gestisci/)
    const card = ownerReport(page, 'r_arnolfo_1')
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'Chiedi preventivi alle ditte partner' }).click()
    await expect(card.getByTestId('lead-status')).toHaveText('Contatto inviato: 0 ditte su 3 lo hanno acquistato')
    await expect(card.getByRole('button', { name: 'Chiedi preventivi alle ditte partner' })).toHaveCount(0)

    // ricaricando resta un solo contatto (idempotenza)
    await page.reload()
    await expect(ownerReport(page, 'r_arnolfo_1').getByTestId('lead-status')).toHaveText(/0 ditte su 3/)
  })

  test('4. Ditta acquista e preventiva: Elena compra il contatto a 30 €, il fondatore paga lo stesso', async ({ page }) => {
    await resetDemo(page)
    await signInAs(page, /Elena/)
    await page.waitForURL(/ditte/)

    const gate = page.getByRole('button', { name: 'Accetto le condizioni uguali per tutti' })
    if (await gate.isVisible()) await gate.click()

    const lead = page.locator('[data-testid="lead-card"][data-lead-id="l_giglio_1"]')
    await expect(lead).toBeVisible()
    await expect(lead.getByText('Aperto', { exact: true })).toBeVisible()
    await expect(lead.getByText('1 di 3 ditte')).toBeVisible()
    await expect(lead.getByTestId('lead-price')).toHaveText(/^30\s€$/)
    // prima dell'acquisto il locale è anonimo
    await expect(lead.getByText('Trattoria del Giglio Rosso')).toHaveCount(0)

    await lead.getByRole('button', { name: /Acquista contatto · 30\s€/ }).click()
    await expect(lead.getByRole('group', { name: 'Pagamento simulato' })).toBeVisible()
    await lead.getByRole('button', { name: 'Conferma il pagamento simulato' }).click()

    await expect(lead.getByText('Contatto acquistato')).toBeVisible()
    await expect(lead.getByText('2 di 3 ditte')).toBeVisible()
    await expect(lead.getByText('Trattoria del Giglio Rosso')).toBeVisible()
    await expect(lead.getByText('Via dei Neri 22')).toBeVisible()
    await expect(lead.getByRole('textbox', { name: 'Telefono' })).toHaveValue(/\+39/)

    const quoteText = 'Sanificazione completa di cucina e sala in due passaggi, con relazione finale.'
    await lead.getByLabel('Importo (€, IVA inclusa)').fill('320')
    await lead.getByLabel("Descrizione dell'intervento").fill(quoteText)
    await lead.getByRole('button', { name: 'Invia il preventivo' }).click()
    await expect(lead.getByText('I tuoi preventivi')).toBeVisible()
    await expect(lead.getByText(quoteText)).toBeVisible()
    await expect(lead.getByText(/320\s€/)).toBeVisible()
    await expect(lead.getByText('In attesa')).toBeVisible()

    // la ditta del fondatore: stesso prezzo, banner esplicito, nessuna priorità
    await signInAs(page, /Lorenzo/)
    await page.waitForURL(/ditte/)
    await expect(page.getByTestId('founder-banner')).toContainText(/paghi 30\s€ come tutti/)
    const founderLead = page.locator('[data-testid="lead-card"][data-lead-id="l_giglio_1"]')
    await expect(founderLead).toBeVisible()
    await expect(founderLead.getByTestId('lead-price')).toHaveText(/^30\s€$/)
    await expect(founderLead.getByRole('button', { name: /Acquista contatto · 30\s€/ })).toBeEnabled()
    await expect(founderLead.getByText('2 di 3 ditte')).toBeVisible()
  })

  test('5. Certificato: Marco carica, Chiara verifica, il locale diventa Risolta', async ({ page }) => {
    await resetDemo(page)
    await signInAs(page, /Marco/)
    await page.goto('/#/locale/v_giglio/gestisci')

    const card = ownerReport(page, 'r_giglio_1')
    await expect(card).toBeVisible()
    const intervention = 'Disinfestazione blatte con gel e monitoraggio (test e2e)'
    await card.getByLabel('Tipo di intervento').fill(intervention)
    await card.locator('input[type="file"]').setInputFiles({ name: 'certificato.png', mimeType: 'image/png', buffer: await makePng(page) })
    await expect(card.getByText(/certificato\.png/)).toBeVisible()
    await card.getByRole('button', { name: 'Carica il certificato' }).click()
    await expect(card.getByText('Certificato in verifica da parte della moderazione')).toBeVisible()
    await expect(card.getByText(intervention)).toBeVisible()

    await signInAs(page, /Chiara/)
    await page.waitForURL(/moderazione/)
    await page.getByRole('tab', { name: /^Certificati/ }).click()
    const cert = page.getByTestId('cert-card').filter({ hasText: intervention })
    await expect(cert).toHaveCount(1)
    await expect(cert.getByText('Trattoria del Giglio Rosso')).toBeVisible()
    await cert.getByRole('button', { name: 'Verifica e segna risolta' }).click()
    await expect(cert).toHaveCount(0)

    await page.goto('/#/locale/v_giglio')
    await expect(page.getByTestId('venue-status')).toHaveText('Risolta')
    const pub = page.locator('[data-testid="venue-report"][data-report-id="r_giglio_1"]')
    await expect(pub.getByText('Risolta con certificato', { exact: true })).toBeVisible()
    await expect(pub.getByText('Risolta con certificato verificato')).toBeVisible()
    await expect(pub.getByText(intervention)).toBeVisible()
  })

  test('6. DSA: richiesta dal modulo, decisione "Mantieni" in moderazione, registro in trasparenza', async ({ page }) => {
    await resetDemo(page)
    await page.goto('/#/dsa/r_cento_1')

    await expect(page.getByLabel('Codice della segnalazione')).toHaveValue('r_cento_1')
    await expect(page.getByText('Osteria Cento Lampioni')).toBeVisible()
    const contact = 'legale@osteria-cento-demo.it'
    await page.getByLabel('Il tuo recapito (email o telefono)').fill(contact)
    await page.getByLabel('Perché chiedi la verifica o la rimozione').fill('La foto non è stata scattata nel nostro locale: la porta della cucina è di un altro colore. Chiediamo una verifica.')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Invia la richiesta' }).click()
    await expect(page.getByText('Richiesta ricevuta')).toBeVisible()
    await expect(page.getByText(/Numero di pratica: .*entro 48 ore/)).toBeVisible()

    await signInAs(page, /Chiara/)
    await page.waitForURL(/moderazione/)
    await page.getByRole('tab', { name: /^Richieste DSA/ }).click()
    const notice = page.getByTestId('dsa-card').filter({ hasText: contact })
    await expect(notice).toHaveCount(1)
    await expect(notice.getByText('Osteria Cento Lampioni')).toBeVisible()
    const note = 'Verificati foto e posizione: la porta corrisponde al locale. La segnalazione resta pubblicata (test e2e).'
    // senza nota non si decide
    await expect(notice.getByRole('button', { name: 'Mantieni' })).toBeDisabled()
    await notice.getByLabel('Nota della decisione').fill(note)
    await notice.getByRole('button', { name: 'Mantieni' }).click()
    await expect(notice).toHaveCount(0)
    await expect(page.getByText(note)).toBeVisible()

    await page.goto('/#/trasparenza')
    const decision = page.locator('li').filter({ hasText: note })
    await expect(decision).toHaveCount(1)
    await expect(decision.getByText('Segnalazione mantenuta')).toBeVisible()
    // il recapito del richiedente non è pubblico
    await expect(page.getByText(contact)).toHaveCount(0)
    // la segnalazione è ancora in mappa
    await page.goto('/#/locale/v_osteria_cento')
    await expect(page.locator('[data-testid="venue-report"][data-report-id="r_cento_1"]')).toBeVisible()
  })

  test('7. Lingua: il pulsante EN traduce la pagina senza chiavi grezze, e si torna all\'italiano', async ({ page }) => {
    await resetDemo(page)
    await page.goto('/#/come-funziona')
    await expect(page.getByRole('heading', { level: 1, name: 'Come funziona' })).toBeVisible()
    const toggle = page.getByTestId('lang-toggle')
    await expect(toggle).toHaveText('EN')

    await toggle.click()
    await expect(page.getByRole('heading', { level: 1, name: 'How it works' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Customers' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Nitido' })).toBeVisible()
    await expect(toggle).toHaveText('IT')
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')
    const english = await page.locator('body').innerText()
    expect(english).not.toMatch(RAW_I18N_KEY)
    expect(english).toMatch(/How it works/)
    expect(english).not.toMatch(/Come funziona/)

    // la scelta sopravvive alla ricarica
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'How it works' })).toBeVisible()

    await page.getByTestId('lang-toggle').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Come funziona' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Clienti' })).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(RAW_I18N_KEY)
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('it')
  })

  test('8. Regola 3 segnalazioni/mese: Giulia arriva a 3 e la quarta viene rifiutata', async ({ page }) => {
    test.setTimeout(180_000)
    await resetDemo(page)
    await signInAs(page, /Giulia/)

    await page.goto('/#/segnala')
    const counter = page.getByText(/Hai usato \d di 3 segnalazioni questo mese\./)
    await expect(counter).toBeVisible()
    const used = Number(/Hai usato (\d) di 3/.exec(await counter.innerText())![1])
    expect(used).toBeGreaterThanOrEqual(0)
    expect(used).toBeLessThanOrEqual(3)

    const venues = ['v_caffe_annunziata', 'v_bar_sanniccolo', 'v_pizzeria_ognissanti']
    for (let i = used; i < 3; i++) {
      const verdict = await submitReport(page, venues[i], 10 + i, `Segnalazione e2e numero ${i + 1}: blatte dietro il bancone.`)
      expect(verdict).toMatch(/^(Coerente|Incerta)/)
      await page.goto('/#/profilo')
      await expect(page.getByText(`${i + 1} di 3`, { exact: true })).toBeVisible()
    }

    // la quarta non parte nemmeno: limite raggiunto
    await page.goto('/#/segnala/v_giglio')
    await page.reload()
    await expect(page.getByText('Limite mensile raggiunto')).toBeVisible()
    await expect(page.getByText(/Hai raggiunto il massimo di 3 segnalazioni questo mese\./)).toBeVisible()
    await expect(page.getByText('Hai usato 3 di 3 segnalazioni questo mese.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Avanti' })).toHaveCount(0)
    await expect(page.locator('input[type="file"]')).toHaveCount(0)

    await page.goto('/#/profilo')
    await expect(page.getByText('3 di 3', { exact: true })).toBeVisible()
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3')
  })

  test('9. Rivendicazione moderata: un nuovo titolare chiede la gestione, Chiara approva, poi gestisce il locale', async ({ page }) => {
    await resetDemo(page)
    const phone = '+39 333 777 1234'
    await signInWithPhone(page, phone, 'Titolare e2e')

    // il locale è libero: compare il modulo, non il cruscotto
    await page.goto('/#/locale/v_duomo_caffe/gestisci')
    await expect(page.getByRole('heading', { name: 'Rivendica questo locale' })).toBeVisible()
    await page.getByLabel('Partita IVA (11 cifre)').fill('12345678901')
    await page.getByLabel("Telefono dell'attività").fill('+39 055 123456')
    await page.getByRole('button', { name: 'Rivendica il locale' }).click()

    // esito: richiesta inviata, nessuna titolarità immediata
    const sent = page.getByTestId('claim-sent')
    await expect(sent).toBeVisible()
    await expect(sent).toContainText('Richiesta inviata: la moderazione la verifica; riceverai un avviso.')
    await expect(page.getByRole('button', { name: 'Rivendica il locale' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Segnalazioni sul tuo locale' })).toHaveCount(0)

    // ricaricando resta lo stato "in verifica" (niente modulo, niente "altro titolare")
    await page.reload()
    const pending = page.getByTestId('claim-pending')
    await expect(pending).toBeVisible()
    await expect(pending).toContainText('Richiesta di gestione in verifica')
    await expect(pending).toContainText('12345678901')
    await expect(page.getByRole('button', { name: 'Rivendica il locale' })).toHaveCount(0)

    // la scheda pubblica non mostra ancora un titolare: nessuna replica possibile "come il locale"
    await page.goto('/#/locale/v_duomo_caffe')
    await expect(page.getByTestId('venue-status')).toBeVisible()

    // moderazione: la richiesta è nella scheda Rivendicazioni con locale, richiedente, P.IVA e telefono
    await signInAs(page, /Chiara/)
    await page.waitForURL(/moderazione/)
    const tab = page.getByRole('tab', { name: /^Rivendicazioni/ })
    await expect(tab).toContainText('1')
    await tab.click()
    const claim = page.getByTestId('claim-card').filter({ hasText: 'Caffè del Campanile' })
    await expect(claim).toHaveCount(1)
    await expect(claim.getByText('Titolare e2e')).toBeVisible()
    await expect(claim.getByText('12345678901')).toBeVisible()
    await expect(claim.getByText('+39055123456')).toBeVisible()
    await claim.getByRole('button', { name: 'Approva', exact: true }).click()
    await expect(claim).toHaveCount(0)
    const decided = page.getByTestId('claims-decided').locator('tr').filter({ hasText: 'Caffè del Campanile' })
    await expect(decided).toHaveCount(1)
    await expect(decided.getByText('Approvata')).toBeVisible()
    await expect(tab).toContainText('0')

    // il titolare rientra con lo stesso numero (nuovo codice) e trova il cruscotto
    await signInWithPhone(page, phone)
    await page.goto('/#/locale/v_duomo_caffe/gestisci')
    await expect(page.getByRole('heading', { name: 'Segnalazioni sul tuo locale' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Rivendica questo locale' })).toHaveCount(0)
    await expect(page.getByTestId('claim-pending')).toHaveCount(0)
    await expect(page.getByText('Premium non attivo').first()).toBeVisible()

    // e tra le notifiche c'è l'esito
    await page.goto('/#/profilo')
    await expect(page.getByText('Rivendicazione approvata')).toBeVisible()
  })
})
