# 🏗️ Neue Vite-Architektur - Komplette Struktur

## 📂 Verzeichnis-Baum

```
ai-builder/
├── client/                          # 🎨 Frontend (React + TypeScript)
│   ├── src/
│   │   ├── App.tsx                 # Main App Component
│   │   ├── main.tsx                # React Entry Point
│   │   ├── index.css               # Global Styles
│   │   │
│   │   ├── components/             # Reusable React Components
│   │   │   ├── CodeGenerator.tsx   # (Optional - add later)
│   │   │   └── ProviderSelector.tsx # (Optional - add later)
│   │   │
│   │   ├── hooks/
│   │   │   └── useLLM.ts           # ✅ Custom React Hook
│   │   │       - generate()
│   │   │       - generateStream()
│   │   │       - loading, error, response states
│   │   │
│   │   ├── lib/
│   │   │   ├── llm-client.ts       # ✅ API Client Class
│   │   │   │   - LLMClient.generate()
│   │   │   │   - LLMClient.generateStream()
│   │   │   └── utils.ts            # ✅ Client Utilities
│   │   │       - debounce(), throttle()
│   │   │       - copyToClipboard(), downloadFile()
│   │   │
│   │   └── config/
│   │       └── llm.ts              # ✅ LLM Configs
│   │           - LLM_PROVIDERS (Groq, Gemini)
│   │           - DEFAULT_SYSTEM_PROMPT
│   │
│   ├── index.html                  # ✅ HTML Entry Point
│   └── public/                     # Static Assets
│
├── server/                         # ⚡ Backend API Routes
│   ├── api/
│   │   ├── generate.ts             # ✅ Main API Route (POST /api/generate)
│   │   │   - Request validation
│   │   │   - LLM routing
│   │   │   - Response formatting
│   │   │   - Stream handling
│   │   │
│   │   ├── llm/
│   │   │   └── manager.ts          # ✅ LLM Manager Class
│   │   │       - Groq Provider handler
│   │   │       - Gemini Provider handler
│   │   │       - Error handling
│   │   │       - Token management
│   │   │
│   │   └── projects/               # (Optional - future expansion)
│   │       └── index.ts
│   │
│   ├── utils/
│   │   ├── config.ts               # ✅ Environment Configuration
│   │   │   - All env vars
│   │   │   - validateConfig()
│   │   └── helpers.ts              # ✅ Server Utilities
│   │       - logger()
│   │       - withTimeout()
│   │       - parseEnvInt()
│   │
│   └── index.ts                    # Server Entry Point
│
├── vite.config.ts                  # ✅ Vite Configuration
│   ├── React Plugin
│   ├── Port & HMR Settings
│   ├── Path Aliases (@, @components, @lib, @hooks)
│   ├── Build Options
│   └── Dev Server Settings
│
├── tsconfig.json                   # ✅ TypeScript Config
│   ├── Target: ES2020
│   ├── Strict Mode
│   ├── Path Aliases
│   └── React JSX Support
│
├── tsconfig.node.json              # ✅ Vite Build Config
│
├── tailwind.config.js              # ✅ Tailwind Configuration
│   ├── Content paths
│   ├── Theme extensions
│   ├── Dark mode
│   └── Custom colors
│
├── postcss.config.js               # ✅ PostCSS Config
│   └── Tailwind + Autoprefixer
│
├── package.json                    # ✅ Project Dependencies
│   ├── Scripts:
│   │   - npm run dev       (Vite dev server)
│   │   - npm run build     (Production build)
│   │   - npm run preview   (Preview build)
│   │   - npm run type-check (TS validation)
│   └── Dependencies:
│       - react, react-dom
│       - vite, typescript
│       - tailwindcss, postcss
│
├── .env                            # ✅ Environment Variables
│   ├── VITE_GROQ_API_KEY
│   ├── VITE_GEMINI_API_KEY
│   ├── NODE_ENV
│   ├── PORT
│   └── (Legacy Supabase vars)
│
├── .env.example                    # Environment Template
│
├── .gitignore                      # ✅ Git Ignore Rules
│
├── README.md                       # ✅ Project Documentation
│
├── SETUP.md                        # ✅ Installation Guide
│
├── ARCHITECTURE.md                 # 📄 This file
│
├── test-llm.ts                     # ✅ LLM Provider Tests
│   └── Test both Groq & Gemini
│
└── dist/                           # (Generated after npm run build)
    ├── index.html
    └── assets/
        ├── index-xxxxx.js
        └── index-xxxxx.css
```

---

## 🔄 Data Flow Diagramm

```
┌────────────────────────────────────────────────────────────┐
│                     BROWSER (Client)                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              React App (App.tsx)                      │  │
│  │  - Text input for prompt                             │  │
│  │  - Provider selector (Groq / Gemini)                 │  │
│  │  - Generate button                                   │  │
│  └────────────────┬──────────────────────────────────────┘  │
│                   │                                          │
│  ┌────────────────▼──────────────────────────────────────┐  │
│  │            useLLM Hook (Custom Hook)                  │  │
│  │  - generate(prompt, systemPrompt)                    │  │
│  │  - generateStream(prompt, onChunk)                   │  │
│  └────────────────┬──────────────────────────────────────┘  │
│                   │                                          │
│  ┌────────────────▼──────────────────────────────────────┐  │
│  │            LLMClient (API Client)                     │  │
│  │  - fetch('/api/generate', { ... })                   │  │
│  └────────────────┬──────────────────────────────────────┘  │
└────────────────┬──────────────────────────────────────────────┘
                 │ HTTP POST /api/generate
                 │
┌────────────────▼──────────────────────────────────────────────┐
│                    VITE SERVER                                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        API Route Handler (generate.ts)               │  │
│  │  - Parse request body                               │  │
│  │  - Validate provider & prompt                       │  │
│  │  - Route to LLMManager                              │  │
│  └────────────────┬──────────────────────────────────────┘  │
│                   │                                          │
│  ┌────────────────▼──────────────────────────────────────┐  │
│  │        LLM Manager (manager.ts)                       │  │
│  │                                                       │  │
│  │  ┌─────────────┐      ┌──────────────┐             │  │
│  │  │    Groq     │      │    Gemini    │             │  │
│  │  │  Provider   │      │   Provider   │             │  │
│  │  └─────────────┘      └──────────────┘             │  │
│  │        ▲                       ▲                    │  │
│  │        │                       │                    │  │
│  └────────┼───────────────────────┼────────────────────┘  │
│           │                       │                       │
└───────────┼───────────────────────┼───────────────────────┘
            │                       │
            ▼                       ▼
   ┌──────────────────┐   ┌──────────────────┐
   │  Groq Cloud API  │   │ Google Gemini API│
   │  llama-3.3-70b   │   │  gemini-2.0-flash│
   └──────────────────┘   └──────────────────┘
            │                       │
            │ Complete code         │ Complete code
            │                       │
            └───────────┬───────────┘
                        │
                        ▼
         ┌──────────────────────────┐
         │  Response JSON           │
         │  { code, provider, ... } │
         └──────────────┬───────────┘
                        │
                        │ HTTP Response
                        │
         ┌──────────────▼───────────┐
         │ Client receives response │
         │ - Display in code panel  │
         │ - Update UI              │
         │ - Show success message   │
         └──────────────────────────┘
```

---

## 🎯 Key Components & ihre Aufgaben

### Frontend

| Datei | Aufgabe | Wichtigste Exports |
|-------|---------|------------------|
| `App.tsx` | Main UI Component | `<App />` |
| `hooks/useLLM.ts` | Custom React Hook | `useLLM()` |
| `lib/llm-client.ts` | API Client Class | `llmClient`, `LLMClient` |
| `config/llm.ts` | Provider Configs | `LLM_PROVIDERS`, `DEFAULT_SYSTEM_PROMPT` |
| `lib/utils.ts` | Helper Functions | `debounce()`, `throttle()`, `copyToClipboard()` |

### Backend

| Datei | Aufgabe | Wichtigste Exports |
|-------|---------|------------------|
| `api/generate.ts` | API Route Handler | `default` (handler function) |
| `api/llm/manager.ts` | LLM Manager Class | `llmManager`, `LLMManager` |
| `utils/config.ts` | Environment Config | `config`, `validateConfig()` |
| `utils/helpers.ts` | Server Utilities | `logger()`, `withTimeout()`, `parseEnvInt()` |

---

## 💾 Environment Variables

| Variable | Typ | Beschreibung |
|----------|-----|-------------|
| `VITE_GROQ_API_KEY` | String | Groq API Key (client-side) |
| `VITE_GEMINI_API_KEY` | String | Gemini API Key (client-side) |
| `NODE_ENV` | String | `development` \| `production` |
| `PORT` | Number | Server Port (default: 3000) |
| `CORS_ORIGINS` | String | Comma-separated CORS origins |
| `LOG_LEVEL` | String | `info` \| `error` \| `warn` |

---

## 🚀 Build & Deployment

### Development Build
```bash
npm run dev
```
- Hot Module Replacement (HMR) aktiviert
- Source Maps für Debugging
- Vite Dev Server auf Port 3000

### Production Build
```bash
npm run build
```
- Minified JavaScript & CSS
- Asset optimization
- Tree-shaking von unused code
- Output in `dist/` folder

### Preview Production Build
```bash
npm run preview
```
- Simuliert production build lokal

---

## 🧠 Wichtigste Design Entscheidungen

✅ **TypeScript überall**
- Bessere DX (Developer Experience)
- Type safety
- IDE Suggestions

✅ **Modular Architecture**
- Separated concerns (UI, API, Config)
- Easy to test
- Easy to extend

✅ **Dual-Provider LLM**
- Redundancy (if one fails, use other)
- Cost optimization (cheaper alternatives)
- Performance comparison

✅ **No State Management Library**
- React hooks genügen für diese Größe
- Weniger Dependencies
- Schnelleres Development

✅ **Vite instead of Create React App**
- 10x schneller dev server
- Better HMR
- Modern tooling
- Smaller bundle size

---

## 📈 Erweiterungspunkte (Future)

1. **Database Integration**
   - Supabase für Project Storage
   - User Authentication
   
2. **More LLM Providers**
   - OpenAI API
   - Anthropic Claude
   - Ollama (local)

3. **Code Features**
   - Code syntax highlighting
   - Real-time linting
   - Code formatting (Prettier)

4. **UI Enhancements**
   - Dark mode toggle
   - File explorer
   - Multiple tabs

5. **DevOps**
   - GitHub Actions CI/CD
   - Vercel auto-deployment
   - Error monitoring (Sentry)

---

**Erstellt:** 2024-02-11  
**Vite Version:** 5.4.11  
**React Version:** 18.3.1  
**Node:** >=18.0.0
