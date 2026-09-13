import { Link, Outlet, useLocation } from "react-router-dom";
import { FileStack } from "lucide-react";

export function Layout() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-lg tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-900/40">
              <FileStack className="h-4.5 w-4.5 text-white" strokeWidth={2.2} />
            </span>
            S-PDF
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-ink-300 sm:flex">
            <Link to="/tools/organize" className="hover:text-ink-50 transition-colors">Organize</Link>
            <Link to="/tools/pdf-to-word" className="hover:text-ink-50 transition-colors">Convert</Link>
            <Link to="/tools/editor" className="hover:text-ink-50 transition-colors">Edit</Link>
            <Link to="/tools/compress" className="hover:text-ink-50 transition-colors">Enhance</Link>
          </nav>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-ink-600 px-3 py-1.5 text-sm text-ink-200 hover:bg-ink-800 transition-colors"
          >
            Open source
          </a>
        </div>
      </header>

      <main className={isHome ? "flex-1" : "flex-1 mx-auto w-full max-w-6xl px-6 py-10"}>
        <Outlet />
      </main>

      <footer className="border-t border-ink-800/80 py-8 text-center text-sm text-ink-400">
        S-PDF — files are processed and discarded automatically, never stored.
      </footer>
    </div>
  );
}
