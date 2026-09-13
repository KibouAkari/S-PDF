import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function StatusBanner({
  state,
  message,
}: {
  state: "idle" | "loading" | "error" | "success";
  message?: string;
}) {
  if (state === "idle" || !message) return null;

  const styles = {
    loading: "border-brand-500/30 bg-brand-500/10 text-brand-300",
    error: "border-red-500/30 bg-red-500/10 text-red-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  } as const;

  const icons = {
    loading: <Loader2 className="h-4 w-4 animate-spin" />,
    error: <AlertCircle className="h-4 w-4" />,
    success: <CheckCircle2 className="h-4 w-4" />,
  } as const;

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${styles[state as "loading" | "error" | "success"]}`}>
      {icons[state as "loading" | "error" | "success"]}
      <span>{message}</span>
    </div>
  );
}
