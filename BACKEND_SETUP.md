# API Server Setup Anleitung

## 📦 Express Backend Integration - SCHRITT FÜR SCHRITT

### ✅ Was wurde gemacht:

```
✓ Express Server erstellt (/server/index.ts)
✓ API Router aktualisiert (/server/api/generate.ts)
✓ LLM Manager implementiert (/server/api/llm/manager.ts)
✓ Package.json mit neuen Scripts aktualisiert
✓ Vite Config mit Proxy konfiguriert
✓ ENV Variables aktualisiert (API_PORT=3001)
✓ TypeScript Server Config erstellt (tsconfig.server.json)
```

---

## 🚀 Installation (3 Schritte)

### Schritt 1: Dependencies installieren
```bash
npm install
```

Das installiert:
- ✅ `express` - Backend Web Framework
- ✅ `cors` - Cross-Origin Resource Sharing
- ✅ `concurrently` - Run multiple commands parallel
- ✅ `nodemon` - Auto-restart bei Änderungen
- ✅ `tsx` - TypeScript execution für Node.js

### Schritt 2: Dev Server starten
```bash
npm run dev
```

Du solltest sehen:

```
[API] 🚀 ═══════════════════════════════════════
[API] ✅ API Server running on http://localhost:3001
[API] 📊 Environment: development
[API] 🔑 Groq API Key: ✓ Configured
[API] 🔑 Gemini API Key: ✓ Configured
[API] ═══════════════════════════════════════

[VITE] VITE v5.4.11  ready in 123 ms
[VITE] ➜  Local:   http://localhost:3000/
[VITE] ➜  press h to show help
```

**Zwei Server laufen jetzt:**
- 🟢 **Vite Frontend:** http://localhost:3000
- 🔵 **Express API:** http://localhost:3001

### Schritt 3: Browser öffnen und testen

Gehe zu: **http://localhost:3000**

---

## 🔄 Data Flow

```
┌─────────────────────────────────────────────────────┐
│           BROWSER (React App - Port 3000)           │
│                                                     │
│  User schreibt Prompt → Klick "Generate"           │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ Fetch('/api/generate', {...})
                       │
┌──────────────────────▼──────────────────────────────┐
│  VITE DEV SERVER (Port 3000)                        │
│  Proxy: /api → http://localhost:3001                │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ Proxy leitet weiter zu:
                       │
┌──────────────────────▼──────────────────────────────┐
│  EXPRESS SERVER (Port 3001) 🔵                      │
│                                                     │
│  POST /api/generate                                 │
│  ├─ Validate request                               │
│  ├─ Call llmManager.generate()                      │
│  └─ Return JSON response                            │
│                                                     │
│  ├─ Groq Provider → llama-3.3-70b                  │
│  └─ Gemini Provider → gemini-2.0-flash             │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ Response JSON
                       │
┌──────────────────────▼──────────────────────────────┐
│  BROWSER: Display generated code                    │
└─────────────────────────────────────────────────────┘
```

---

## 📊 New npm Scripts

```bash
npm run dev                # 🟢 Beide Server starten (API + Vite)
npm run dev:api            # 🔵 Nur API Server (mit auto-reload)
npm run dev:vite           # 🟣 Nur Vite Frontend
npm run build              # 📦 Production build
npm run preview            # 👀 Preview production
npm run type-check         # ✅ TypeScript validation
```

---

## 🗂️ Neue Datei-Struktur

```
server/
├── index.ts                          ← 🔵 Express Server Eintrag
├── api/
│   ├── generate.ts                  ← 🟢 POST /api/generate Route
│   └── llm/
│       └── manager.ts               ← 🎯 LLMManager Class
└── utils/
    ├── config.ts
    └── helpers.ts

client/
├── src/
│   ├── App.tsx                      ← React App (unverändert)
│   ├── hooks/useLLM.ts              ← Custom Hook (unverändert)
│   ├── lib/llm-client.ts            ← API Client (unverändert)
│   └── ...

vite.config.ts                        ← ✅ Mit Proxy konfiguriert
package.json                          ← ✅ Mit neuen Scripts
.env                                  ← ✅ Mit API_PORT=3001
tsconfig.server.json                  ← ✅ TypeScript Server Config
```

---

## 🧪 Testen der API

### Test 1: Health Check
```bash
curl http://localhost:3001/api/health
```

Output:
```json
{
  "status": "ok",
  "timestamp": "2024-02-11T...",
  "uptime": 12.345,
  "environment": "development"
}
```

### Test 2: Code Generation (Groq)
```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "groq",
    "prompt": "Create a button component"
  }'
```

Output:
```json
{
  "success": true,
  "code": "import React from 'react'...",
  "provider": "groq",
  "timestamp": "2024-02-11T...",
  "duration": 3245,
  "meta": {
    "promptLength": 23,
    "codeLength": 456,
    "temperature": 0.7
  }
}
```

### Test 3: Im Browser
1. Gehe zu http://localhost:3000
2. Wähle Provider (Groq oder Gemini)
3. Gib Prompt ein
4. Klick "Generate"
5. Sieh den Code im rechten Panel

---

## 🔑 API Endpoints

### Health Check
```
GET /api/health
```

Response: `{ status: 'ok', ... }`

### Code Generation
```
POST /api/generate
Content-Type: application/json

{
  "provider": "groq" | "gemini",
  "prompt": "Your prompt here",
  "systemPrompt"?: "Optional system instruction",
  "temperature"?: 0.7,
  "maxTokens"?: 4096
}
```

Response:
```json
{
  "success": true,
  "code": "generated code here...",
  "provider": "groq",
  "timestamp": "2024-02-11T...",
  "duration": 3245,
  "meta": { ... }
}
```

---

## 🔧 Configuration

### Express Server
- **Port:** 3001 (default, changeable mit `API_PORT` env var)
- **CORS:** Erlaubt `localhost:3000` (Vite)
- **JSON Limit:** 10MB
- **Logging:** Alle Requests geloggt

### Vite Proxy
- **Route:** `/api`
- **Target:** `http://localhost:3001`
- **Rewrite:** `/api` prefix bleibt bestehen

### LLM Manager
- **Groq:** `llama-3.3-70b-versatile`
- **Gemini:** `gemini-2.0-flash-exp`
- **Error Handling:** Detaillierte Error Messages

---

## 🐛 Troubleshooting

### Problem: "Cannot find module 'express'"
```bash
# Lösung: Dependencies installieren
npm install
```

### Problem: "Port 3001 already in use"
```bash
# Lösung 1: Anderen Port
API_PORT=3002 npm run dev

# Lösung 2: Prozess killen (Windows)
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### Problem: "CORS error in browser"
- Check: Ist Express Server laufen? (http://localhost:3001/api/health)
- Check: Ist Vite Proxy richtig konfiguriert?
- Check: Browser Console auf Details

### Problem: "API antwortet mit 500 error"
- Check: `.env` - sind API Keys gesetzt?
- Server Terminal: Sieh Error Message
- Versuche `curl` test für debugging

### Problem: "Nodemon mit .ts Dateien"
```bash
# Falls "tsx" nicht installiert:
npm install -D tsx
```

---

## ✨ Features der neuen Architektur

✅ **Parallel Servers**
- Frontend (Vite) & Backend (Express) laufen zusammen
- Kein separates Terminal nötig

✅ **Auto-Reload**
- Frontend: HMR (Hot Module Replacement)
- Backend: Nodemon (auto-restart auf .ts Änderungen)

✅ **Proxy System**
- Client macht `/api` Requests
- Vite leitet zu Express weiter
- Keine CORS Issues während development

✅ **TypeScript Überall**
- Server + Client beide TypeScript
- Full type safety throughout

✅ **Professional Setup**
- Express best practices
- Proper error handling
- Request logging
- Health check endpoint

---

## 📈 Nächste Schritte

1. **Test:** `npm run dev` starten und im Browser testen
2. **Verify:** Beide Logs sehen?
3. **Try:** Code generation mit beiden Providern
4. **Build:** `npm run build` für production
5. **Deploy:** Vite + Express auf Hosting

---

## 📚 Wichtige Dateien

- **server/index.ts** - Express Server Main
- **server/api/generate.ts** - API Route Handler
- **server/api/llm/manager.ts** - LLM Integration
- **vite.config.ts** - Vite + Proxy Config
- **package.json** - Scripts + Dependencies
- **.env** - Environment Variables

---

**Status:** ✅ Backend Integration Complete!

Du hast jetzt ein **professionelles Full-Stack Setup** mit:
- 🟢 React Frontend (Vite)
- 🔵 Express Backend (API)
- 🎯 Multi-LLM Support
- 🔄 Parallel Development

**Viel Spaß!** 🚀
