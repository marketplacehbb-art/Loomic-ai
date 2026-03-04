# AI Builder Enterprise Masterplan (10 Phasen)

**Ziel:** Lovable-Level UX + Enterprise-Level Zuverlaessigkeit, Sicherheit und Skalierbarkeit.  
**Strategie:** Jede Phase ist einzeln shipbar, mit klaren Exit-Kriterien und ohne Funktionsverlust.

## Leitplanken

- Provider-Fokus: **nur Gemini + OpenAI** (kein DeepSeek-Pfad mehr).
- Rueckwaertskompatibel: Bestehende API-Vertraege bleiben stabil.
- Feature-Flags fuer riskante Aenderungen (stufenweises Rollout).
- Jede Phase endet mit Tests + Metriken + Dokumentation.

---

## Phase 1 - Provider Baseline (Gemini/OpenAI only)

**Ziel:** Klare, stabile Provider-Matrix ohne Legacy-Reste.

**Plan:**
- Backend:
  - Provider-Typen auf `gemini | openai` normalisieren.
  - Alte Provider-Branches/Configs/Env-Reads entfernen.
  - Health-Check pro Provider in API erweitern.
- Frontend:
  - Model-Selector, Labels und Error-Texte vereinheitlichen.
  - Keine versteckten alten Provider-Optionen.
- Ops:
  - `.env.example` und README auf neue Matrix anpassen.
  - Secret-Rotation fuer geleakte Keys einplanen.

**Relevante Dateien:**
- `server/api/llm/manager.ts`
- `server/api/generate.ts`
- `server/middleware/validation.ts`
- `client/src/pages/Generator.tsx`
- `client/src/components/ModelSelector.tsx`
- `.env.example`, `README.md`

**Exit-Kriterien:**
- Keine DeepSeek-Referenzen mehr im Runtime-Pfad.
- E2E: Generierung mit Gemini und OpenAI erfolgreich.

---

## Phase 2 - Provider Failover + User Messaging

**Ziel:** Wenn ein Modell ausfaellt, klare Meldung + automatische Alternative.

**Plan:**
- Backend:
  - Circuit-Breaker/Fallback-Status konsistent in Response-Metadata liefern.
  - Fehlercodes fuer `rate_limit`, `provider_down`, `auth_error` standardisieren.
- Frontend:
  - Explizite Meldung: "Provider aktuell nicht verfuegbar, bitte auf X wechseln."
  - CTA-Button fuer One-Click-Switch auf Alternativmodell.
- QA:
  - Simulierte Provider-Ausfaelle in Integrationstests.

**Exit-Kriterien:**
- Bei Ausfall bekommt User immer eine handlungsfaehige Meldung.
- Kein "silent fail" mehr.

---

## Phase 3 - Deterministische Generator-Vertraege

**Ziel:** Weniger Parser-Ausnahmen, reproduzierbare Multi-File-Ausgaben.

**Plan:**
- LLM-Output-Contract haerten (strict JSON/typed schema).
- Parser-Recovery nur noch als kontrollierter Fallback.
- Dateiplan-Validierung vor Assembler-Schritt.
- Diff/Regeneration auf stabile Regeln (kein ungeplantes Ueberschreiben).

**Relevante Dateien:**
- `server/ai/project-pipeline/llm-response-parser.ts`
- `server/ai/project-pipeline/file-planner.ts`
- `server/ai/project-pipeline/project-assembler.ts`
- `server/ai/project-pipeline/section-regeneration.ts`

**Exit-Kriterien:**
- Erfolgsquote "gueltige strukturierte Antwort" > 98%.
- Deutlich weniger nachgelagerte Reparatur-Faelle.

---

## Phase 4 - Pipeline Speed v1

**Ziel:** Spuerbar schnellere Generator-Latenz ohne Funktionsverlust.

**Plan:**
- Hot-Path-Profiling (Prompt-Build, Parser, AST, Quality Gates).
- Token-Budgeting pro Modus (`new/edit/style`) schaerfen.
- Kontext-Reduktion: nur wirklich betroffene Dateien in LLM-Kontext.
- Parallelisierbare Schritte trennen (I/O vs CPU).
- Wiederverwendbare Ergebnisse cachen (Snapshot, Plan, Style-Genome).

**Exit-Kriterien:**
- p95-End-to-End-Latenz mindestens 30% besser als Baseline.
- Keine Regression bei Quality-Gates.

---

## Phase 5 - Quality & Self-Repair v2

**Ziel:** "Lovable-like" Erstresultate mit weniger manueller Nacharbeit.

**Plan:**
- Self-Critique + Repair-Loop auf echte Fehlerklassen aus Telemetrie kalibrieren.
- AST-Patches priorisieren statt Full-Regeneration.
- Domain-Fallbacks in nachvollziehbare Regeln kapseln.
- Qualitaets-Score in Response + UI sichtbar machen.

**Relevante Dateien:**
- `server/ai/intelligence-layer/self-critique.ts`
- `server/ai/intelligence-layer/repair-loop.ts`
- `server/ai/processor-evolution/apply-ast-pipeline.ts`
- `server/ai/project-pipeline/quality-gates.ts`

**Exit-Kriterien:**
- First-pass-acceptance (ohne manuelle Fixes) deutlich erhoeht.
- Reparaturschleifen sind nachvollziehbar und auditierbar.

---

## Phase 6 - Enterprise Security Baseline

**Ziel:** Sicherheitsniveau fuer Teams/Kundenbetrieb.

**Plan:**
- Secret-Handling: keine API-Keys im Frontend, Rotationsprozess.
- RLS/DB-Policies und API-Auth-Pfade haerten.
- Input-Validation + Output-Sanitization zentralisieren.
- Sicherheits-Scans in CI (SAST + Dependency).

**Exit-Kriterien:**
- Kritische Findings = 0 vor Release.
- Security-Checklist je Release verpflichtend.

---

## Phase 7 - Kollaboration & Governance

**Ziel:** Teamfaehigkeit auf Enterprise-Niveau.

**Plan:**
- Versionshistorie pro Projekt/Datei ausbauen.
- Deterministische Undo/Redo + Branching-Ansatz fuer groessere Edits.
- Rollen/Rechte (Owner/Editor/Viewer) klar definieren.
- Audit-Log: wer hat wann was per AI geaendert.

**Exit-Kriterien:**
- Mehrbenutzer-Szenarien ohne Datenverlust.
- Aenderungen sind revisionssicher nachvollziehbar.

---

## Phase 8 - Observability + Cost Control

**Ziel:** Betrieb mit klaren SLOs und Kostenkontrolle.

**Plan:**
- End-to-End-Tracing pro Generate-Request (Provider, Dauer, Fehlerklasse).
- Dashboards fuer p50/p95, Erfolgsrate, Fallback-Rate, Kosten pro Request.
- Alerting bei Ausreissern (Latenz, Error-Spikes, Kosten-Spikes).
- Nutzungs-Limits und Quotas sauber pro Workspace/Projekt.

**Relevante Dateien:**
- `server/ai/project-pipeline/edit-telemetry.ts`
- `client/src/components/MetricsWidget.tsx`
- `client/src/contexts/UsageContext.tsx`

**Exit-Kriterien:**
- Klare SLOs definiert und messbar eingehalten.
- Kostenabweichungen werden innerhalb weniger Minuten erkannt.

---

## Phase 9 - Release Engineering & Testpyramide

**Ziel:** Schnell liefern ohne Produktionsrisiko.

**Plan:**
- CI-Pipeline: lint, typecheck, unit, integration, smoke e2e.
- Golden-Test-Suite fuer Generator-Regressionen (Prompt -> erwartete Datei-Qualitaet).
- Canary/Blue-Green Rollout mit schnellem Rollback.
- Release-Checklisten + automatisierte Changelogs.

**Exit-Kriterien:**
- Jede Aenderung ist vor Merge testbar abgesichert.
- Rollback-Zeit < 10 Minuten.

---

## Phase 10 - Enterprise Productization

**Ziel:** Verkaufs- und betriebssicheres Enterprise-Produkt.

**Plan:**
- Multi-Tenant-Isolation und Mandanten-Policies finalisieren.
- SLA-/Support-Modell (Incident, On-Call, Runbooks).
- Compliance-Artefakte (DPA, TOM, Audit-Nachweise).
- "Lovable-Level" UX-Finish: Onboarding, Vorlagen, leichtere Success-Pfade.

**Exit-Kriterien:**
- Enterprise-Kunden-Onboarding ohne Sonderentwicklungen moeglich.
- Betriebs- und Compliance-Nachweise liegen standardisiert vor.

---

## Durchfuehrungsmodus (wie wir es jetzt machen)

- Wir gehen **eine Phase nach der anderen** durch.
- Pro Phase liefern wir:
  - Scope-Freeze
  - konkrete Tasks in Code-Dateien
  - Tests
  - Go/No-Go Check
- Erst nach Abnahme geht es in die naechste Phase.
