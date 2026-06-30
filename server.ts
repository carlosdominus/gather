import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket as WSWebSocket } from 'ws';
import { Player, Desk, ChatMessage } from './src/types.js';

interface ExtendedWebSocket extends WSWebSocket {
  playerId?: string;
  isAlive?: boolean;
}

const PORT = 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Initial Desks Setup in the Virtual Office
let desks: Desk[] = [
  { id: 'desk_1', name: 'Mesa Foco 1', x: 3, y: 3, occupiedBy: null },
  { id: 'desk_2', name: 'Mesa Foco 2', x: 4, y: 3, occupiedBy: null },
  { id: 'desk_3', name: 'Mesa Foco 3', x: 3, y: 4, occupiedBy: null },
  { id: 'desk_4', name: 'Mesa Foco 4', x: 4, y: 4, occupiedBy: null },
  
  { id: 'desk_5', name: 'Mesa Parceria 1', x: 15, y: 3, occupiedBy: null },
  { id: 'desk_6', name: 'Mesa Parceria 2', x: 16, y: 3, occupiedBy: null },
  { id: 'desk_7', name: 'Mesa Parceria 3', x: 15, y: 4, occupiedBy: null },
  { id: 'desk_8', name: 'Mesa Parceria 4', x: 16, y: 4, occupiedBy: null },

  { id: 'desk_9', name: 'Mesa Direção 1', x: 9, y: 10, occupiedBy: null },
  { id: 'desk_10', name: 'Mesa Direção 2', x: 10, y: 10, occupiedBy: null },
];

// Active players in memory
const players: Map<string, Player> = new Map();
// Map of player ID to its active WebSocket connection
const clientConnections: Map<string, ExtendedWebSocket> = new Map();

// Helper to broadcast to all connected clients
function broadcast(message: any) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WSWebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Helper to sync state with all clients
function syncAll() {
  broadcast({
    type: 'sync',
    payload: {
      players: Array.from(players.values()),
      desks: desks
    }
  });
}

// Handle connection upgrade
server.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/ws')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

wss.on('connection', (ws: ExtendedWebSocket) => {
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (messageData) => {
    try {
      const message = JSON.parse(messageData.toString());
      
      switch (message.type) {
        case 'join': {
          const playerId = `usr_${Math.random().toString(36).substr(2, 9)}`;
          ws.playerId = playerId;
          clientConnections.set(playerId, ws);

          const newPlayer: Player = {
            id: playerId,
            name: message.payload.name || 'Colega',
            color: message.payload.color || '#3b82f6',
            role: message.payload.role || 'Membro do Time',
            emoji: message.payload.emoji || '👨‍💻',
            photoUrl: message.payload.photoUrl || '',
            x: message.payload.x ?? 10,
            y: message.payload.y ?? 7,
            muted: false,
            cameraOn: false,
            deskId: null,
            lastActive: Date.now()
          };

          players.set(playerId, newPlayer);

          // Send welcome message with their new ID, current players, and current desks
          ws.send(JSON.stringify({
            type: 'welcome',
            payload: {
              id: playerId,
              players: Array.from(players.values()),
              desks: desks
            }
          }));

          // Notify everyone
          syncAll();
          
          // Send system join message
          broadcast({
            type: 'chat',
            payload: {
              id: `sys_${Date.now()}`,
              senderId: 'system',
              senderName: 'Escritório',
              senderColor: '#6b7280',
              text: `${newPlayer.emoji} ${newPlayer.name} entrou no escritório virtual!`,
              timestamp: Date.now()
            }
          });
          break;
        }

        case 'move': {
          const playerId = ws.playerId;
          if (!playerId) return;

          const player = players.get(playerId);
          if (player) {
            player.x = message.payload.x;
            player.y = message.payload.y;
            player.lastActive = Date.now();
            
            // If player moves away from their claimed desk, unoccupy it unless they are specifically sitting
            // For simple grid system, if they are not on the desk grid cell, we clear desk ocupation or let them keep it
            // Let's clear their desk occupied state if they move to a cell that isn't their desk
            if (player.deskId) {
              const claimedDesk = desks.find(d => d.id === player.deskId);
              if (claimedDesk && (claimedDesk.x !== player.x || claimedDesk.y !== player.y)) {
                claimedDesk.occupiedBy = null;
                player.deskId = null;
              }
            }

            // High frequency movement updates can be sent as delta updates to save bandwidth
            broadcast({
              type: 'player_moved',
              payload: {
                id: playerId,
                x: player.x,
                y: player.y
              }
            });
          }
          break;
        }

        case 'claim_desk': {
          const playerId = ws.playerId;
          if (!playerId) return;

          const player = players.get(playerId);
          if (player) {
            const targetDeskId = message.payload.deskId;
            
            // Clear prior desk occupations for this player
            desks = desks.map(desk => {
              if (desk.occupiedBy === playerId) {
                return { ...desk, occupiedBy: null };
              }
              return desk;
            });

            if (targetDeskId) {
              const desk = desks.find(d => d.id === targetDeskId);
              if (desk && !desk.occupiedBy) {
                desk.occupiedBy = playerId;
                player.deskId = targetDeskId;
                // Teleport player directly to the desk cell
                player.x = desk.x;
                player.y = desk.y;
              }
            } else {
              player.deskId = null;
            }

            player.lastActive = Date.now();
            syncAll();
          }
          break;
        }

        case 'rename_desk': {
          const playerId = ws.playerId;
          if (!playerId) return;

          const { deskId, name } = message.payload;
          const deskIndex = desks.findIndex(d => d.id === deskId);
          if (deskIndex !== -1 && name.trim()) {
            desks[deskIndex].name = name.trim().substring(0, 20);
            syncAll();
          }
          break;
        }

        case 'update_status': {
          const playerId = ws.playerId;
          if (!playerId) return;

          const player = players.get(playerId);
          if (player) {
            if (message.payload.muted !== undefined) {
              player.muted = message.payload.muted;
            }
            if (message.payload.cameraOn !== undefined) {
              player.cameraOn = message.payload.cameraOn;
            }
            player.lastActive = Date.now();
            syncAll();
          }
          break;
        }

        case 'chat': {
          const playerId = ws.playerId;
          if (!playerId) return;

          const player = players.get(playerId);
          if (player && message.payload.text) {
            const chatMsg: ChatMessage = {
              id: `msg_${Math.random().toString(36).substr(2, 9)}`,
              senderId: playerId,
              senderName: player.name,
              senderColor: player.color,
              text: message.payload.text,
              timestamp: Date.now()
            };

            broadcast({
              type: 'chat',
              payload: chatMsg
            });
          }
          break;
        }

        case 'webrtc_signal': {
          const playerId = ws.playerId;
          if (!playerId) return;

          const { to, signal } = message.payload;
          const targetWs = clientConnections.get(to);
          if (targetWs && targetWs.readyState === WSWebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'webrtc_signal',
              payload: {
                from: playerId,
                to,
                signal
              }
            }));
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error handling websocket message:', err);
    }
  });

  ws.on('close', () => {
    const playerId = ws.playerId;
    if (playerId) {
      const player = players.get(playerId);
      players.delete(playerId);
      clientConnections.delete(playerId);

      // Free any occupied desk
      desks = desks.map(desk => {
        if (desk.occupiedBy === playerId) {
          return { ...desk, occupiedBy: null };
        }
        return desk;
      });

      syncAll();

      if (player) {
        // Send system leave message
        broadcast({
          type: 'chat',
          payload: {
            id: `sys_${Date.now()}`,
            senderId: 'system',
            senderName: 'Escritório',
            senderColor: '#6b7280',
            text: `${player.name} saiu do escritório virtual.`,
            timestamp: Date.now()
          }
        });
      }
    }
  });
});

// Clean up stale websocket connections every 30s
const interval = setInterval(() => {
  wss.clients.forEach((ws: ExtendedWebSocket) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// Configure API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', onlinePlayers: players.size });
});

// Setup Vite Dev server or Serve static files
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
