# EFRO MASTER ROADMAP — Vollständige Systemdokumentation
> **Letzte Aktualisierung:** 2026-03-04  
> **Status:** Sprint 1 abgeschlossen, Sprint 2 offen  
> **Shopify Review:** In Vorbereitung

---

## 🏗️ SYSTEMARCHITEKTUR

```
Shopify Store
    └── Theme Extension: efro.js (iFrame Embed)
            └── iFrame → mascotbot-fresh (Next.js, Vercel)
                    ├── src/app/page.tsx (Widget UI + Voice)
                    ├── src/app/api/get-signed-url/route.ts (MascotBot Proxy)
                    └── src/app/api/brain-chat/route.ts
                                └── POST https://efro-five.vercel.app/api/brain/chat
                                        └── BrainOrchestrator v6
                                                ├── IntentDetector
                                                ├── ProductFilter (MIN_SCORE=8)
                                                ├── SemanticMatcher
                                                └── Supabase (products table)
```

**Voice Flow:**
```
User spricht → ElevenLabs Agent → clientTool: search_products(query)
    → /api/brain-chat → Brain API → Supabase → Products
    → Frontend: 1 Produktkarte + TTS-Text zurück an ElevenLabs
```

**Text-Chat Flow:**
```
User tippt → sendMessage() → /api/brain-chat → Brain API → Supabase
    → Frontend: bis zu 3 Produktkarten ODER replyText
```

---

## 🔴 KRITISCHE BUGS (bestätigt durch Code-Analyse)

### BUG-01: "Fernseher nicht gefunden" — SEMANTIC GAP
**Root Cause:** SemanticMatcher und ProductFilter matchen NUR auf Titel-Keywords. Das Produkt heißt "4K Smart TV 55 Zoll" — das Wort "Fernseher" taucht nirgends auf. Beide Module haben KEINE Synonym-Map.

**Beweis:**
```javascript
// SemanticMatcher.scoreProduct():
if (title.includes(lowerQuery)) { score += 100; }   // "fernseher" ≠ "4k smart tv"
queryWords.forEach(word => {
  if (word.length > 2 && title.includes(word)) {   // "fernseher" ≠ "tv", "4k", "smart", "zoll"
    score += 15;
  }
});
// Score = 0 → unter MIN_SCORE=8 → nicht zurückgegeben
```

**Lösung (in studiovoicetools/efro, apps/brain-api/lib/semanticMatcher.js):**
AI-gestützte Synonym-Expansion: Wenn score < MIN_SCORE, frage GPT/OpenAI für Synonyme und suche erneut. ODER: Baue eine produktkategorie-unabhängige Synonym-Datenbank auf Supabase.

**Sofortlösung:** In `semanticMatcher.js` eine SYNONYM_MAP einbauen die gängige DE/EN Produktsynonyme abdeckt.

### BUG-02: LipSync Überschuss — criticalVisemeMinDuration
**Status:** BEHOBEN in Sprint 1 (dieses PR)

### BUG-03: Produktlinks nicht klickbar im iFrame
**Status:** BEHOBEN in Sprint 1 (dieses PR)

### BUG-04: Chat-History überlebt Page-Reload
**Status:** BEHOBEN in Sprint 1 (dieses PR)

---

## 🧠 GEDÄCHTNIS / KONVERSATIONS-KONTINUITÄT

**Aktueller Stand:** Kein serverseitiges Gedächtnis. Brain verarbeitet jede Anfrage isoliert.

**Problem:** EFRO "vergisst" nach jeder Antwort den Kontext. Wenn User sagt "zeig mir etwas günstigeres" — Brain weiß nicht was das vorherige Produkt war.

**Lösung — Supabase conversations Tabelle:**
```sql
CREATE TABLE IF NOT EXISTS conversations (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  text NOT NULL,
  shop_domain text NOT NULL,
  role        text CHECK (role IN ('user', 'assistant')) NOT NULL,
  message     text NOT NULL,
  products    jsonb,
  intent_type text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX ON conversations(session_id, created_at);
CREATE INDEX ON conversations(shop_domain, created_at);
-- TTL: Rows älter als 24h können gelöscht werden (Shopify Privacy Compliance)
```

**Frontend (page.tsx):**
- `sessionId` beim Mount generieren: `crypto.randomUUID()` oder `Date.now().toString(36)`
- sessionId bei JEDEM `/api/brain-chat` Request mitsenden
- Brain gibt Kontext der letzten N Nachrichten an Orchestrator

**Backend (brain-chat/route.ts + Brain API):**
- History aus Supabase laden: letzten 5 Messages für `session_id`
- An `BrainOrchestrator.process()` als `history: []` übergeben
- Nach jeder Antwort in Supabase speichern

**Wichtig für Shopify Review:** Conversations dürfen maximal 24h gespeichert werden (DSGVO/GDPR). Cron-Job oder Supabase TTL Policy nötig.

---

## 🏪 SHOPIFY APP REVIEW — ANFORDERUNGEN

Die folgenden Punkte MÜSSEN erfüllt sein bevor die App bei Shopify eingereicht wird:

### Technische Anforderungen:
- [ ] HTTPS überall (bereits durch Vercel/Render)
- [ ] Microphone Permission: Nur nach User-Klick anfordern (bereits korrekt)
- [ ] Keine API Keys im Frontend-Code (bereits korrekt, env vars)
- [ ] GDPR Webhooks registriert (bereits in shopify.app.toml)
- [ ] Datenschutz-URL vorhanden
- [ ] OAuth Install Flow funktioniert
- [ ] Widget funktioniert in iFrame (src= muss HTTPS sein)
- [ ] Keine console.error im normalen Betrieb (nur bei echten Fehlern)

### Funktionale Anforderungen (Shopify testet manuell):
- [ ] Widget lädt sich in < 3 Sekunden
- [ ] Voice-Start funktioniert nach User-Klick
- [ ] Produkte werden korrekt angezeigt (Bild, Titel, Preis)
- [ ] Produktlink öffnet die Produktseite (target="_top")
- [ ] "Fernseher" findet "4K Smart TV" (Synonym-Matching)
- [ ] Chat funktioniert auch ohne Voice
- [ ] Fehler-Handling: Wenn Brain API offline → freundliche Meldung, kein JS-Error

### Performance:
- [ ] Widget < 200KB initial JS (durch Next.js Code-Splitting bereits OK)
- [ ] Avatar lädt asynchron (bereits OK)
- [ ] Brain API antwortet in < 3s (Supabase Cold-Start kann Problem sein)

---

## 📊 SUPABASE SCHEMA (Vollständig)

```sql
-- Shops Tabelle (bereits vorhanden)
CREATE TABLE shops (
  shop_domain   text PRIMARY KEY,
  access_token  text,
  language      text DEFAULT 'de',
  shop_name     text,
  email         text,
  currency      text DEFAULT 'EUR',
  timezone      text DEFAULT 'Europe/Berlin',
  is_active     boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Products Tabelle (bereits vorhanden)
CREATE TABLE products (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_domain   text NOT NULL REFERENCES shops(shop_domain),
  shopify_id    text,
  title         text NOT NULL,
  description   text,
  price         numeric,
  image_url     text,
  url           text,
  handle        text,
  tags          text[],
  variants      jsonb,
  -- Semantic Search:
  title_lower   text GENERATED ALWAYS AS (lower(title)) STORED,
  tags_text     text GENERATED ALWAYS AS (array_to_string(tags, ' ')) STORED,
  search_text   text, -- title + description + tags für Volltext-Suche
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX ON products(shop_domain);
CREATE INDEX ON products USING gin(to_tsvector('german', coalesce(search_text, title)));

-- Conversations Tabelle (NEU — Sprint 2)
CREATE TABLE conversations (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  text NOT NULL,
  shop_domain text NOT NULL,
  role        text CHECK (role IN ('user', 'assistant')) NOT NULL,
  message     text NOT NULL,
  products    jsonb,
  intent_type text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX ON conversations(session_id, created_at);
CREATE INDEX ON conversations(shop_domain, created_at);

-- Audio Cache Tabelle (bereits vorhanden)
CREATE TABLE audio_cache (
  text_hash   text PRIMARY KEY,
  audio_data  jsonb,
  viseme_data jsonb,
  created_at  timestamptz DEFAULT now()
);
```

---

## 🗓️ SPRINT-PLAN

### ✅ Sprint 1 (DIESER PR — studiovoicetools/mascotbot-fresh)
- SDK 0.1.7 upgrade
- LipSync Config fix (criticalVisemeMinDuration entfernen, Werte anpassen)
- Produktlinks target="_top" fix
- sessionStorage Init entfernen (frischer Start)
- Max 1 Produkt bei Voice, max 3 bei Text-Chat
- Dieses Master-Dokument erstellen

### 🔴 Sprint 2 — Synonym-Matching / "Fernseher-Problem" (studiovoicetools/efro)
**Files:** `apps/brain-api/lib/semanticMatcher.js`, `apps/brain-api/brain/modules/ProductFilter.js`

**Ziel:** Wenn User sagt "Fernseher" → findet "4K Smart TV 55 Zoll"

**Implementierung:**
1. In `semanticMatcher.js` eine `GERMAN_SYNONYMS` Map:
```javascript
const GERMAN_SYNONYMS = {
  'fernseher': ['tv', 'television', 'smart tv', 'bildschirm', 'monitor'],
  'handy': ['smartphone', 'iphone', 'android', 'mobiltelefon', 'telefon'],
  'laptop': ['notebook', 'computer', 'pc', 'rechner'],
  'kopfhörer': ['headphones', 'earphones', 'headset', 'in-ear'],
  'lautsprecher': ['speaker', 'box', 'bluetooth speaker', 'soundbar'],
  'kamera': ['camera', 'fotokamera', 'digitalkamera', 'spiegelreflex'],
  'uhr': ['watch', 'smartwatch', 'armbanduhr'],
  'schuhe': ['shoes', 'sneaker', 'stiefel', 'boots', 'turnschuhe'],
  'jacke': ['jacket', 'mantel', 'coat', 'hoodie', 'sweatshirt'],
  // etc. — erweiterbar über Supabase-Tabelle
};
```

2. Im `scoreProduct()`: Wenn ein Query-Wort ein Synonym hat → auch für diese matchen:
```javascript
// Synonym-Expansion
const synonyms = GERMAN_SYNONYMS[word] || [];
synonyms.forEach(syn => {
  if (title.includes(syn)) {
    score += 12; // leicht weniger als direkter Match
  }
});
```

3. **Besser (nachhaltig):** Supabase-Tabelle `product_synonyms`:
```sql
CREATE TABLE product_synonyms (
  term      text PRIMARY KEY,
  synonyms  text[] NOT NULL,
  language  text DEFAULT 'de'
);
```
Dann kann der Shop-Betreiber eigene Synonyme hinzufügen.

### 🔴 Sprint 3 — Konversations-Gedächtnis (beide Repos)
- Supabase `conversations` Tabelle erstellen (SQL Migration)
- `session_id` in Frontend generieren und mitsenden
- Brain API: History laden + an Orchestrator übergeben
- GDPR: 24h TTL Policy

### 🔴 Sprint 4 — Add-to-Cart (studiovoicetools/efro Extension)
```javascript
// In efro.js (Extension):
window.addEventListener('message', (event) => {
  if (event.data?.type === 'EFRO_ADD_TO_CART') {
    fetch('/cart/add.js', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({items: [{id: event.data.variantId, quantity: 1}]})
    }).then(r => r.json()).then(data => {
      event.source.postMessage({type: 'EFRO_CART_SUCCESS', itemCount: data.item_count}, '*');
    });
  }
});
```

### 🔴 Sprint 5 — Performance & Monitoring
- Vercel Analytics einbauen
- Error-Tracking (Sentry oder Vercel Error Tracking)
- Brain API Response-Time-Logging
- Supabase Connection Pooling (PgBouncer aktivieren)

### 🔴 Sprint 6 — Shopify App Review Final Check
- GDPR Webhooks testen
- OAuth Flow Ende-zu-Ende testen
- Widget auf echter Shopify Store testen
- Screenshot + Video für Review-Einreichung

---

## 🐛 BEKANNTE PROBLEME (nach Analyse)

| # | Problem | Schwere | Sprint |
|---|---|---|---|
| P1 | "Fernseher" findet "TV" nicht | KRITISCH | S2 |
| P2 | Kein Konversations-Gedächtnis | HOCH | S3 |
| P3 | Add-to-Cart fehlt | MITTEL | S4 |
| P4 | Brain API kein Error-Retry | MITTEL | S5 |
| P5 | Kein Analytics/Monitoring | NIEDRIG | S5 |
| P6 | Search-Text in products leer | HOCH | S2 |
| P7 | MIN_SCORE=8 zu hoch für kurze Titel | MITTEL | S2 |

---

## ⚠️ ABSOLUTE REGELN FÜR ALLE AGENTEN

1. **NIEMALS** `useConversation`, `MascotProvider`, `MascotClient`, `MascotRive`, `useMascotElevenlabs` Props entfernen oder umbenennen
2. **NIEMALS** `startSession`, `endSession`, `onConnect`, `onDisconnect`, `onError` anfassen
3. **IMMER** erst lesen, dann schreiben — keine blinden Änderungen
4. **EIN Concern pro PR** — keine Sammelpakete außer bei eng verwandten Fixes
5. **Build muss grün sein** — `next build` ohne TypeScript-Fehler
6. **Shopify Review First** — jede Änderung muss Shopify-kompatibel sein
7. `criticalVisemeMinDuration` darf NICHT zurückkommen
8. **sessionStorage** nur für "Zurück vom Produktlink" nutzen, nicht für normalen Start
9. Produktlinks IMMER mit `target="_top"` (Widget läuft in iFrame)
10. API Keys NIEMALS im Frontend-Code

---

## 📁 DATEI-MAP

### studiovoicetools/mascotbot-fresh (Frontend)
```
src/app/page.tsx                     ← Haupt-Widget (ElevenLabsAvatar + Home)
src/app/api/get-signed-url/route.ts  ← MascotBot Proxy für signed URL
src/app/api/brain-chat/route.ts      ← Brain API Proxy
public/retroBot.riv                  ← Rive Animation
mascotbot-sdk-react-0.1.7.tgz       ← SDK (lokal eingebunden)
```

### studiovoicetools/efro (Backend)
```
apps/brain-api/server.js                        ← Express Server (Vercel)
apps/brain-api/brain/orchestrator/index.js      ← BrainOrchestrator v6
apps/brain-api/brain/modules/IntentDetector.js  ← Intent-Klassifikation
apps/brain-api/brain/modules/ProductFilter.js   ← Token-basierter Filter
apps/brain-api/brain/modules/ResponseBuilder.js ← Antwort-Builder
apps/brain-api/lib/semanticMatcher.js           ← Produkt-Scoring
apps/shopify-app/server.js                      ← Shopify OAuth (Render)
extensions/efro-embed/assets/efro.js            ← iFrame Embed Script
```

---

## ZUSAMMENFASSUNG DER ÄNDERUNGEN IN SPRINT 1

| Datei | Änderung | Grund |
|---|---|---|
| `docs/EFRO_MASTER_ROADMAP.md` | NEU erstellt | Wahrheitsquelle für alle Agenten |
| `package.json` | SDK 0.1.6 → 0.1.7 | Neue SDK-Version verfügbar |
| `src/app/page.tsx` | LipSync Config Werte angepasst | Stabilere Viseme-Ausgabe |
| `src/app/page.tsx` | Produktlinks `<a target="_top">` | iFrame-Kompatibilität für Shopify |
| `src/app/page.tsx` | sessionStorage Init entfernen | Frischer Start bei jedem Laden |
| `src/app/page.tsx` | Voice: limit 1, Text: limit 3 | Professionelle UX-Entscheidung |
