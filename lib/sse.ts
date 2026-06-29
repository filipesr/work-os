/**
 * Builds a Server-Sent-Events `Response` that pushes a JSON snapshot on connect
 * and then every `intervalMs`, until the client disconnects (via the request's
 * abort signal). Used by the TV and live-activity streams to replace client
 * `setInterval` polling.
 *
 * If `snapshot()` throws on a tick (e.g. a transient DB error), a keep-alive
 * comment is sent instead so the connection stays open and the client keeps its
 * last good snapshot.
 */
export function createSnapshotStreamResponse<T>(
  snapshot: () => Promise<T>,
  signal: AbortSignal,
  intervalMs = 10000
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = async () => {
        if (closed) return;
        try {
          const data = await snapshot();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          try {
            controller.enqueue(encoder.encode(`: keep-alive\n\n`));
          } catch {
            /* stream gone */
          }
        }
      };

      void send();
      const interval = setInterval(send, intervalMs);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      if (signal.aborted) close();
      else signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
