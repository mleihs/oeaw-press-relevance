// Orchestrates one social-media refresh: throttle → fetch (Apify) → analyze
// (LLM) → regenerate theme snapshot, logging the run (cost + counts) to
// social_refresh_runs and emitting SSE-shaped events. Composes the independent
// sync/analyze/snapshot functions; the HTTP route streams `emit`, the CLI
// passes a no-op emit and reads the returned summary.

import { db, socialRefreshRuns } from '@/lib/server/db';
import { syncSocialPosts } from './sync';
import { analyzeSocialPosts, regenerateThemeSnapshot } from './analyze';
import { getLastCompletedRefreshAt } from './list';
import { getSocialSettings } from './settings';
import { log } from '@/lib/server/log';

type Emit = (type: string, data: unknown) => void;
type TriggeredBy = 'ui' | 'cli' | 'cron';

export interface SocialRefreshOptions {
  apifyToken: string | undefined;
  actor?: string;
  resultsLimit?: number;
  apiKey: string;
  model: string;
  batchSize?: number;
  windowDays: number;
  minRefreshMinutes: number;
  apifyCostPerResult: number;
  force?: boolean;
  triggeredBy?: TriggeredBy;
  abortSignal?: AbortSignal;
  emit?: Emit;
}

export interface SocialRefreshResult {
  skipped: boolean;
  fetched: number;
  created: number;
  analyzed: number;
  themes: number | null;
  apifyCost: number;
  llmCost: number;
  tokens: number;
  ms: number;
}

interface RunLog {
  triggeredBy: TriggeredBy;
  status: 'complete' | 'error' | 'skipped';
  postsFetched?: number;
  postsNew?: number;
  postsAnalyzed?: number;
  apifyCost?: number;
  llmCost?: number;
  tokens?: number;
  model?: string;
  error?: string;
  ms: number;
}

async function recordRun(r: RunLog): Promise<void> {
  await db.insert(socialRefreshRuns).values({
    triggeredBy: r.triggeredBy,
    status: r.status,
    postsFetched: r.postsFetched ?? 0,
    postsNew: r.postsNew ?? 0,
    postsAnalyzed: r.postsAnalyzed ?? 0,
    apifyCostUsd: r.apifyCost ?? 0,
    llmCostUsd: r.llmCost ?? 0,
    llmTokens: r.tokens ?? 0,
    llmModel: r.model ?? null,
    durationMs: r.ms,
    error: r.error ?? null,
  });
}

function completePayload(res: SocialRefreshResult) {
  return {
    skipped: res.skipped,
    fetched: res.fetched,
    new: res.created,
    analyzed: res.analyzed,
    themes: res.themes,
    apify_cost: res.apifyCost,
    llm_cost: res.llmCost,
    total_cost: res.apifyCost + res.llmCost,
    tokens: res.tokens,
    ms: res.ms,
  };
}

export async function runSocialRefresh(
  opts: SocialRefreshOptions,
): Promise<SocialRefreshResult> {
  const emit: Emit = opts.emit ?? (() => {});
  const triggeredBy = opts.triggeredBy ?? 'ui';
  const t0 = Date.now();

  emit('init', { model: opts.model });

  // Throttle: skip the (cost-incurring) Apify call if a successful refresh ran
  // within the window, unless the caller forces it.
  if (!opts.force && opts.minRefreshMinutes > 0) {
    const last = await getLastCompletedRefreshAt();
    if (last) {
      const minutesAgo = (Date.now() - new Date(last).getTime()) / 60000;
      if (minutesAgo < opts.minRefreshMinutes) {
        emit('skipped', {
          minutes_ago: Math.floor(minutesAgo),
          threshold_minutes: opts.minRefreshMinutes,
        });
        const res: SocialRefreshResult = {
          skipped: true, fetched: 0, created: 0, analyzed: 0, themes: null,
          apifyCost: 0, llmCost: 0, tokens: 0, ms: Date.now() - t0,
        };
        await recordRun({ triggeredBy, status: 'skipped', ms: res.ms });
        emit('complete', completePayload(res));
        return res;
      }
    }
  }

  // Fetch — a failure here (no token, Apify down/out-of-credit) is fatal.
  // Team-wide settings: theme window (snapshot horizon) + retention (prune).
  const settings = await getSocialSettings();

  let fetched = 0;
  let created = 0;
  try {
    emit('fetching', {});
    const sync = await syncSocialPosts({
      apifyToken: opts.apifyToken,
      actor: opts.actor,
      resultsLimit: opts.resultsLimit,
      windowDays: opts.windowDays,
      retentionDays: settings.retention_days,
    });
    fetched = sync.fetched;
    created = sync.created;
    emit('fetched', { fetched: sync.fetched, new: sync.created, channels: sync.channels });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('social_refresh_fetch_error', { message });
    emit('error', { message, fatal: true });
    const res: SocialRefreshResult = {
      skipped: false, fetched: 0, created: 0, analyzed: 0, themes: null,
      apifyCost: 0, llmCost: 0, tokens: 0, ms: Date.now() - t0,
    };
    await recordRun({ triggeredBy, status: 'error', error: message, ms: res.ms });
    emit('complete', completePayload(res));
    return res;
  }

  // Analyze — internally resilient (per-batch failures don't throw).
  const analysis = await analyzeSocialPosts({
    apiKey: opts.apiKey,
    model: opts.model,
    batchSize: opts.batchSize,
    abortSignal: opts.abortSignal,
    emit,
  });

  // Snapshot — a failure here is non-fatal: the fetched posts are saved and the
  // previous snapshot still shows. Log it but finish the run as complete.
  let themes: number | null = null;
  let snapTokens = 0;
  let snapCost = 0;
  try {
    const snap = await regenerateThemeSnapshot({
      apiKey: opts.apiKey,
      model: opts.model,
      themeWindowDays: settings.theme_window_days,
    });
    if (snap) {
      themes = snap.themes;
      snapTokens = snap.tokensUsed;
      snapCost = snap.cost;
      emit('snapshot', { themes: snap.themes, posts: snap.postCount });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error('social_refresh_snapshot_error', { message });
    emit('error', { message, fatal: false });
  }

  const apifyCost = fetched * opts.apifyCostPerResult;
  const llmCost = analysis.cost + snapCost;
  const tokens = analysis.tokensUsed + snapTokens;

  const res: SocialRefreshResult = {
    skipped: false, fetched, created, analyzed: analysis.analyzed, themes,
    apifyCost, llmCost, tokens, ms: Date.now() - t0,
  };

  await recordRun({
    triggeredBy,
    status: 'complete',
    postsFetched: fetched,
    postsNew: created,
    postsAnalyzed: analysis.analyzed,
    apifyCost,
    llmCost,
    tokens,
    model: opts.model,
    ms: res.ms,
  });

  emit('complete', completePayload(res));
  return res;
}
