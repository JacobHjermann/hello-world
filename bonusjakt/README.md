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
