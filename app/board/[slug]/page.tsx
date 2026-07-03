import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/require';
import { getBoardWithColumns } from '@/lib/server/board/boards';
import { listBoardMembers } from '@/lib/server/board/members';
import { BoardNotFoundError } from '@/lib/server/board/errors';
import { BoardView } from '../_components/board-view';

export const dynamic = 'force-dynamic';

export default async function BoardSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/board/${encodeURIComponent(slug)}`);

  const [data, members] = await Promise.all([
    getBoardWithColumns(user.id, slug).catch((err) => {
      if (err instanceof BoardNotFoundError) return null;
      throw err;
    }),
    listBoardMembers(),
  ]);
  if (!data) notFound();

  return (
    <BoardView
      slug={slug}
      initialData={data}
      members={members}
      isAdmin={user.role === 'admin'}
    />
  );
}
