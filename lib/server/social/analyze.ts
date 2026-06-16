// LLM step of the social monitor: extract topic/keywords/summary per post
// (once — only analysis_status='pending' rows), then regenerate the aggregated
// theme snapshot. Uses the shared OpenRouter client (lib/server/openrouter.ts)
// and hardened JSON parsing, so this file is just prompt-building + DB writes.

import { eq, inArray, sql } from 'drizzle-orm';
import {
  db,
  socialPosts,
  socialThemeSnapshots,
  descNullsLast,
} from '@/lib/server/db';
import { chatCompletionJson, parseJsonContent } from '@/lib/server/openrouter';
import { runLLMBatch } from '@/lib/server/llm-batch';
import {
  SYSTEM_PROMPT,
  buildPostPrompt,
  buildOverviewPrompt,
  type PostForPrompt,
  type PostForOverview,
} from './prompts';
import type { SocialTheme } from '@/lib/shared/types';
import { withinLookback } from './window';

export interface SocialAnalyzeOptions {
  apiKey: string;
  model: string;
  batchSize?: number;
  /** Max pending posts to analyze in one pass. */
  limit?: number;
  abortSignal?: AbortSignal;
  emit?: (type: string, data: unknown) => void;
}

export interface SocialAnalyzeResult {
  total: number;
  analyzed: number;
  failed: number;
  tokensUsed: number;
  cost: number;
}

interface PostResult {
  index?: number;
  topic?: string;
  keywords?: string[];
  summary_de?: string;
}

function cleanKeywords(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((k) => String(k).trim()).filter(Boolean).slice(0, 8);
}

/**
 * Analyze pending posts in batches. Per-batch failures mark those rows
 * `failed` and continue; a fatal billing/auth error stops the loop to save
 * credits. Returns token/cost totals so the refresh orchestrator can log them.
 */
export async function analyzeSocialPosts(
  opts: SocialAnalyzeOptions,
): Promise<SocialAnalyzeResult> {
  const batchSize = opts.batchSize ?? 5;
  const emit = opts.emit ?? (() => {});

  // 'failed' is included so a transient failure (truncation, timeout) self-heals
  // on the next refresh instead of staying stuck without a topic.
  const rows = await db.query.socialPosts.findMany({
    where: inArray(socialPosts.analysisStatus, ['pending', 'failed']),
    orderBy: descNullsLast(socialPosts.postedAt),
    limit: opts.limit ?? 80,
    with: { socialChannel: { columns: { handle: true } } },
  });

  // Posts with no caption can't be topic-extracted; mark them analyzed (empty)
  // so they leave the queue without spending tokens.
  const empties = rows.filter((r) => !r.caption || r.caption.trim().length === 0);
  if (empties.length > 0) {
    await db
      .update(socialPosts)
      .set({ analysisStatus: 'analyzed', analyzedAt: sql`NOW()`, llmModel: opts.model })
      .where(inArray(socialPosts.id, empties.map((r) => r.id)));
  }

  const posts = rows.filter((r) => r.caption && r.caption.trim().length > 0);
  const total = posts.length;
  emit('analyzing', { total });

  type PostRow = (typeof posts)[number];

  // Loop/abort/fatal/delay/tally now live in runLLMBatch; the hooks reproduce
  // the social refresh-button's SSE payloads (analyzing/progress/error/cancelled).
  const result = await runLLMBatch<PostRow, PostResult>({
    items: posts,
    apiKey: opts.apiKey,
    model: opts.model,
    batchSize,
    abortSignal: opts.abortSignal,
    batchDelayMs: 400,
    analyze: async (batch, apiKey, model) => {
      const promptPosts: PostForPrompt[] = batch.map((p, j) => ({
        index: j + 1,
        channel: p.socialChannel?.handle ?? '?',
        mediaType: p.mediaType,
        caption: p.caption ?? '',
      }));
      // Posts (esp. history channels) can yield long summaries; budget
      // generously. Truncation is still recovered by parseLooseJson.
      const { content, tokensUsed, cost } = await chatCompletionJson({
        system: SYSTEM_PROMPT,
        user: buildPostPrompt(promptPosts),
        apiKey,
        model,
        maxTokens: 240 * batch.length + 200,
        temperature: 0.3,
      });
      const parsed = parseJsonContent<{ results?: PostResult[] }>(content);
      return { results: Array.isArray(parsed.results) ? parsed.results : [], tokensUsed, cost };
    },
    applyResults: async (batch, results, ctx) => {
      for (let j = 0; j < batch.length; j++) {
        const post = batch[j];
        // Prefer index-matched result; fall back to positional.
        const r = results.find((x) => x.index === j + 1) ?? results[j] ?? null;
        await db
          .update(socialPosts)
          .set({
            topic: r?.topic?.trim() || null,
            keywords: cleanKeywords(r?.keywords),
            summaryDe: r?.summary_de?.trim() || null,
            analysisStatus: 'analyzed',
            llmModel: ctx.model,
            analyzedAt: sql`NOW()`,
          })
          .where(eq(socialPosts.id, post.id));
      }
      // Social writes every post in the batch (null result → empty topic), so
      // the whole batch counts as analyzed.
      return batch.length;
    },
    markFailed: async (batch) => {
      await db
        .update(socialPosts)
        .set({ analysisStatus: 'failed' })
        .where(inArray(socialPosts.id, batch.map((p) => p.id)));
    },
    hooks: {
      onBatchStart: (p) =>
        emit('progress', {
          processed: p.processed,
          total: p.total,
          batch_index: p.batchIndex,
          total_batches: p.totalBatches,
        }),
      onError: (e) => emit('error', { message: e.message, fatal: e.fatal }),
      onCancelled: (p) => emit('cancelled', { processed: p.processed, total: p.total }),
    },
  });

  return {
    total,
    analyzed: result.successful,
    failed: result.failed,
    tokensUsed: result.tokensUsed,
    cost: result.cost,
  };
}

export interface ThemeSnapshotOptions {
  apiKey: string;
  model: string;
  /** Single global window (days) of posts fed to the snapshot — decoupled from
   *  per-channel display lookback (social_settings.theme_window_days). */
  themeWindowDays: number;
}

export interface ThemeSnapshotResult {
  id: string;
  themes: number;
  postCount: number;
  tokensUsed: number;
  cost: number;
}

/**
 * Aggregate analyzed posts from the last `windowDays` into a fresh theme
 * snapshot. Returns null when there is nothing analyzed in the window (no
 * snapshot is written — the page keeps showing the previous one).
 */
export async function regenerateThemeSnapshot(
  opts: ThemeSnapshotOptions,
): Promise<ThemeSnapshotResult | null> {
  const rows = await db.query.socialPosts.findMany({
    where: eq(socialPosts.analysisStatus, 'analyzed'),
    orderBy: descNullsLast(socialPosts.postedAt),
    limit: 200,
    with: { socialChannel: { columns: { handle: true } } },
  });

  // Single global theme window (not per-channel) — the snapshot reflects "what's
  // being discussed lately" over a consistent horizon.
  const inWindow = rows.filter((r) => withinLookback(r.postedAt, opts.themeWindowDays));
  const usable = inWindow.filter((r) => (r.topic && r.topic.trim()) || (r.caption && r.caption.trim()));
  if (usable.length === 0) return null;

  // 1-based index → post id, so themes can reference their member posts.
  const overviewPosts: PostForOverview[] = usable.map((r, i) => ({
    index: i + 1,
    channel: r.socialChannel?.handle ?? '?',
    topic: r.topic,
    keywords: r.keywords ?? [],
    caption: r.caption ?? '',
  }));
  const idByIndex = (idx: unknown): string | null => {
    const n = Number(idx);
    return Number.isInteger(n) && n >= 1 && n <= usable.length ? usable[n - 1].id : null;
  };

  const { content, tokensUsed, cost } = await chatCompletionJson({
    system: SYSTEM_PROMPT,
    user: buildOverviewPrompt(overviewPosts, opts.themeWindowDays),
    apiKey: opts.apiKey,
    model: opts.model,
    maxTokens: 1800,
    temperature: 0.4,
  });

  const parsed = parseJsonContent<{ themes?: unknown[]; narrative_de?: string }>(content);

  const themes: SocialTheme[] = (Array.isArray(parsed.themes) ? parsed.themes : [])
    .map((t): SocialTheme | null => {
      const o = t as Record<string, unknown>;
      const theme = typeof o.theme === 'string' ? o.theme.trim() : '';
      if (!theme) return null;
      const postIds = (Array.isArray(o.post_indices) ? o.post_indices : [])
        .map(idByIndex)
        .filter((id): id is string => id !== null);
      return {
        theme,
        description: typeof o.description === 'string' ? o.description.trim() : '',
        channels: Array.isArray(o.channels) ? o.channels.map((c) => String(c)) : [],
        post_count: postIds.length || Number(o.post_count) || 0,
        keywords: cleanKeywords(o.keywords),
        post_ids: postIds,
      };
    })
    .filter((t): t is SocialTheme => t !== null);

  const channelCount = new Set(
    usable.map((r) => r.socialChannel?.handle).filter(Boolean),
  ).size;

  const [snap] = await db
    .insert(socialThemeSnapshots)
    .values({
      windowDays: opts.themeWindowDays,
      postCount: usable.length,
      channelCount,
      themes,
      narrativeDe: typeof parsed.narrative_de === 'string' ? parsed.narrative_de.trim() : null,
      llmModel: opts.model,
    })
    .returning({ id: socialThemeSnapshots.id });

  return { id: snap.id, themes: themes.length, postCount: usable.length, tokensUsed, cost };
}
