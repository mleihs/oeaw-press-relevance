'use client';

import { useQueryStates } from 'nuqs';
import { filterParsers } from '../_filters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { InfoBubble } from '@/components/info-bubble';
import { METRIC_LABELS, SINCE_PRESETS, type LeaderboardMetric } from '@/lib/researchers';
import type { EXPL } from '@/lib/explanations';

const SCOPE_LABELS = {
  all: 'Alle Beteiligten',
  lead: 'Nur Hauptautor:innen',
} as const;

export function FiltersBar() {
  const [filters, setFilters] = useQueryStates(filterParsers, { shallow: false });

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Zeitraum
          <InfoBubble id="since_window" />
        </Label>
        <Select value={filters.since} onValueChange={(v) => setFilters({ since: v as typeof filters.since })}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SINCE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Metrik
          <InfoBubble id={metricExplKey(filters.metric)} />
        </Label>
        <Select value={filters.metric} onValueChange={(v) => setFilters({ metric: v as LeaderboardMetric })}>
          <SelectTrigger className="h-9 w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(METRIC_LABELS) as LeaderboardMetric[]).map((m) => (
              <SelectItem key={m} value={m}>{METRIC_LABELS[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="flex items-center gap-1.5 text-xs text-neutral-500">
          Autorschaft
          <InfoBubble id="filter_authorship" />
        </Label>
        <Select value={filters.scope} onValueChange={(v) => setFilters({ scope: v as 'all' | 'lead' })}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SCOPE_LABELS) as Array<keyof typeof SCOPE_LABELS>).map((s) => (
              <SelectItem key={s} value={s}>{SCOPE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-5 self-center">
        <ToggleField
          label="Mitglieder"
          explId="member_oeaw"
          checked={filters.memberOnly}
          onChange={(v) => setFilters({ memberOnly: v })}
        />
        <ToggleField
          label="External"
          explId="external_person"
          checked={filters.external}
          onChange={(v) => setFilters({ external: v })}
        />
        <ToggleField
          label="Verstorben"
          checked={filters.deceased}
          onChange={(v) => setFilters({ deceased: v })}
          fallbackHelp="Verstorbene Forschende einbeziehen."
        />
        <ToggleField
          label="ITA"
          explId="filter_ita"
          checked={filters.includeIta}
          onChange={(v) => setFilters({ includeIta: v })}
        />
        <ToggleField
          label="Outreach"
          explId="filter_outreach"
          checked={filters.includeOutreach}
          onChange={(v) => setFilters({ includeOutreach: v })}
        />
      </div>
    </div>
  );
}

function metricExplKey(metric: LeaderboardMetric): keyof typeof EXPL {
  // metric values map 1:1 to EXPL keys
  return metric;
}

function ToggleField({
  label,
  explId,
  fallbackHelp,
  checked,
  onChange,
}: {
  label: string;
  explId?: keyof typeof EXPL;
  fallbackHelp?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} id={`f-${label}`} />
      <Label htmlFor={`f-${label}`} className="flex cursor-pointer items-center gap-1 text-xs">
        {label}
        {explId ? (
          <InfoBubble id={explId} />
        ) : fallbackHelp ? (
          <InfoBubble content={{ title: label, body: <p className="leading-relaxed">{fallbackHelp}</p> }} />
        ) : null}
      </Label>
    </div>
  );
}
