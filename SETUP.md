# SETUP ANLEITUNG - AI Builder Vite V2

## 📋 Schritt-für-Schritt Installation

### 1️⃣ Project Dependencies installieren

```bash
npm install
```

**Was wird installiert:**
- ✅ Vite (Build Tool)
- ✅ React 18 + ReactDOM
- ✅ TypeScript
- ✅ Tailwind CSS
- ✅ Autoprefixer & PostCSS

### 2️⃣ API Keys konfigurieren

**Datei:** `.env`

```env
# Groq API
VITE_GROQ_API_KEY=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

# Google Gemini API
VITE_GEMINI_API_KEY=AIzaSyAeTx0UY7RWJwA8WbgqDSpRwmy0jxJlcCk
```

**ℹ️ Wichtig:**
- Diese Keys sind für development bereits konfiguriert
- Für production: Use secure key management (GitHub Secrets, etc.)
- Variable mit `VITE_` prefix sind client-side verfügbar

### 3️⃣ Development Server starten

```bash
npm run dev
```

**Output:**
```
  VITE v5.4.11  ready in 123 ms

  ➜  Local:   http://localhost:3000/
  ➜  press h to show help
```

**Browser öffnen:**
- Gehe zu: `http://localhost:3000`
- Siehst du die UI mit zwei LLM Provider Buttons? ✅

### 4️⃣ Code Generation testen

**Im Browser:**
1. Wähle einen Provider: **Groq** oder **Gemini**
2. Gib einen Prompt ein: `"Create a button component"`
3. Klick auf **"🚀 Generate"**
4. Warte auf die Antwort (sollte ~5-10 Sekunden dauern)

**Erwartetes Ergebnis:**
```
✅ Generated Code wird im rechten Panel angezeigt
```

### 5️⃣ Hot Module Replacement (HMR) testen

**Während dev Server läuft:**
1. Editiere `client/src/App.tsx`
2. Ändere z.B. die Überschrift
3. **Reload ist automatisch!** (kein manueller Refresh nötig)

### 6️⃣ TypeScript Types validieren

```bash
npm run type-check
```

**Sollte keine Fehler zeigen!**

---

## 🏗️ Neue Architektur übersicht

### Client (Frontend)

```
client/src/
├── App.tsx                 ← Main React Component (UI)
├── main.tsx               ← Entry Point (React DOM)
├── index.css              ← Global Styles
├── components/            ← Reusable Components
├── hooks/
│   └── useLLM.ts         ← Custom Hook für LLM Requests
├── lib/
│   ├── llm-client.ts     ← API Client (Fetch wrapper)
│   └── utils.ts          ← Helper Functions
└── config/
    └── llm.ts            ← LLM Provider Configs
```

### Server (API Routes)

```
server/
├── api/
│   ├── generate.ts       ← Main API Endpoint (POST /api/generate)
│   └── llm/
│       └── manager.ts    ← LLMManager Class (Groq + Gemini)
└── utils/
    ├── config.ts         ← Environment Config
    └── helpers.ts        ← Server Utilities
```

---

## 🧪 API Ende-zu-Ende (E2E) Test

```bash
node test-llm.ts
```

**Script testet:**
1. ✅ Groq Provider connection
2. ✅ Gemini Provider connection
3. ✅ Response parsing
4. ✅ Error handling

**Erwartete Output:**
```
🧪 Testing LLM Providers...

1️⃣ Testing Groq Provider...
✅ Groq Response:
import React from 'react'...

2️⃣ Testing Gemini Provider...
✅ Gemini Response:
function Button() {...

🎉 Tests completed!
```

---

## 📦 Production Build

```bash
npm run build
```

**Erzeugt:**
```
dist/
├── index.html
├── assets/
│   ├── index-xxxxx.js   ← Bundled JavaScript
│   └── index-xxxxx.css  ← Bundled CSS
```

**Preview vor deployment:**
```bash
npm run preview
```

---

## 🔧 Vite Config Deep Dive

### Port & HMR Settings
```typescript
server: {
  port: 3000,
  hmr: {
    host: 'localhost',
    port: 3000
  }
}
```

### Path Aliases
```typescript
alias: {
  '@': './client/src',           // @/App.tsx
  '@components': './client/src/components',
  '@lib': './client/src/lib',
  '@hooks': './client/src/hooks'
}
```

### TypeScript Support
```typescript
plugins: [react()]  // Automatic JSX transformation
```

---

## 🚀 Schnelle Commands Referenz

```bash
npm run dev         # 🟢 Start dev server (HMR enabled)
npm run build       # 📦 Build for production
npm run preview     # 👀 Preview production build
npm run type-check  # ✅ Check TypeScript types
npm run lint        # 🔍 Run ESLint (if configured)
```

---

## 💡 Häufige Probleme & Lösungen

### Problem: "Port 3000 already in use"
```bash
# Option 1: Anderen Port verwenden
npm run dev -- --port 3001

# Option 2: Prozess auf Port 3000 killen (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Problem: "API Requests schlagen fehl"
- [ ] Check `.env` - sind API Keys gesetzt?
- [ ] Browser Console - Network Tab für Details
- [ ] Run `node test-llm.ts` zur Diagnose

### Problem: "HMR funktioniert nicht"
- [ ] Vite Server laufen? (Terminal log prüfen)
- [ ] Browser Dev Tools - Console auf Fehler prüfen
- [ ] Hard Refresh: `Ctrl+Shift+R` (Windows)

### Problem: "TypeScript Fehler"
```bash
npm run type-check     # Alle Fehler auflisten
```

---

## 📚 Extra Resources

- **Vite Docs:** https://vitejs.dev
- **React Docs:** https://react.dev
- **Tailwind:** https://tailwindcss.com
- **TypeScript:** https://www.typescriptlang.org

---

## ✨ Fertig!

Du hast erfolgreich ein modernes **Vite + React + TypeScript** Projekt mit **Multi-LLM Support** aufgesetzt! 🎉

**Nächste Schritte:**
1. 🎨 Custom Components erstellen (`client/src/components/`)
2. 🔌 Weitere API Routes hinzufügen (`server/api/`)
3. 🗄️ Database Integration (Supabase/Firebase)
4. 🚀 Deploy zu `vercel` oder `netlify`

---

**Happy Coding!** 🚀
