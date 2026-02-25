import { Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

export default function Home() {
  const { toggleTheme } = useTheme();

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 transition-colors duration-300 antialiased min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-slate-200 dark:border-white/10 bg-white/70 dark:bg-black/20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Nur Logo links */}
          <div className="flex items-center">
            <div className="w-10 h-10 bg-brand-purple rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-2xl">rocket_launch</span>
            </div>
          </div>
          {/* Navigation mittig: nur Features und Pricing */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-white">
            <a className="hover:text-brand-purple transition-colors" href="#features">Features</a>
            <a className="hover:text-brand-purple transition-colors" href="#">Pricing</a>
          </div>
          {/* Buttons rechts: weiß im Darkmode */}
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-600 dark:text-white" onClick={toggleTheme}>
              <span className="material-symbols-outlined dark:hidden">dark_mode</span>
              <span className="material-symbols-outlined hidden dark:block">light_mode</span>
            </button>
            <Link className="text-sm font-semibold px-4 py-2 text-slate-600 dark:text-white hover:text-brand-purple dark:hover:text-brand-purple transition-colors" to="/login">Sign In</Link>
            <Link className="bg-brand-purple hover:bg-indigo-600 text-white text-sm font-semibold px-6 py-3 rounded-full transition-all shadow-lg shadow-brand-purple/20" to="/register">Sign Up</Link>
          </div>
        </div>
      </nav>
      <main className="relative overflow-hidden pt-16 flex-1">
        {/* Hero Section */}
        <section className="relative pt-24 pb-32 px-6 hero-gradient">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center space-x-2 bg-brand-purple/10 border border-brand-purple/20 px-4 py-1.5 rounded-full mb-8">
              <span className="flex h-2 w-2 rounded-full bg-brand-purple animate-pulse"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-purple">Full TypeScript Support Enabled</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight leading-tight">
              Your Idea. Your Code.<br />
              <span className="text-brand-purple text-glow">Instantly.</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Turn your vision into reality with type-safe, production-ready code. Just type and watch the magic happen.
            </p>
            <div className="max-w-3xl mx-auto relative">
              <div className="absolute -top-4 -right-4 z-20 flex items-center justify-center bg-[#3178C6] text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg border border-white/20 transform rotate-12">
                TS TYPE-SAFE
              </div>
              <div className="p-2 glass rounded-2xl shadow-2xl border-white/5 relative z-10">
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="flex-grow flex items-start">
                    <textarea className="w-full bg-transparent border-none focus:ring-0 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 p-4 min-h-[100px] md:min-h-[auto] resize-none" placeholder="Describe your dream project... (e.g. A TypeScript Dashboard with Real-time Analytics)"></textarea>
                  </div>
                  <Link to="/login" className="bg-brand-purple hover:bg-indigo-600 text-white font-bold py-4 px-8 rounded-xl flex items-center justify-center space-x-2 transition-all group shrink-0">
                    <span>Generate App</span>
                    <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Features Section */}
        <section className="py-32 px-6 relative" id="features">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">Why Loomic?</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto text-lg leading-relaxed">
                Develop faster, iterate quicker, and launch earlier with AI-powered development optimized for TypeScript.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="group relative glass p-8 rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:bg-white/[0.05] hover:border-white/20">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-purple/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-brand-purple/20 border border-brand-purple/30 rounded-2xl flex items-center justify-center mb-8 shadow-inner group-hover:scale-110 transition-transform duration-300">
                    <span className="material-symbols-outlined text-brand-purple text-3xl">code</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-slate-900 dark:text-white">Multi-File Editor</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    Edit .ts, .tsx, HTML, and CSS files directly in the browser. Our powerful editor offers enterprise-grade syntax highlighting and auto-formatting.
                  </p>
                </div>
              </div>
              {/* Feature 2 */}
              <div className="group relative glass p-8 rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:bg-white/[0.05] hover:border-white/20">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mb-8 shadow-inner group-hover:scale-110 transition-transform duration-300">
                    <span className="material-symbols-outlined text-blue-400 text-3xl">visibility</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-slate-900 dark:text-white">Instant Live Preview</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    See your changes in real-time with instant hot reloading. Test your app immediately in a secure, pre-configured TypeScript environment.
                  </p>
                </div>
              </div>
              {/* Feature 3 */}
              <div className="group relative glass p-8 rounded-3xl transition-all duration-300 hover:-translate-y-2 hover:bg-white/[0.05] hover:border-white/20">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-teal/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-brand-teal/20 border border-brand-teal/30 rounded-2xl flex items-center justify-center mb-8 shadow-inner group-hover:scale-110 transition-transform duration-300">
                    <span className="material-symbols-outlined text-brand-teal text-3xl">layers</span>
                  </div>
                  <h3 className="text-2xl font-bold mb-4 text-slate-900 dark:text-white">Modern Tech Stack</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    Use Tailwind CSS for fast styling and Full TypeScript Support. Clean, performant, and type-safe code ready for production.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Call to Action Section */}
        <section className="py-24 px-6">
          <div className="max-w-5xl mx-auto rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-brand-purple/10"></div>
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-brand-purple/20 blur-3xl rounded-full"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-brand-teal/10 blur-3xl rounded-full"></div>
            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-bold mb-8 tracking-tight">Ready to build your next big thing?</h2>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link className="w-full sm:w-auto px-10 py-4 bg-brand-purple hover:bg-indigo-600 text-white font-bold rounded-2xl transition-all transform hover:scale-105 shadow-xl shadow-brand-purple/20" to="/login">
                  Start Coding in TS
                </Link>
                <a className="w-full sm:w-auto px-10 py-4 glass hover:bg-white/10 text-slate-900 dark:text-white font-bold rounded-2xl transition-all" href="#">
                  View Examples
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-white/10 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-brand-purple rounded flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-xs">rocket_launch</span>
            </div>
            <span className="font-bold tracking-tight">Loomic</span>
          </div>
          <div className="flex space-x-8 text-sm text-slate-500 dark:text-slate-400">
            <a className="hover:text-brand-purple transition-colors" href="#">Privacy</a>
            <a className="hover:text-brand-purple transition-colors" href="#">Terms</a>
            <a className="hover:text-brand-purple transition-colors" href="#">Twitter</a>
            <a className="hover:text-brand-purple transition-colors" href="#">Discord</a>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            © 2024 Loomic AI. TypeScript Native Development.
          </div>
        </div>
      </footer>
    </div>
  );
}
