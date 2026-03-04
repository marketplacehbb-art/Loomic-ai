# Prompt-to-Preview Architektur (Vollstaendig)

Diese Datei beschreibt den kompletten Ablauf von der Prompt-Eingabe bis zur Darstellung im Preview, inklusive Orchestrierung, Provider-Fallbacks, Persistenz, Auto-Repair und Cloud/Publish/Security-Nebenpfaden.

## 1) Gesamt-System (Komponentenlandkarte)

```mermaid
flowchart LR
  subgraph Browser["Browser / Frontend (Vite + React)"]
    U["User"]
    GEN["Generator Page"]
    UI["Prompt, Model Selector, Visual Mode, Cloud, Publish"]
    LP["LocalPreview"]
    BW["esbuild-wasm Bundler (im Browser)"]
    IF["Sandbox Iframe (srcdoc)"]
    MSG["postMessage Bridge (Runtime OK/Error, DOM Selection)"]
  end

  subgraph API["Backend API (Express)"]
    IDX["server/index.ts"]
    MW["Middleware: auth, rate-limit, release-gate, usage-monitor"]
    GR["/api/generate"]
    CR["/api/cloud"]
    PR["/api/publish"]
    IR["/api/integrations/supabase"]
    SR["/api/security/scan"]
    GIT["/api/git"]
  end

  subgraph Pipeline["Generate-Pipeline (server/api/generate.ts)"]
    PU["Prompt Understanding + Token Budget + Context Injector"]
    ORCH["Orchestrator (Phase 1/2/3)"]
    PAR["LLM Response Parser"]
    CP["CodeProcessor (validate + deps + bundle + index/package)"]
    AR["Structured Auto-Repair Loop"]
    QG["Quality Gates + Style Policy + Library Quality"]
    SD["Smart Diff + Snapshot + Rollback"]
  end

  subgraph LLM["LLM Layer"]
    MAN["LLM Manager"]
    NV["NVIDIA (Qwen)"]
    OA["OpenAI"]
    GQ["Groq"]
    ORT["OpenRouter (Gemini/OpenAI Gateway)"]
    FB["Fallback + Hard-Block + Retry + Timeout"]
  end

  subgraph Data["Datenhaltung / Services"]
    SB["Supabase (projects, messages, files, audit, usage)"]
    MEM["In-Memory Fallback Stores"]
    SNAP["Snapshot Store"]
    PUB["project_publications"]
    CLO["project_cloud_state"]
    INT["project_integrations"]
    QUO["project_usage_quotas"]
  end

  U --> UI --> GEN
  GEN --> LP --> BW --> IF --> MSG --> GEN
  GEN -->|POST /api/generate| IDX --> MW --> GR
  GEN -->|Cloud/Publish/Security/Git Calls| CR
  GEN --> PR
  GEN --> IR
  GEN --> SR
  GEN --> GIT

  GR --> PU --> ORCH --> MAN
  MAN --> NV
  MAN --> OA
  MAN --> GQ
  MAN --> ORT
  MAN --> FB
  MAN --> PAR
  PAR --> CP --> AR --> QG --> SD
  SD --> SB
  SD --> SNAP
  CR --> CLO
  CR --> INT
  PR --> PUB
  IR --> INT
  MW --> QUO
  SB --> MEM
```

## 2) Hauptfluss Prompt -> Preview (Sequenz)

```mermaid
sequenceDiagram
  participant User
  participant FE as Generator.tsx
  participant API as /api/generate
  participant Orch as Orchestrator
  participant LLM as LLM Manager
  participant Prov as NVIDIA/OpenAI/Groq/OpenRouter
  participant Parser as parseLLMOutput
  participant Proc as CodeProcessor
  participant Persist as Supabase/Audit
  participant Prev as LocalPreview
  participant BW as Browser Bundler
  participant Iframe as Preview Iframe

  User->>FE: Prompt absenden
  FE->>API: POST /api/generate (provider, mode, files, flags)
  API->>API: auth + limiter + release gate + usage monitor
  API->>API: prompt understanding, token budget, context selection
  API->>Orch: orchestrate(...)
  Orch->>LLM: generation request
  LLM->>Prov: primary provider call
  alt Fehler / Timeout / Quota
    LLM->>Prov: fallback provider(s)
  end
  Prov-->>LLM: raw output
  LLM-->>API: content + rate/fallback meta
  API->>Parser: structured/fenced/raw parse + rescue
  API->>Proc: validate + deps + bundling + artifacts
  API->>API: auto-repair + quality gates + smart diff/snapshot
  API->>Persist: project_messages, project_files, usage, audit_logs
  API-->>FE: files + deps + pipeline metadata

  FE->>Prev: update preview input
  Prev->>BW: bundleCode(code, files, entryPath)
  BW-->>Prev: compiled module
  Prev->>Iframe: srcdoc render
  Iframe-->>FE: PREVIEW_RUNTIME_OK / PREVIEW_RUNTIME_ERROR
```

## 3) Backend-Generate Pipeline (Detail)

```mermaid
flowchart TD
  A["Request /api/generate"] --> B["Input Validation + Auth Context"]
  B --> C["Prompt Understanding (AI + fallback heuristic)"]
  C --> D["Token Budgeting (gen/repair, attempts, caps)"]
  D --> E["Section/Scope Plan + File Plan + Context Injection"]
  E --> F{"Orchestrator aktiv?"}

  F -- Ja --> G["Phase 3: Intent Agent / Prompt Conditioning / Style DNA / Dependency Intelligence / Component Memory"]
  G --> H["Phase 1: Spec Pass -> Architecture Pass -> (optional) Self Critique + Repair Loop"]
  H --> I["Main Generation via LLM Manager"]
  I --> J["Phase 2: AST Rewrite / Quality Scoring / Multi-File Generation"]

  F -- Nein --> I2["Direkte Generation via LLM Manager"]

  J --> K["parseLLMOutput (json/operations/fenced/raw)"]
  I2 --> K
  K --> L["Structured Retry/Rescue bei malformed output"]
  L --> M["CodeProcessor: nav transform, icon validation, TS validate, deps, esbuild"]
  M --> N["Structured Auto-Repair Loop (wenn Fehler)"]
  N --> O["Quality Gates + Style/Library Policies"]
  O --> P["Smart Diff + Snapshot Store + Rollback"]
  P --> Q["Persistenz: project/messages/files/usage/audit"]
  Q --> R["API Response (files, deps, quality, pipeline meta)"]
```

## 4) Preview + Runtime Auto-Repair (Detail)

```mermaid
flowchart TD
  A["Frontend erhaelt files+deps"] --> B["LocalPreview updatePreview()"]
  B --> C["bundleCode() im Browser"]
  C --> D["Virtual FS Resolve + Alias + Synthetic Modules"]
  D --> E["Recovery 1: Syntax ':'->';'"]
  E --> F["Recovery 2: Missing named export -> default alias"]
  F --> G{"Build erfolgreich?"}
  G -- Ja --> H["Iframe srcdoc rendern"]
  H --> I{"Runtime OK?"}
  I -- Ja --> J["PREVIEW_RUNTIME_OK -> UI healthy"]
  I -- Nein --> K["PREVIEW_RUNTIME_ERROR -> Generator handler"]
  G -- Nein --> K
  K --> L["queueRuntimeAutoRepair()"]
  L --> M["runAutoRuntimeRepair(): POST /api/generate (edit mode, AUTO_REPAIR_RUNTIME)"]
  M --> N["Neue files anwenden + persistieren + preview refresh"]
  N --> B
```

## 5) Cloud / Publish / Security Nebenfluesse

```mermaid
flowchart LR
  FE["Generator UI"] --> C1["CloudWorkspace"]
  FE --> C2["PublishModal"]
  FE --> C3["Security Surface"]

  C1 -->|GET /api/cloud/state| API1["Cloud API"]
  C1 -->|POST /api/cloud/enable| API1
  C1 -->|GET /api/cloud/overview| API1
  API1 --> DB1["project_cloud_state"]
  API1 --> DB2["project_integrations (supabase)"]
  API1 --> MEM1["In-memory fallback"]

  C2 -->|GET /api/publish/status| API2["Publish API"]
  C2 -->|POST /api/publish/publish| API2
  C2 -->|POST /api/publish/unpublish| API2
  API2 --> DB3["project_publications"]
  API2 --> DB4["projects status sync"]
  API2 --> MEM2["In-memory fallback"]

  C3 -->|POST /api/security/scan| API3["Security Scan API"]
  C3 -->|GET /api/security/history| API3
  API3 --> DB5["project_security_scans"]

  FE -->|GET/POST /api/integrations/supabase/*| API4["Supabase Integration API"]
  API4 --> DB2
  API4 --> OAuth["Supabase OAuth callback/connect/disconnect"]
```

## 6) Provider-/Fehlerpfade (kompakt)

```mermaid
flowchart TD
  A["Primary Provider Request"] --> B{"Antwort OK?"}
  B -- Ja --> C["Weiter mit Parser"]
  B -- Nein --> D{"Retryable? timeout/rate/quota/upstream"}
  D -- Nein --> E["Sofortiger Fehler an API"]
  D -- Ja --> F["Fallback-Reihenfolge je Provider"]
  F --> G{"Fallback erfolgreich?"}
  G -- Ja --> H["Fallback merken (temporarily cached)"]
  H --> C
  G -- Nein --> I["Aggregated Error + fallbackErrors[]"]
  I --> J["Frontend zeigt Error/Hint + ggf. Modellwechsel"]
```

## 7) Was diese Architektur garantiert

- Voller End-to-End Pfad von Prompt bis Preview-Render ist abgedeckt.
- Fehlerbehandlung existiert auf drei Ebenen: Provider, Parser/Processor, Preview Runtime.
- Persistenz ist durch Supabase + In-Memory Fallback robust gemacht.
- Cloud/Publish/Security sind als eigene API-Subsysteme integriert, aber am selben Generator-UI angedockt.

