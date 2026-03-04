# AI Builder - Vite v2 (Phase 2: Production Code Processing)

Modern AI Code Generator with multi-LLM support (Gemini + OpenAI) and **production-ready code validation & bundling pipeline**.

## 🏗️ Architecture (Updated Phase 2)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER (React + TS)                         │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              App.tsx (3-Panel UI)                          │   │
│  │  [Input] | [Code Tab] | [Files Tab] | [Info Tab]        │   │
│  │  - Provider select     - Generated code        - Deps     │   │
│  │  - Prompt input        - Error display        - Components│   │
│  │  - Validate toggle     - Warning display      - Metadata  │   │
│  └────────────────────────────────────────────────────────────┘   │
│                             │ WebSocket
└─────────────────────────────┼─────────────────────────────────────┘
                              │ GET / POST /api/*
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    VITE DEV SERVER (Port 3000)                       │
│                  (Proxy: /api → localhost:3001)                      │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│               EXPRESS BACKEND API (Port 3001)                       │
│                                                                   │
│  routes/generate.ts                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1️⃣  GENERATE: LLMManager.generate()                    │   │
│  │     ↓                                                  │   │
│  │ 2️⃣  VALIDATE: CodeProcessor.validateCode() [ts-morph]│   │
│  │     ↓                                                  │   │
│  │ 3️⃣  BUNDLE: CodeProcessor.bundleCode() [esbuild]     │   │
│  │     ↓                                                  │   │
│  │ 4️⃣  EXTRACT: Components, Dependencies                │   │
│  │     ↓                                                  │   │
│  │ 5️⃣  GENERATE: package.json, index.html              │   │
│  │     ↓                                                  │   │
│  │ RESPONSE: ProcessedCode (with metadata)              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  LLMManager (llm/manager.ts)                                    │
│  ├─ OpenAI API (gpt-4o)                         │
│  └─ Gemini API (gemini-2.0-flash)                              │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
/                          # Root
├── client/               # Frontend (Vite + React)
│   ├── src/
│   │   ├── App.tsx              # Main 3-panel UI with tabs
│   │   ├── main.tsx            # Entry point
│   │   ├── index.css           # Tailwind directives
│   │   ├── components/         # React components
│   │   ├── hooks/
│   │   │   └── useLLM.ts       # Hook: generate, generateStream, loading, error, response
│   │   ├── lib/
│   │   │   ├── llm-client.ts   # API client with ProcessedCode types
│   │   │   └── utils.ts        # Utilities (debounce, copyToClipboard, etc)
│   │   └── config/
│   │       └── llm.ts          # LLM_PROVIDERS config
│   ├── index.html
│   └── vite.config.ts   # Vite config with API proxy
│
├── server/               # Backend API (Express + TypeScript)
│   ├── index.ts                    # Express app main entry
│   ├── api/
│   │   ├── generate.ts            # POST /api/generate route (uses CodeProcessor)
│   │   └── llm/
│   │       └── manager.ts         # LLMManager (Gemini + OpenAI)
│   └── utils/
│       ├── code-processor.ts      # 🆕 Production code processing pipeline
│       ├── config.ts
│       ├── helpers.ts
│       └── logger.ts
│
├── tests/
│   └── test-code-processor.ts     # 🆕 Test suite for ComputeProcessor
│
├── vite.config.ts        # Frontend build config
├── tsconfig.json         # Main TypeScript config
├── tsconfig.server.json  # Server TypeScript config
├── package.json          # Dependencies + scripts
├── .env                  # Environment variables
├── .env.example          # Example env template
├── tailwind.config.js    # Tailwind CSS config
├── postcss.config.js     # PostCSS config
│
├── PHASE_2_SUMMARY.md                # Phase 2 completion guide
├── CODE_PROCESSING_PIPELINE.md       # Detailed pipeline documentation
├── BACKEND_IMPLEMENTATION.md         # Backend architecture
├── README.md                         # This file
└── ...
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- Frontend: React 18, TypeScript, Vite, Tailwind CSS
- Backend: Express, CORS
- Code Processing: esbuild (bundling), ts-morph (validation)
- Dev: Nodemon, concurrently

### 2. Configure API Keys

Create `.env` from `.env.example`:
```bash
OPENAI_API_KEY=sk-proj-xxx...
GEMINI_API_KEY=AIzaSy...
# Optional (if Gemini is routed via OpenRouter)
OPENROUTER_API_KEY=or-xxx...
API_PORT=3001
NODE_ENV=development
```

### 3. Start Development (Both Servers)

```bash
npm run dev
```

This starts:
- **Vite Dev Server** on `http://localhost:3000` (React + HMR)
- **Express API Server** on `http://localhost:3001` (with Nodemon auto-reload)

Both run in parallel with colored output.

### 4. Access the Application

Open `http://localhost:3000` in your browser

### 5. Test the Pipeline

```bash
npm run test:processor
```

---

## 📦 API Routes

### POST /api/generate

Generate and process code using LLM with validation pipeline.

**Request:**
```json
{
  "provider": "gemini" | "openai",
  "prompt": "Create a React counter component with Tailwind styling",
  "systemPrompt": "You are an expert React developer",
  "temperature": 0.7,
  "maxTokens": 4096,
  "validate": true,
  "bundle": true
}
```

**Response (Phase 2):**
```json
{
  "success": true,
  "code": "export function Counter() { ... }",
  "files": [
    {
      "path": "package.json",
      "content": "{...}",
      "type": "json",
      "size": 652
    },
    {
      "path": "index.html",
      "content": "<!DOCTYPE html>...",
      "type": "html",
      "size": 385
    }
  ],
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwindcss": "^3.4.11"
  },
  "components": ["Counter"],
  "errors": [],
  "warnings": [],
  "provider": "openai",
  "timestamp": "2024-02-15T10:30:00.000Z",
  "duration": 2500,
  "processingTime": 150
}
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-02-15T10:30:00.000Z",
  "uptime": 123.456,
  "environment": "development"
}
```

---

## 🎯 Features (Phase 2 Enhanced)

### ✅ Multi-LLM Support
- **OpenAI** (gpt-4o) - High quality and reliable
- **Google Gemini** (gemini-2.0-flash) - Advanced reasoning

### ✅ Production Code Processing Pipeline
- **TypeScript Validation** - ts-morph diagnostics
- **Code Bundling** - esbuild ES2020 transpilation
- **Component Extraction** - React component detection
- **Dependency Resolution** - Auto version mapping
- **File Generation** - package.json + index.html

### ✅ Advanced Frontend UI
- **3-Panel Layout** - Input, Output, Info sections
- **Tabbed Output** - Code, Files, Info tabs
- **Real-time Validation** - Error/warning display
- **Metadata Tracking** - Duration, component count, dependency count
- **Responsive Design** - Works on desktop and tablet

### ✅ Modern Stack
- Vite for **blazing fast development** (HMR < 100ms)
- React 18 with **TypeScript strict mode**
- Tailwind CSS for **rapid styling**
- Express API with **comprehensive error handling**

### ✅ Developer Experience
- Hot Module Replacement (HMR) for instant updates
- Parallel npm scripts (dev:api + dev:vite)
- Color-coded terminal output
- Comprehensive test suite

---

## 📊 Pipeline Processing Steps

1. **Input Validation** ✅
   - Check provider (gemini/openai)
   - Validate prompt exists
   - Check API keys configured

2. **Code Generation** ✅
   - Call LLM provider
   - Stream or batch mode
   - Track timing

3. **TypeScript Validation** ✅
   - Extract diagnostics
   - Collect errors
   - Identify warnings

4. **Code Bundling** ✅
   - Transpile to ES2020
   - Handle JSX/TSX
   - Minify (optional)

5. **Component Extraction** ✅
   - Find React components
   - Extract exports
   - Detect hooks

6. **Dependency Resolution** ✅
   - Parse imports
   - Map to npm packages
   - Resolve versions

7. **File Generation** ✅
   - Create package.json
   - Generate index.html
   - Create entry points

8. **Response Assembly** ✅
   - Collect all metadata
   - Include error details
   - Calculate timing

---

## 📝 Scripts

```bash
npm run dev              # Start both servers (Vite + Express)
npm run dev:api         # Start Express API only with Nodemon
npm run dev:vite        # Start Vite dev server only
npm run build           # Build for production
npm run preview         # Preview production build
npm run type-check      # Check TypeScript types
npm run test:processor  # Run CodeProcessor test suite
npm run test:golden     # Golden regression (plan + composition + quality)
npm run test:golden:update # Refresh golden baseline after intended changes
npm run ci              # Required CI gates (typecheck + core tests + smoke build)
npm run ci:core         # Core regression checks
npm run ci:smoke        # Build smoke test
npm test                # Run all tests
```

---

## 🔧 Configuration

### Vite Config (`vite.config.ts`)
- **API Proxy:** `/api` → `http://localhost:3001`
- **Path Aliases:** `@`, `@components`, `@lib`, `@hooks`, `@config`
- **React Plugin:** Full JSX + Fast Refresh support
- **Port:** 3000
- **HMR:** Configured for development

### TypeScript
- **Target:** ES2020 (broad browser support)
- **Strict Mode:** Enabled (type safety)
- **JSX:** React 18 automatic runtime
- **Module:** ESNext

### Express
- **Port:** 3001 (for API)
- **CORS:** Allowed from localhost:3000
- **Body Parser:** 10MB limit JSON
- **Logging:** All requests logged
- **Release Control:** Canary + Kill-Switch (`/api/release/status`, `/api/release/control`)

---

## 🧪 Testing

### Test Code Processor

```bash
npm run test:processor
```

Tests include:
- ✅ Basic code processing
- ✅ File generation
- ✅ Dependency resolution
- ✅ Component extraction
- ✅ Error handling
- ✅ Invalid code detection

### Manual Testing

```bash
# Generate with validation
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "prompt": "Create a Button component",
    "validate": true,
    "bundle": true
  }'

# Check health
curl http://localhost:3001/api/health
```

---

## 📦 Dependencies

### Runtime
- `react` ^18.3.1 - UI library
- `react-dom` ^18.3.1 - React rendering
- `express` ^4.22.1 - Web framework
- `cors` ^2.8.5 - CORS middleware
- `dotenv` ^16.0.3 - Environment variables
- `esbuild` ^0.20.2 - Bundler/transpiler
- `ts-morph` ^21.0.1 - TypeScript AST manipulation

### Dev
- `vite` ^5.4.11 - Build tool
- `typescript` ^5.6.3 - Type checking
- `tailwindcss` ^3.4.11 - CSS framework
- `@vitejs/plugin-react` ^4.3.4 - React support
- `nodemon` ^3.1.4 - Auto-reload
- `concurrently` ^8.2.2 - Run parallel tasks

---

## 🌐 API Response Examples

### Successful Generation with Processing

```json
{
  "success": true,
  "code": "import React, { useState } from 'react';\n\nexport function Counter() {\n  const [count, setCount] = useState(0);\n  return (\n    <div className=\"flex flex-col items-center gap-4 p-8\">\n      <h1>Count: {count}</h1>\n      <button onClick={() => setCount(count + 1)} className=\"px-4 py-2 bg-blue-500 text-white rounded\">\n        Increment\n      </button>\n    </div>\n  );\n}",
  "files": [
    {
      "path": "package.json",
      "content": "{\"name\":\"counter-app\",\"version\":\"0.1.0\",\"type\":\"module\",\"scripts\":{\"dev\":\"vite\",\"build\":\"vite build\"},\"dependencies\":{\"react\":\"^18.3.1\",\"react-dom\":\"^18.3.1\"},\"devDependencies\":{\"vite\":\"^5.4.11\",\"@vitejs/plugin-react\":\"^4.3.4\",\"typescript\":\"^5.6.3\"}}",
      "type": "json",
      "size": 345
    },
    {
      "path": "index.html",
      "content": "<!DOCTYPE html>\n<html lang=\"en\">\n<head><meta charset=\"UTF-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>Generated App</title></head>\n<body><div id=\"root\"></div><script type=\"module\" src=\"/main.tsx\"></script></body>\n</html>",
      "type": "html",
      "size": 245
    }
  ],
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "components": ["Counter"],
  "errors": [],
  "warnings": [],
  "provider": "openai",
  "timestamp": "2024-02-15T10:30:00.000Z",
  "duration": 2456,
  "processingTime": 145
}
```

### Error Response

```json
{
  "success": false,
  "error": "Missing required field: provider",
  "code": "MISSING_PROVIDER",
  "provider": "unknown",
  "timestamp": "2024-02-15T10:30:00.000Z",
  "duration": 12
}
```

---

## 📖 Usage Examples

### Using the React Hook

```typescript
import { useLLM } from '@hooks/useLLM';

export function GeneratorPage() {
  const [prompt, setPrompt] = useState('');
  const { generate, loading, error, response } = useLLM({
    provider: 'openai',
    temperature: 0.7
  });

  const handleGenerate = async () => {
    await generate(prompt, undefined, { 
      validate: true, 
      bundle: true 
    });
  };

  return (
    <div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your component..."
      />
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate'}
      </button>
      
      {response && (
        <div>
          <h2>Generated Code</h2>
          <pre>{response.code}</pre>
          <h3>Dependencies</h3>
          <ul>
            {Object.entries(response.dependencies || {}).map(([pkg, ver]) => (
              <li key={pkg}>{pkg}: {ver}</li>
            ))}
          </ul>
          <h3>Components</h3>
          <ul>
            {response.components?.map(comp => (
              <li key={comp}>{comp}</li>
            ))}
          </ul>
        </div>
      )}
      
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
    </div>
  );
}
```

### Direct API Call

```typescript
const response = await fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'gemini',
    prompt: 'Create a form component with validation',
    validate: true,
    bundle: true
  })
});

const data = await response.json();

if (data.success) {
  console.log('Generated code:', data.code);
  console.log('Dependencies:', data.dependencies);
  console.log('Components:', data.components);
  console.log('Processing time:', data.processingTime + 'ms');
}
```

---

## 🔐 Security

- API keys stored in `.env` (add to .gitignore)
- Environment variables prefixed with `VITE_` for client-side access
- CORS configured for localhost development only
- Input validation on all API routes
- Error messages don't expose sensitive information

---

## 📊 Performance Metrics

Typical measurements on modern hardware:

| Operation | Time |
|-----------|------|
| LLM Generation (OpenAI) | 800-1500ms |
| LLM Generation (Gemini) | 1500-3000ms |
| TypeScript Validation | 50-150ms |
| Code Bundling | 50-100ms |
| Dependency Extraction | <10ms |
| File Generation | <10ms |
| **Total Pipeline** | **1200-3300ms** |

HMR time: <100ms (for local changes)

---

## 🛠️ Troubleshooting

**Port 3000/3001 already in use?**
```bash
# Kill process on port 3001 (Windows)
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Or use different port
API_PORT=3002 npm run dev
```

**API errors in console?**
- Check API keys in `.env`
- Verify internet connection
- Try the other LLM provider
- Check `npm run dev:api` terminal for backend errors

**TypeScript errors?**
```bash
npm run type-check
```

**Vite not updating?**
Check `vite.config.ts` HMR settings and firewall

---

## 📚 Further Documentation

- [PHASE_2_SUMMARY.md](./PHASE_2_SUMMARY.md) - Phase 2 completion details
- [CODE_PROCESSING_PIPELINE.md](./CODE_PROCESSING_PIPELINE.md) - Processing pipeline architecture
- [BACKEND_IMPLEMENTATION.md](./BACKEND_IMPLEMENTATION.md) - Backend setup guide
- [BACKEND_SETUP.md](./BACKEND_SETUP.md) - Backend configuration
- [CI_GATES.md](./CI_GATES.md) - CI Go/No-Go criteria and pipeline gates

---

## 🔮 Roadmap (Phase 3+)

- [ ] Database persistence (Supabase)
- [ ] User authentication (social login)
- [ ] Project version control
- [ ] GitHub export/import
- [ ] Streaming responses
- [ ] WebSocket support
- [ ] Docker containerization
- [ ] Cloud deployment (Vercel/Railway)
- [ ] Team collaboration
- [ ] Advanced code analysis

---

## 📝 License

MIT

---

**Version:** 2.0 (Phase 2: Production Code Processing)

Built with ❤️ using Vite + React + TypeScript + Express

Last Updated: 2024



