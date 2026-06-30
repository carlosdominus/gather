export interface Player {
  id: string;
  name: string;
  color: string;
  role: string;
  emoji: string;
  photoUrl?: string;
  x: number;
  y: number;
  muted: boolean;
  cameraOn: boolean;
  deskId: string | null;
  lastActive: number;
}

export interface Desk {
  id: string;
  name: string;
  x: number; // grid column (0-19) or pixel position
  y: number; // grid row (0-13) or pixel position
  occupiedBy: string | null; // Player ID
}

export interface OfficeRoom {
  id: string;
  name: string;
  x: number; // percentage or absolute position
  y: number;
  width: number;
  height: number;
  color: string;
  description: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  timestamp: number;
}

export type ServerMessage =
  | { type: 'welcome'; payload: { id: string; players: Player[]; desks: Desk[] } }
  | { type: 'sync'; payload: { players: Player[]; desks: Desk[] } }
  | { type: 'player_moved'; payload: { id: string; x: number; y: number } }
  | { type: 'chat'; payload: ChatMessage }
  | { type: 'webrtc_signal'; payload: { from: string; to: string; signal: any } };

export type ClientMessage =
  | { type: 'join'; payload: { name: string; color: string; role: string; emoji: string; x: number; y: number } }
  | { type: 'move'; payload: { x: number; y: number } }
  | { type: 'claim_desk'; payload: { deskId: string | null } }
  | { type: 'rename_desk'; payload: { deskId: string; name: string } }
  | { type: 'update_status'; payload: { muted?: boolean; cameraOn?: boolean } }
  | { type: 'chat'; payload: { text: string } }
  | { type: 'webrtc_signal'; payload: { to: string; signal: any } };
