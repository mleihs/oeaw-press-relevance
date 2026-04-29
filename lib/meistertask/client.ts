// Minimal MeisterTask client. We only use createTask in MVP — list/get/update
// can be added later when actually needed (avoids dead code & test surface).

import { MEISTERTASK_API_BASE, MEISTERTASK_RPS_LIMIT } from './constants';

export interface MeistertaskTask {
  id: number;
  token: string;
  section_id: number;
  name: string;
  notes: string | null;
  status: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskBody {
  name: string;
  notes?: string;
  status?: number;
  label_ids?: number[];
}

export class MeistertaskApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
    this.name = 'MeistertaskApiError';
  }
}

export class MeistertaskAuthError extends MeistertaskApiError {
  constructor(body: unknown) {
    super(401, body, 'MeisterTask auth failed — check MEISTERTASK_API_TOKEN');
    this.name = 'MeistertaskAuthError';
  }
}

export class MeistertaskRateLimitError extends MeistertaskApiError {
  constructor(public retryAfterSeconds: number, body: unknown) {
    super(429, body, `MeisterTask rate limited (retry after ${retryAfterSeconds}s)`);
    this.name = 'MeistertaskRateLimitError';
  }
}

// Token-bucket limiter. Single-tenant assumption: one server instance, one
// token. If we ever scale to multiple Vercel instances sharing this token,
// move the bucket to Redis or accept a higher empirical 429-rate.
class RateLimiter {
  private slots: number;
  private lastRefill: number;

  constructor(private rps: number) {
    this.slots = rps;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.slots <= 0) {
      await new Promise((r) => setTimeout(r, Math.ceil(1000 / this.rps)));
      this.refill();
    }
    this.slots -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const refillBy = Math.floor(elapsed * this.rps);
    if (refillBy > 0) {
      this.slots = Math.min(this.rps, this.slots + refillBy);
      this.lastRefill = now;
    }
  }
}

export class MeistertaskClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;

  constructor(token: string, opts: { baseUrl?: string; rps?: number } = {}) {
    this.token = token;
    this.baseUrl = opts.baseUrl ?? MEISTERTASK_API_BASE;
    this.limiter = new RateLimiter(opts.rps ?? MEISTERTASK_RPS_LIMIT);
  }

  async createTask(sectionId: number, body: CreateTaskBody): Promise<MeistertaskTask> {
    return this.request<MeistertaskTask>('POST', `/sections/${sectionId}/tasks`, body);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<T> {
    await this.limiter.acquire();

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401) {
      throw new MeistertaskAuthError(await safeJson(res));
    }
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5', 10);
      const errBody = await safeJson(res);
      if (!retried) {
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return this.request<T>(method, path, body, true);
      }
      throw new MeistertaskRateLimitError(retryAfter, errBody);
    }
    if (!res.ok) {
      throw new MeistertaskApiError(res.status, await safeJson(res), `MeisterTask ${res.status}`);
    }
    return res.json() as Promise<T>;
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}
