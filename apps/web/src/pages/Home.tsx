import { Link } from "react-router-dom";
import { TOOLS } from "../lib/tools";
import { ToolCard } from "../components/ToolCard";
import { Button } from "../components/ui/Button";
import { Combine, ArrowRight } from "lucide-react";

export function Home() {
  const otherTools = TOOLS.filter((t) => t.id !== "organize");

  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
          All your PDF tools, in one place
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-300">
          Merge, convert, edit and clean up your PDFs! Quickly and without a subscription or needing to pay.
        </p>
      </div>

      <Link to="/tools/organize" className="block">
        <div className="mb-10 flex flex-col items-center gap-6 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-8 text-center transition-colors hover:border-brand-400/50 sm:flex-row sm:text-left">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <Combine className="h-8 w-8" strokeWidth={1.75} />
          </span>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-ink-50">Merge PDFs</h2>
            <p className="mt-1 text-ink-300">
              Combine multiple PDFs into one, and drag pages into exactly the order you want.
            </p>
          </div>
          <Button size="lg" className="shrink-0">
            Merge PDFs <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Link>

      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-400">
        More tools
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {otherTools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}
