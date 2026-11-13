# Bonusjakt

Søker etter ledige EuroBonus-bonusreiser med SAS og SkyTeam-partnere, og sier fra på e-post, SMS eller Telegram når en reise du venter på blir ledig.

- Filtrer på verdensdel, seteklasse (Business, Premium, Economy) og antall reisende.
- Søker ± 7 dager rundt ønsket dato (kan endres til 0, 3 eller 14).
- Amex 2 for 1: når den er på, regnes poengprisen for to personer som én på fly SAS selv flyr.
- Lagrede varsler kjøres automatisk hver tredje time på serveren, også når siden er lukket. Hver ledige reise varsles én gang.
- Du kan når som helst søke selv på siden, eller trykke «Kjør alle varsler nå».

## Kom i gang på egen maskin

Krever Node.js 20 eller nyere.

```bash
cd bonusjakt
npm install
cp .env.example .env     # fyll inn det du har
npm start                # åpne http://localhost:3000
npm test                 # kjører testene
```

Uten `SEATSAERO_API_KEY` viser siden eksempeldata, så du kan prøve alt før du betaler for noe.

## Det du må skaffe

| Hva | Hvorfor | Pris |
| --- | --- | --- |
| **seats.aero Pro** | Gir ekte EuroBonus-tilgjengelighet. SAS har ikke et åpent API. Lag konto, kjøp Pro, og hent API-nøkkelen under Settings → API. | Ca. 10 USD/mnd |
| **E-post** | Enklest med Gmail: slå på totrinnsbekreftelse, lag et *app-passord*, og bruk `smtp.gmail.com`, port 465. | Gratis |
| **Telegram** (valgfritt) | Gratis pushvarsel på mobilen. Skriv til @BotFather, lag en bot, lim token inn i `.env`. Send `/start` til boten og finn chat-ID-en med @userinfobot. | Gratis |
| **SMS via Twilio** (valgfritt) | Ekte SMS. Lag konto, kjøp et nummer, fyll inn SID, token og avsendernummer. | Noen øre per SMS + nummer |
| **Server** | Må stå på hele døgnet for å søke hver tredje time. | Ca. 5 USD/mnd |

Når nøkkelen er lagt inn, kjør `npm run check-api`. Det viser hva seats.aero faktisk sender, så du ser at poeng, seter og skatter tolkes riktig.

## Gratis: kjør varslene med GitHub Actions

GitHub kan kjøre søket hver tredje time uten at du har en egen server. Da er det bare seats.aero som koster penger. Nettsiden med «Søk nå» er ikke med i denne varianten; varslene styres fra fila `bonusjakt/watches.json`.

1. **Endre varslene** i `bonusjakt/watches.json` direkte på GitHub (blyant-ikonet). Hvert varsel har disse feltene:

   | Felt | Betyr | Eksempel |
   | --- | --- | --- |
   | `name` | Navnet du ser i varselet | `"Oslo → Asia i business"` |
   | `from` | Avreiseflyplass | `"OSL"`, `"BGO"`, `"TRD"`, `"SVG"`, `"CPH"`, `"ARN"` |
   | `want` | Ønsket avreisedato | `"2027-03-15"` |
   | `flex` | Dager før og etter | `0`, `3`, `7` eller `14` |
   | `region` | Verdensdel | `"all"`, `"europa"`, `"nord-amerika"`, `"sor-amerika"`, `"asia"`, `"midtosten"`, `"afrika"`, `"oseania"` |
   | `cabins` | Seteklasser | `["business"]`, `["business", "premium"]`, `["economy"]` |
   | `pax` | Antall reisende | `2` |
   | `partners` | Ta med partnerfly | `true` / `false` |
   | `amex` | Bruk Amex 2 for 1 | `true` / `false` |

2. **Legg inn secrets** under repoet → **Settings → Secrets and variables → Actions → New repository secret**:

   | Navn | Hva |
   | --- | --- |
   | `SEATSAERO_API_KEY` | Nøkkelen fra seats.aero |
   | `TELEGRAM_BOT_TOKEN` | Token fra @BotFather (for Telegram) |
   | `TELEGRAM_CHAT_ID` | Chat-ID-en din (for Telegram) |
   | `SMTP_HOST` | `smtp.gmail.com` (for e-post) |
   | `SMTP_PORT` | `465` |
   | `SMTP_USER` | Gmail-adressen din |
   | `SMTP_PASS` | App-passordet fra Google (ikke det vanlige passordet) |
   | `MAIL_FROM` | Gmail-adressen din |
   | `ALERT_EMAIL` | Adressen varslene skal til |

   Du trenger bare secrets for kanalene du vil bruke.

3. **Test med en gang**: gå til **Actions → Bonusjakt → Run workflow**. Loggen viser hvor mange ledige reiser hvert varsel fant, og om varslet ble sendt.

Hvis en kjøring feiler (for eksempel feil API-nøkkel), blir den rød, og GitHub sender deg en e-post om det. Planlagte kjøringer virker bare fra hovedgrenen (`master`), så endringene må være slått sammen dit.

## Chrome-utvidelse (søker på flysas.com med din egen innlogging)

Utvidelsen i `bonusjakt/extension/` søker direkte på flysas.com gjennom Chrome, der du allerede er logget inn. Den trenger ingen server eller seats.aero, men virker bare mens PC-en står på og Chrome er åpen.

**Status:** alt er klart unntatt selve lesingen av svarene fra SAS. Den skrives når Claude har fått et opptak av ett bonussøk. Til da viser utvidelsen eksempeldata.

### Installer

1. Last ned repoet: grønn **Code**-knapp på GitHub → **Download ZIP**, og pakk ut.
2. Åpne `chrome://extensions` i Chrome.
3. Slå på **Utviklermodus** øverst til høyre.
4. Trykk **Last inn upakket** og velg mappen `bonusjakt/extension`.
5. Fest Bonusjakt-ikonet i verktøylinjen (puslespillbrikken → nålen).

### Ta opp et søk (for å gjøre SAS-koblingen ferdig)

1. Åpne Bonusjakt, gå til **Datakilde** og slå på **Opptak**.
2. Gå til flysas.com, logg inn med EuroBonus, og gjør ett vanlig bonussøk. Bla gjerne litt i datoene.
3. Gå tilbake til Bonusjakt, slå av **Opptak**, og trykk **Last ned opptak**.
4. Send fila til Claude.

Navn, e-post, telefon, EuroBonus-nummer og innloggingsnøkler fjernes før noe lagres. Åpne gjerne fila og se gjennom den før du sender den.

### Varsler

Varsel på PC-en virker med en gang. For varsel på mobilen: lag en Telegram-bot hos @BotFather, send `/start` til boten, finn chat-ID-en din hos @userinfobot, og fyll inn begge under **Hvor skal varslene sendes?**.

### For utviklere

Søk, filtre, Amex-regning og varsellogikk er de samme filene som serveren bruker, kopiert til `extension/shared/`. Etter endringer i `src/` eller `public/`: kjør `npm run build:extension`. `npm test` sjekker at kopiene er oppdatert.

## Sett den på en server (Railway)

Railway er det enkleste alternativet som står på hele tiden og har lagring.

1. Gå til railway.app og logg inn med GitHub.
2. **New Project → Deploy from GitHub repo**, velg dette repoet.
3. Under **Settings → Root Directory**, skriv `bonusjakt`. Railway finner `Dockerfile` selv.
4. Under **Variables**, legg inn alt fra `.env.example` som du har fylt ut. Husk `APP_PASSWORD`.
5. Under **Volumes**, legg til et volum montert på `/data`. Det er der varslene og innstillingene lagres.
6. Under **Settings → Networking**, trykk **Generate Domain**. Sett den adressen som `PUBLIC_URL`.
7. Åpne adressen, logg inn med passordet, fyll inn e-post og mobil under «Mine varsler», og trykk **Send testvarsel**.

Andre steder som kjører Docker fungerer også (Fly.io, en VPS, en Raspberry Pi hjemme). Med Docker Compose:

```bash
cp .env.example .env   # fyll inn
docker compose up -d --build
```

## Slik er det bygget

```
src/
  server.js            nettsiden og API-et (Express)
  scheduler.js         kjører alle varsler hver 3. time og sender varsler om nye treff
  search.js            datovindu, filtre og poengregning (Amex 2 for 1)
  notify.js            e-post (SMTP), SMS (Twilio) og Telegram
  store.js             lagrer varsler og innstillinger i data/db.json
  providers/
    seatsaero.js       henter fra seats.aero
    demo.js            eksempeldata når nøkkel mangler
public/                nettsiden
test/                  tester (npm test)
```

### Om seats.aero-koblingen

Dokumentasjonen til seats.aero var ikke tilgjengelig da dette ble bygget, så feltnavnene i `src/providers/seatsaero.js` er basert på API-et slik det har vært kjent. All kode som avhenger av API-ets form ligger i den ene fila. Kjør `npm run check-api` med ekte nøkkel. Ser noe feil ut (for eksempel 0 reiser, eller skatter som er 100 ganger for store eller små), er det den fila som må justeres.

### Om Amex 2 for 1

Regnes bare når bryteren er på, det er minst to reisende og flyet er operert av SAS. Med flere enn to reisende reiser én gratis. Skatter og avgifter betales for alle. Sjekk vilkårene på kortet ditt; siden bestiller ingenting selv.
