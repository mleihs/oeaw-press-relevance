'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Check,
  Copy,
  Key,
  Loader2,
  Lock,
  MoreHorizontal,
  RefreshCw,
  Shield,
  ShieldCheck,
  TriangleAlert,
  User,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/shared/utils';
import { QK } from '@/lib/client/query-keys';
import { generatePassword } from '@/lib/shared/password';
import { userInitials } from '@/lib/shared/user-display';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import type { AdminUserRow, UserRole } from '@/lib/shared/types';

/**
 * Nutzerverwaltung (Design: docs/design/board/Verwaltung.dc.html).
 * Admin-only — Member und Ausgeloggte sehen die verschlossene Variante;
 * die eigentliche Durchsetzung passiert server-seitig (requireAdmin auf
 * /api/auth/users*), diese Karte ist nur die UI dazu.
 */

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  return body as T;
}

async function fetchUsers(): Promise<AdminUserRow[]> {
  const body = await jsonOrThrow<{ users: AdminUserRow[] }>(await fetch('/api/auth/users'));
  return body.users;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

interface RevealState {
  title: string;
  subtitle: string;
  password: string;
}

export function UserManagementCard() {
  const { user: viewer, isAdmin, isLoading: viewerLoading } = useCurrentUser();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [fName, setFName] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPassword, setFPassword] = useState(() => generatePassword());
  const [fRole, setFRole] = useState<UserRole>('member');
  const [confirmTarget, setConfirmTarget] = useState<AdminUserRow | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);

  const usersQuery = useQuery({
    queryKey: QK.adminUsers,
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QK.adminUsers });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = await jsonOrThrow<{ user: AdminUserRow }>(
        await fetch('/api/auth/users', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            displayName: fName.trim(),
            email: fEmail.trim(),
            password: fPassword,
            role: fRole,
          }),
        }),
      );
      return body.user;
    },
    onSuccess: (created) => {
      invalidate();
      setReveal({
        title: 'Nutzer angelegt',
        subtitle: `${created.displayName ?? created.email} kann sich mit diesem Initialpasswort anmelden:`,
        password: fPassword,
      });
      setCreateOpen(false);
      setFName('');
      setFEmail('');
      setFPassword(generatePassword());
      setFRole('member');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const patchMutation = useMutation({
    mutationFn: async (input: { id: string; role?: UserRole; disabled?: boolean }) => {
      const { id, ...patch } = input;
      await jsonOrThrow(
        await fetch(`/api/auth/users/${id}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify(patch),
        }),
      );
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message),
  });

  const resetMutation = useMutation({
    mutationFn: async (target: AdminUserRow) => {
      const body = await jsonOrThrow<{ password: string }>(
        await fetch(`/api/auth/users/${target.id}/reset-password`, { method: 'POST' }),
      );
      return { target, password: body.password };
    },
    onSuccess: ({ target, password }) => {
      setReveal({
        title: 'Passwort zurückgesetzt',
        subtitle: `Neues Passwort für ${target.displayName ?? target.email}:`,
        password,
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Verschlossene Variante (Design: „locked card for members").
  if (viewerLoading) return null;
  if (!isAdmin) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-4 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-muted-foreground">Nutzerverwaltung</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {viewer
                ? 'Nur für Admins sichtbar. Als Member kannst du Inhalte bearbeiten, aber keine Nutzer verwalten.'
                : 'Nur für angemeldete Admins sichtbar.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const users = usersQuery.data ?? [];
  const activeCount = users.filter((u) => !u.disabledAt).length;
  const adminCount = users.filter((u) => u.role === 'admin' && !u.disabledAt).length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                Nutzerverwaltung
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                  <ShieldCheck className="h-3 w-3" />
                  Nur Admins
                </span>
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {users.length} Nutzer · {activeCount} aktiv · {adminCount} Admins
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen((v) => !v)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Nutzer anlegen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {createOpen && (
            <CreateForm
              name={fName}
              email={fEmail}
              password={fPassword}
              role={fRole}
              pending={createMutation.isPending}
              onName={setFName}
              onEmail={setFEmail}
              onPassword={setFPassword}
              onRole={setFRole}
              onCancel={() => setCreateOpen(false)}
              onSubmit={() => {
                if (!fName.trim() || !fEmail.trim()) {
                  toast.error('Bitte Name und E-Mail angeben.');
                  return;
                }
                createMutation.mutate();
              }}
            />
          )}

          {usersQuery.isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Nutzer werden geladen …
            </div>
          )}
          {usersQuery.isError && (
            <p className="py-4 text-sm text-red-600 dark:text-red-400">
              Nutzerliste konnte nicht geladen werden.
            </p>
          )}

          {usersQuery.isSuccess && (
            <div>
              <div className="grid grid-cols-[1fr_110px_110px_40px] gap-2 px-2 pb-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid-cols-[1fr_120px_120px_150px_40px]">
                <span>Name</span>
                <span>Rolle</span>
                <span>Status</span>
                <span className="hidden sm:block">Letzte Anmeldung</span>
                <span />
              </div>
              <div className="flex flex-col gap-1">
                {users.map((u) => (
                  <UserRowItem
                    key={u.id}
                    user={u}
                    isSelf={u.id === viewer?.id}
                    pending={patchMutation.isPending || resetMutation.isPending}
                    onToggleRole={() =>
                      patchMutation.mutate({
                        id: u.id,
                        role: u.role === 'admin' ? 'member' : 'admin',
                      })
                    }
                    onResetPassword={() => resetMutation.mutate(u)}
                    onToggleActive={() => {
                      if (u.disabledAt) {
                        patchMutation.mutate({ id: u.id, disabled: false });
                      } else {
                        setConfirmTarget(u);
                      }
                    }}
                  />
                ))}
                {users.length === 0 && (
                  <p className="px-2 py-4 text-sm text-muted-foreground">
                    Noch keine Nutzer angelegt.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bestätigung: Deaktivieren */}
      <Dialog open={confirmTarget !== null} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5 text-orange-600" />
              Nutzer deaktivieren?
            </DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">
                {confirmTarget?.displayName ?? confirmTarget?.email}
              </strong>{' '}
              kann sich danach nicht mehr anmelden. Kommentare und Aktivitäten im Board bleiben
              der Person zugeordnet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmTarget) {
                  patchMutation.mutate({ id: confirmTarget.id, disabled: true });
                }
                setConfirmTarget(null);
              }}
            >
              Deaktivieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Passwort-Anzeige (Anlegen + Reset) — wird genau einmal gezeigt */}
      <Dialog open={reveal !== null} onOpenChange={(open) => !open && setReveal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              {reveal?.title}
            </DialogTitle>
            <DialogDescription>{reveal?.subtitle}</DialogDescription>
          </DialogHeader>
          {reveal && <PasswordReveal password={reveal.password} />}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Wird nur einmal angezeigt. Bitte persönlich weitergeben, es wird keine E-Mail
            versendet.
          </div>
          <DialogFooter>
            <Button onClick={() => setReveal(null)}>Fertig</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateForm(props: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  pending: boolean;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onRole: (v: UserRole) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-user-name">Name</Label>
          <Input
            id="new-user-name"
            placeholder="z.B. Julia Denk"
            value={props.name}
            onChange={(e) => props.onName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-user-email">E-Mail</Label>
          <Input
            id="new-user-email"
            type="email"
            placeholder="vorname.nachname@oeaw.ac.at"
            value={props.email}
            onChange={(e) => props.onEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="new-user-password">
            Initialpasswort{' '}
            <span className="font-normal text-muted-foreground">
              wird persönlich weitergegeben, kein Mail-Versand
            </span>
          </Label>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                id="new-user-password"
                className="pl-9 font-mono text-[13px]"
                value={props.password}
                onChange={(e) => props.onPassword(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              title="Neu generieren"
              onClick={() => props.onPassword(generatePassword())}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <CopyButton value={props.password} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Rolle</Label>
          <div className="flex gap-1 rounded-md bg-muted p-1">
            {(['member', 'admin'] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => props.onRole(role)}
                className={cn(
                  'rounded px-3 py-1.5 text-xs font-semibold transition-colors',
                  props.role === role
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {role === 'member' ? 'Member' : 'Admin'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={props.onCancel}>
          Abbrechen
        </Button>
        <Button size="sm" onClick={props.onSubmit} disabled={props.pending}>
          {props.pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          Anlegen
        </Button>
      </div>
    </div>
  );
}

function UserRowItem(props: {
  user: AdminUserRow;
  isSelf: boolean;
  pending: boolean;
  onToggleRole: () => void;
  onResetPassword: () => void;
  onToggleActive: () => void;
}) {
  const { user } = props;
  const active = !user.disabledAt;
  const isAdmin = user.role === 'admin';
  const neverSignedIn = user.lastSignInAt === null;

  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_110px_110px_40px] items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/40 sm:grid-cols-[1fr_120px_120px_150px_40px]',
        !active && 'opacity-60',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
          {userInitials(user)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {user.displayName ?? user.email}
            {props.isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(du)</span>}
          </div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </div>
      </div>
      <div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            isAdmin ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
          )}
        >
          {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
          {isAdmin ? 'Admin' : 'Member'}
        </span>
      </div>
      <div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium',
            active ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              active ? 'bg-green-500' : 'bg-muted-foreground/50',
            )}
          />
          {active ? 'Aktiv' : 'Deaktiviert'}
        </span>
      </div>
      <div className="hidden items-center gap-1.5 sm:flex">
        <span className="font-mono text-xs text-muted-foreground">
          {user.lastSignInAt
            ? formatDistanceToNow(new Date(user.lastSignInAt), { addSuffix: true, locale: de })
            : '–'}
        </span>
        {neverSignedIn && (
          <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
            Neu
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label={`Aktionen für ${user.displayName ?? user.email}`}
              disabled={props.pending}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={props.onToggleRole}>
              <Shield className="mr-2 h-4 w-4" />
              {isAdmin ? 'Zu Member machen' : 'Zu Admin machen'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={props.onResetPassword}>
              <Key className="mr-2 h-4 w-4" />
              Passwort zurücksetzen
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={props.onToggleActive}
              className={cn(
                active && 'text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400',
              )}
            >
              {active ? (
                <UserMinus className="mr-2 h-4 w-4" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              {active ? 'Deaktivieren' : 'Reaktivieren'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function PasswordReveal({ password }: { password: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
      <Key className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 font-mono text-base font-medium tracking-wide">{password}</span>
      <CopyButton value={password} withLabel />
    </div>
  );
}

function CopyButton({ value, withLabel = false }: { value: string; withLabel?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={withLabel ? 'h-8' : 'h-9 w-9 p-0'}
      title="Kopieren"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error('Kopieren fehlgeschlagen');
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      {withLabel && <span className="ml-1.5 text-xs">{copied ? 'Kopiert' : 'Kopieren'}</span>}
    </Button>
  );
}
