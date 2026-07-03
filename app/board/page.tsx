import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/require';
import { listBoards } from '@/lib/server/board/boards';
import { BoardsOverview } from './_components/boards-overview';

// Auth-abhängig (liest Cookies via getCurrentUser) -> immer dynamisch.
export const dynamic = 'force-dynamic';

export default async function BoardOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/board');
  const boards = await listBoards(user.id);
  return <BoardsOverview initialBoards={boards} isAdmin={user.role === 'admin'} />;
}
