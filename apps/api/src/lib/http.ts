import type { NextFunction, Request, Response } from "express";

/** Wraps an async route handler so rejected promises reach Express's error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Parses a page range string like "1-3,5,8-10" (1-based, inclusive) into a sorted list of 0-based indices. */
export function parsePageRanges(spec: string, pageCount: number): number[] {
  const indices = new Set<number>();
  const parts = spec.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new HttpError(400, "Page range cannot be empty");

  for (const part of parts) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new HttpError(400, `Invalid page range segment: "${part}"`);
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end < 1 || start > end) {
      throw new HttpError(400, `Invalid page range segment: "${part}"`);
    }
    for (let i = start; i <= end; i++) {
      if (i > pageCount) {
        throw new HttpError(400, `Page ${i} is out of range (document has ${pageCount} pages)`);
      }
      indices.add(i - 1);
    }
  }
  return [...indices].sort((a, b) => a - b);
}
