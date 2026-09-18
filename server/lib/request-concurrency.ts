import type { NextFunction, Request, Response } from "express";

type PendingRequest = {
  req: Request;
  res: Response;
  next: NextFunction;
  timer: NodeJS.Timeout;
};

const maxActive = Math.max(1, Number(process.env.API_MAX_CONCURRENT_REQUESTS || 100));
const maxQueued = Math.max(0, Number(process.env.API_MAX_QUEUED_REQUESTS || 2000));
const queueTimeoutMs = Math.max(1000, Number(process.env.API_QUEUE_TIMEOUT_MS || 60000));

let active = 0;
const queue: PendingRequest[] = [];

function start(req: Request, res: Response, next: NextFunction) {
  active += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    active = Math.max(0, active - 1);
    drain();
  };
  res.once("finish", release);
  res.once("close", release);
  res.setHeader("X-Concurrency-Limit", String(maxActive));
  next();
}

function drain() {
  while (active < maxActive && queue.length > 0) {
    const pending = queue.shift()!;
    clearTimeout(pending.timer);
    if (pending.req.destroyed || pending.res.destroyed || pending.res.headersSent) continue;
    start(pending.req, pending.res, pending.next);
  }
}

export function requestConcurrencyGate(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS" || req.path === "/api/health" || req.path === "/") {
    return next();
  }
  if (active < maxActive) return start(req, res, next);
  if (queue.length >= maxQueued) {
    res.setHeader("Retry-After", "1");
    return res.status(503).json({ error: "server is busy, please retry shortly" });
  }

  const pending: PendingRequest = {
    req,
    res,
    next,
    timer: setTimeout(() => {
      const index = queue.indexOf(pending);
      if (index >= 0) queue.splice(index, 1);
      if (!res.headersSent) {
        res.setHeader("Retry-After", "1");
        res.status(503).json({ error: "request queue timeout, please retry" });
      }
    }, queueTimeoutMs),
  };
  pending.timer.unref();
  queue.push(pending);
}

export function getRequestConcurrencyState() {
  return { active, queued: queue.length, maxActive, maxQueued };
}
