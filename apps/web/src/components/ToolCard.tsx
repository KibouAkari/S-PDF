import { Link } from "react-router-dom";
import type { ToolMeta } from "../lib/tools";
import { Card } from "./ui/Card";

export function ToolCard({ tool }: { tool: ToolMeta }) {
  const Icon = tool.icon;
  return (
    <Link to={tool.path}>
      <Card className="group h-full p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/40 hover:bg-ink-800/60 hover:shadow-lg">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 transition-transform duration-200 group-hover:scale-110">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <h3 className="mt-4 font-semibold text-ink-50">{tool.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{tool.description}</p>
      </Card>
    </Link>
  );
}
