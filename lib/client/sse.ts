// Shared Server-Sent-Events reader for client components.
//
// Several flows consume a `text/event-stream` Response the same way: read the
// body, buffer partial lines across network chunks, and dispatch each
// `event:`/`data:` frame. This centralizes that parsing so each caller only
// writes its own event handler. Callers still own the fetch + `response.ok` /
// JSON-fallback checks; this consumes a confirmed event-stream body and returns
// when the stream ends.
//
// `eventType` persists across reads (a frame can split across chunks), and a
// frame whose JSON fails to parse is skipped rather than throwing.

// data is the JSON-parsed payload of one frame; `any` mirrors JSON.parse and
// lets each handler read its own fields without per-call casting.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SSEHandler = (event: string, data: any) => void;

export async function consumeSSE(
  response: Response,
  onEvent: SSEHandler,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        try {
          onEvent(eventType, JSON.parse(line.slice(6)));
        } catch {
          // skip a malformed / partial frame
        }
      }
    }
  }
}
