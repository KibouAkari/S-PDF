import { Link, Outlet, useLocation } from "react-router-dom";
import { FileStack } from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.66.5 12c0 5.08 3.29 9.39 7.86 10.91.57.11.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.08.78 2.18 0 1.57-.01 2.84-.01 3.23 0 .3.2.67.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.66 18.35.5 12 .5Z" />
    </svg>
  );
}

export function Layout() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-800/80 bg-ink-950 backdrop-blur-md">
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
            href="https://github.com/kibouakari"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub profile"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink-600 text-ink-200 hover:bg-ink-800 transition-colors"
          >
            <GithubIcon className="h-4 w-4" />
          </a>
        </div>
      </header>

      <main className={isHome ? "flex-1" : "flex-1 mx-auto w-full max-w-6xl px-6 py-10"}>
        <Outlet />
      </main>

      <footer className="border-t border-ink-800/80 py-8 text-center text-sm text-ink-400">
        <p>&copy; {new Date().getFullYear()} Kibou Akari. All rights reserved.</p>
        <p className="mt-1 text-xs text-ink-500">Files are processed and discarded automatically - never stored.</p>
      </footer>
    </div>
  );
}
