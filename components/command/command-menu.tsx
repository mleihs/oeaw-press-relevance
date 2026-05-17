'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useDocsSearch } from 'fumadocs-core/search/client';
import { FileText, Hash, CornerDownLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command';
import { useInfoBubblesEnabled } from '@/lib/client/hooks/use-info-bubbles';
import {
  useKeyboardShortcutsEnabled,
  readKeyboardShortcutsEnabled,
} from '@/lib/client/hooks/use-keyboard-shortcuts-enabled';
import { useIsMac } from '@/lib/client/commands/platform';
import { onCommandSignal } from '@/lib/client/commands/controller';
import {
  createKeybindings,
  type KeybindingEntry,
  type Binding,
} from '@/lib/client/commands/keybindings';
import {
  NAV_SPECS,
  ACTION_SPECS,
  scoreCommand,
  type ActionId,
} from '@/lib/client/commands/registry';
import { CommandCheatsheet } from './command-cheatsheet';

// Same cmdk styling the shadcn CommandDialog applies internally. We compose
// Dialog + Command by hand instead of using <CommandDialog> so we can pass
// shouldFilter={false}: Orama help results must not be re-ranked by cmdk's
// internal scorer, so we filter statics ourselves and feed help results
// already-sorted (the standard async-cmdk pattern).
const CMDK_CLASS =
  '**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5';

function chordLabel(binding: Binding, mac: boolean): string {
  if (binding.kind === 'chord') return `${mac ? '⌘' : 'Strg'}${binding.key.toUpperCase()}`;
  if (binding.kind === 'single') return binding.key;
  return `${binding.lead.toUpperCase()} ${binding.key.toUpperCase()}`;
}

export function CommandMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const mac = useIsMac();

  const [open, setOpen] = useState(false);
  const [cheatOpen, setCheatOpen] = useState(false);
  const [q, setQ] = useState('');

  const { setTheme } = useTheme();
  const [bubbles, setBubbles] = useInfoBubblesEnabled();
  const [shortcutsEnabled, setShortcutsEnabled] = useKeyboardShortcutsEnabled();

  // Orama-backed help search over content/help/*.mdx via /api/search.
  // fumadocs debounces the fetch internally; we just forward the query.
  const { setSearch, query: oramaQuery } = useDocsSearch({ type: 'fetch' });
  const oramaData = oramaQuery.data;
  const helpResults = Array.isArray(oramaData) ? oramaData.slice(0, 8) : [];

  // Close the palette BEFORE running an action so navigation happens after the
  // dialog unmounts (avoids focus-trap fighting the route change).
  const runCommand = useCallback((fn: () => void) => {
    setOpen(false);
    fn();
  }, []);

  // Actions are only ever invoked from the palette (an event handler, after
  // render), so closing over live state is correct and needs no refs.
  const runAction = useCallback(
    (id: ActionId) => {
      switch (id) {
        case 'theme.light':
          setTheme('light');
          break;
        case 'theme.dark':
          setTheme('dark');
          break;
        case 'theme.system':
          setTheme('system');
          break;
        case 'bubbles.toggle':
          setBubbles(!bubbles);
          break;
        case 'shortcuts.toggle':
          setShortcutsEnabled(!shortcutsEnabled);
          break;
        case 'cheatsheet.open':
          setOpen(false);
          setCheatOpen(true);
          break;
      }
    },
    [setTheme, setBubbles, setShortcutsEnabled, bubbles, shortcutsEnabled],
  );

  // One app-level keybinding listener. Its run() closures use only the stable
  // useState setters and the stable App-Router instance, so the effect keys on
  // [router] and never re-attaches in practice. createKeybindings returns a
  // dispose() → React-19/StrictMode-safe.
  useEffect(() => {
    const entries: KeybindingEntry[] = [
      {
        binding: { kind: 'chord', key: 'k' },
        run: () => {
          setCheatOpen(false);
          setOpen((o) => !o);
        },
      },
    ];
    for (const s of NAV_SPECS) {
      if (s.binding) {
        entries.push({
          binding: s.binding,
          run: () => {
            setOpen(false);
            setCheatOpen(false);
            router.push(s.href);
          },
        });
      }
    }
    for (const s of ACTION_SPECS) {
      if (s.binding && s.action === 'cheatsheet.open') {
        entries.push({
          binding: s.binding,
          run: () => {
            setOpen(false);
            setCheatOpen(true);
          },
        });
      }
    }
    return createKeybindings(window, entries, {
      isEnabled: readKeyboardShortcutsEnabled,
      sequenceTimeout: 1200,
    });
  }, [router]);

  // Programmatic open from the nav button / mobile sheet / anywhere.
  useEffect(
    () =>
      onCommandSignal((signal) => {
        if (signal === 'open-menu') {
          setCheatOpen(false);
          setOpen(true);
        } else if (signal === 'open-cheatsheet') {
          setOpen(false);
          setCheatOpen(true);
        }
      }),
    [],
  );

  const onValueChange = useCallback(
    (v: string) => {
      setQ(v);
      setSearch(v.trim());
    },
    [setSearch],
  );

  const queryStr = q.trim();
  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href;

  const navItems = NAV_SPECS.map((s) => ({
    s,
    score: scoreCommand(queryStr, s.label, s.keywords),
  }))
    .filter((x) => x.score > 0 && !isCurrent(x.s.href))
    .sort((a, b) => b.score - a.score);

  const actionItems = ACTION_SPECS.map((s) => ({
    s,
    score: scoreCommand(queryStr, s.label, s.keywords),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setQ('');
            setSearch('');
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Befehlsmenü</DialogTitle>
            <DialogDescription>
              Suche, springe zu einer Seite oder führe eine Aktion aus.
            </DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false} loop className={CMDK_CLASS}>
            <CommandInput
              value={q}
              onValueChange={onValueChange}
              placeholder="Suche, Navigation oder Befehl…"
            />
            <CommandList>
              <CommandEmpty>
                {queryStr && oramaQuery.isLoading
                  ? 'Suche in der Hilfe…'
                  : 'Keine Treffer.'}
              </CommandEmpty>

              {navItems.length > 0 && (
                <CommandGroup heading="Navigation">
                  {navItems.map(({ s }) => {
                    const Icon = s.icon;
                    return (
                      <CommandItem
                        key={s.id}
                        value={s.id}
                        onSelect={() => runCommand(() => router.push(s.href))}
                      >
                        <Icon />
                        <span>{s.label}</span>
                        {s.binding && (
                          <CommandShortcut>{chordLabel(s.binding, mac)}</CommandShortcut>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {actionItems.length > 0 && (
                <CommandGroup heading="Aktionen">
                  {actionItems.map(({ s }) => {
                    const Icon = s.icon;
                    return (
                      <CommandItem
                        key={s.id}
                        value={s.id}
                        onSelect={() => runCommand(() => runAction(s.action))}
                      >
                        <Icon />
                        <span>{s.label}</span>
                        {s.binding && (
                          <CommandShortcut>{chordLabel(s.binding, mac)}</CommandShortcut>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {queryStr && helpResults.length > 0 && (
                <CommandGroup heading="Hilfe">
                  {helpResults.map((r) => (
                    <CommandItem
                      key={`help:${r.id}`}
                      value={`help:${r.id}`}
                      onSelect={() => runCommand(() => router.push(r.url))}
                    >
                      {r.type === 'page' ? <FileText /> : <Hash />}
                      <span className="truncate">{r.content}</span>
                      <CommandShortcut>
                        <CornerDownLeft className="h-3 w-3" />
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      <CommandCheatsheet
        open={cheatOpen}
        onOpenChange={setCheatOpen}
        shortcutsEnabled={shortcutsEnabled}
      />
    </>
  );
}
