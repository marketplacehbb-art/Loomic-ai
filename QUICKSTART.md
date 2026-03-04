# 🚀 QUICK START - 5 Minuten Setup

## 1️⃣ Dependencies installieren
```bash
npm install
```
⏱️ Dauert ~2-3 Minuten (abhängig von Internet)

## 2️⃣ Dev Server starten
```bash
npm run dev
```

**Output sollte so aussehen:**
```
  VITE v5.4.11  ready in 123 ms

  ➜  Local:   http://localhost:3000/
  ➜  press h to show help
```

## 3️⃣ Browser öffnen
Gehe zu: **http://localhost:3000**

Du solltest sehen:
```
┌─────────────────────────────────────────┐
│         🤖 AI Code Generator             │
│                                          │
│  ┌────────────────┐                     │
│  │ ⚡ Groq ✨ Gemini │                  │
│  └────────────────┘                     │
│                                          │
│  [Dein Prompt hier...]                  │
│  [🚀 Generate Button]                   │
└─────────────────────────────────────────┘
```

## 4️⃣ Erste Code Generation testen

1. **Provider wählen:** Klick auf "Groq" oder "Gemini"
2. **Prompt eingeben:** `"Create a button component in React"`
3. **Generate klicken:** 🚀
4. **Warten:** ~5-10 Sekunden
5. **Code sehen:** Rechter Panel zeigt Generated Code

## 5️⃣ HMR testen (Optional)

Während Server läuft:
1. Öffne: `client/src/App.tsx`
2. Ändere die Überschrift von `"AI Code Generator"` zu `"My AI App"`
3. **BOOM!** Browser updated automatisch (keine Refresh nötig) ⚡

---

## 📊 Was wurde installiert?

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "vite": "^5.4.11",
    "typescript": "^5.6.3",
    "tailwindcss": "^3.4.11",
    "@vitejs/plugin-react": "^4.3.4"
  }
}
```

---

## 🎯 Was funktioniert jetzt?

✅ Vite Dev Server mit HMR  
✅ React + TypeScript Setup  
✅ Tailwind CSS Styling  
✅ Groq API Integration  
✅ Gemini API Integration  
✅ Multi-LLM Code Generator  

---

## 🔧 Wichtigste NPM Commands

```bash
npm run dev       # 🟢 Dev Server starten
npm run build     # 📦 Production Build
npm run preview   # 👀 Preview nach build
npm run type-check # ✅ TypeScript Validation
```

---

## 📁 Wichtigste Dateien zu kennen

| Datei | Zweck |
|-------|-------|
| `client/src/App.tsx` | Main UI |
| `server/api/generate.ts` | API Endpoint |
| `server/api/llm/manager.ts` | LLM Logic |
| `vite.config.ts` | Build Config |
| `.env` | API Keys |

---

## 🆘 Falls was nicht funktioniert

### Server startet nicht?
```bash
# Kill process auf Port 3000
# Windows PowerShell:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Dann neu starten:
npm run dev
```

### API gibt Error?
- Check `.env` - sind API Keys gesetzt?
- Run: `node test-llm.ts`
- Check Browser Console (F12)

### HMR funktioniert nicht?
- Hard Refresh: `Ctrl+Shift+R`
- Dev Tools neuladen

---

## 🎓 Nächste Schritte

Nachdem alles funktioniert:

1. **Neue Components erstellen**
   ```typescript
   // client/src/components/MyComponent.tsx
   export function MyComponent() {
     return <div>Hello</div>
   }
   ```

2. **Neue API Routes erstellen**
   ```typescript
   // server/api/myroute.ts
   export default async function handler(req) {
     return Response.json({ message: 'Hi' })
   }
   ```

3. **Styles anpassen**
   ```css
   /* client/src/index.css */
   @apply your-tailwind-classes;
   ```

---

## 📚 Dokumentation Links

- 📖 [README.md](./README.md) - Detaillierte Dokumentation
- 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md) - System Design
- 📋 [SETUP.md](./SETUP.md) - Installation Details

---

**Congratulations!** 🎉  
Dein Vite + React + Multi-LLM Projekt ist ready to go!

**Viel Spaß beim Coden!** 🚀
