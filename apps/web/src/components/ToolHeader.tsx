import type { ReactNode } from "react";

export function ToolHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-ink-300">{description}</p>
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-ink-200">{children}</label>;
}

export const inputClass =
  "w-full rounded-lg border border-ink-600 bg-ink-800/80 px-3 py-2 text-sm text-ink-50 outline-none transition-colors focus:border-brand-400 placeholder:text-ink-400";
