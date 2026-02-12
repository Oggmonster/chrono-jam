import type { Route } from "./+types/api-room-events";
import { getRoomState, subscribeToRoomState } from "~/lib/room-store.server";

const keepAliveMs = 15_000;
const retryMs = 2_000;

function formatEventChunk(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const roomId = params.roomId;
  if (!roomId) {
    return new Response("Missing room id", { status: 400 });
  }

  const encoder = new TextEncoder();
  let dispose = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (closed) {
          return;
        }

        closed = true;
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }

        unsubscribe();
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      };

      const enqueue = (payload: string) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          cleanup();
        }
      };

      enqueue(`retry: ${retryMs}\n\n`);
      enqueue(formatEventChunk("room_state", getRoomState(roomId)));

      unsubscribe = subscribeToRoomState(roomId, (state) => {
        enqueue(formatEventChunk("room_state", state));
      });

      keepAliveTimer = setInterval(() => {
        enqueue(": keepalive\n\n");
      }, keepAliveMs);

      const onAbort = () => {
        cleanup();
      };

      request.signal.addEventListener("abort", onAbort);
      dispose = () => {
        request.signal.removeEventListener("abort", onAbort);
        cleanup();
      };
    },
    cancel() {
      dispose();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
