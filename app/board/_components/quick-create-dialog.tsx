'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QK } from '@/lib/client/query-keys';
import type { BoardColumn } from '@/lib/shared/board';
import { createCardApi } from '../_lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Schlankes Quick-Create (Plan §5: KEIN Triage-Modal in Phase 2) — Titel +
// Zielkanal. Das Triage-Modal kommt in Phase 4.
export function QuickCreateDialog({
  columnId,
  columns,
  boardSlug,
  onClose,
}: {
  columnId: string;
  columns: BoardColumn[];
  boardSlug: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [targetColumn, setTargetColumn] = useState(columnId);

  const create = useMutation({
    mutationFn: () => createCardApi({ column_id: targetColumn, title: title.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.board(boardSlug) });
      qc.invalidateQueries({ queryKey: QK.boards });
      toast.success('Karte angelegt.');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (title.trim() && !create.isPending) create.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Karte anlegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="Titel der Karte"
          />
          <Select value={targetColumn} onValueChange={setTargetColumn}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {columns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={!title.trim() || create.isPending}>
            Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
