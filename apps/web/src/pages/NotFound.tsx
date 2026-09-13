import { useState } from "react";
import { Link } from "react-router-dom";
import { Shredder, Home as HomeIcon, RotateCcw } from "lucide-react";
import { Button } from "../components/ui/Button";

interface Strip {
  id: number;
  left: number;
  dx: number;
  rot: number;
  delay: number;
  hue: string;
}

const HUES = ["bg-brand-300", "bg-brand-400", "bg-ink-100", "bg-ink-200"];

function makeStrips(batch: number): Strip[] {
  return Array.from({ length: 14 }, (_, i) => ({
    id: batch * 100 + i,
    left: 8 + Math.random() * 84,
    dx: (Math.random() - 0.5) * 60,
    rot: 60 + Math.random() * 180,
    delay: Math.random() * 150,
    hue: HUES[i % HUES.length],
  }));
}

export function NotFound() {
  const [batch, setBatch] = useState(0);
  const [strips, setStrips] = useState<Strip[]>([]);
  const [count, setCount] = useState(0);

  function shredAgain() {
    const next = batch + 1;
    setBatch(next);
    setStrips(makeStrips(next));
    setCount((c) => c + 1);
  }

  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="relative">
        <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
          <Shredder className="animate-wiggle h-10 w-10" strokeWidth={1.5} />
        </span>
        {strips.map((s) => (
          <span
            key={s.id}
            className={`animate-paper-fall pointer-events-none absolute top-14 h-2 w-6 rounded-sm ${s.hue}`}
            style={{
              left: `${s.left}%`,
              animationDelay: `${s.delay}ms`,
              // @ts-expect-error custom properties consumed by the paper-fall keyframes
              "--dx": `${s.dx}px`,
              "--rot": `${s.rot}deg`,
            }}
          />
        ))}
      </div>

      <p className="mt-8 text-sm font-semibold uppercase tracking-widest text-brand-300">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
        This page went through the shredder
      </h1>
      <p className="mt-3 max-w-md text-ink-300">
        Whatever you were looking for isn't here anymore — probably fed through the wrong tool.
        Good news: unlike a real shredder, this one's undo button actually works.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link to="/">
          <Button size="lg">
            <HomeIcon className="h-4 w-4" /> Back to safety
          </Button>
        </Link>
        <Button size="lg" variant="secondary" onClick={shredAgain}>
          <RotateCcw className="h-4 w-4" /> Shred it again
        </Button>
      </div>

      {count > 2 && (
        <p className="mt-6 text-xs text-ink-500">
          {count >= 6 ? "Okay, you really like this button." : "Feeding it through again, huh?"}
        </p>
      )}
    </div>
  );
}
