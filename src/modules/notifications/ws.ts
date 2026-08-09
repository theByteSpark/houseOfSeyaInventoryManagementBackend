import type { IncomingMessage } from 'http';
import type { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyAccessToken } from '@/utils/jwt';
import { env } from '@/config/env';

// One entry per userId, holding every open socket for that user (multiple
// tabs/devices). Purely in-memory — a server restart just drops
// connections; clients reconnect on their own (see frontend socket client).
const connections = new Map<string, Set<WebSocket>>();

const allowedOrigins = [
  env.CORS_ORIGIN,
  ...(env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map((o) => o.trim()) : []),
];

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // non-browser clients (no Origin header)
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

function extractToken(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://internal');
  return url.searchParams.get('token');
}

export function initNotificationsWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '', 'http://internal').pathname !== '/ws/notifications') {
      return; // let other upgrade handlers (if any) deal with it
    }

    if (!isOriginAllowed(req.headers.origin)) {
      socket.destroy();
      return;
    }

    const token = extractToken(req);
    if (!token) {
      socket.destroy();
      return;
    }

    let userId: string;
    try {
      userId = verifyAccessToken(token).sub;
    } catch {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, userId);
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, userId: string) => {
    if (!connections.has(userId)) connections.set(userId, new Set());
    connections.get(userId)!.add(ws);

    ws.on('close', () => {
      const sockets = connections.get(userId);
      sockets?.delete(ws);
      if (sockets && sockets.size === 0) connections.delete(userId);
    });

    ws.on('error', () => {
      ws.close();
    });
  });

  return wss;
}

export function pushToUsers(userIds: string[], payload: unknown) {
  const message = JSON.stringify(payload);
  for (const userId of userIds) {
    const sockets = connections.get(userId);
    if (!sockets) continue;
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}
