/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  MessageSquare,
  Settings,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Briefcase,
  Coffee,
  Volume2,
  Tv,
  CheckCircle2,
  Lock,
  Edit2,
  Sparkles,
  ExternalLink,
  Laptop,
  Smile,
  LogOut,
  Send,
  Building,
  User,
  Info,
  ChevronLeft,
  ChevronRight,
  Upload,
  ZoomIn,
  ZoomOut,
  Mail,
  Key,
  X
} from 'lucide-react';
import { Player, Desk, ChatMessage, OfficeRoom } from './types';
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';

// Grid size settings
const GRID_COLS = 20;
const GRID_ROWS = 14;
const TILE_SIZE = 44; // pixels

// Office Rooms definition
const OFFICE_ROOMS: OfficeRoom[] = [
  {
    id: 'meeting_room',
    name: 'Sala de Reunião',
    x: 7,
    y: 0,
    width: 7,
    height: 5,
    color: 'bg-slate-100/40 border-slate-300',
    description: 'Entre para ingressar automaticamente em uma chamada com todos na sala.'
  },
  {
    id: 'lounge',
    name: 'Café & Lounge',
    x: 0,
    y: 8,
    width: 7,
    height: 6,
    color: 'bg-emerald-50/40 border-emerald-200',
    description: 'Área de descanso com sofás, plantas e máquina de café.'
  },
  {
    id: 'reception',
    name: 'Recepção',
    x: 13,
    y: 8,
    width: 7,
    height: 6,
    color: 'bg-orange-50/40 border-orange-200',
    description: 'Hall de entrada e área de boas-vindas do escritório.'
  },
  {
    id: 'work_bay_left',
    name: 'Área de Trabalho (Ala Oeste)',
    x: 1,
    y: 1,
    width: 6,
    height: 7,
    color: 'bg-amber-50/20 border-amber-200',
    description: 'Baias individuais de foco.'
  },
  {
    id: 'work_bay_right',
    name: 'Área de Trabalho (Ala Leste)',
    x: 14,
    y: 1,
    width: 6,
    height: 7,
    color: 'bg-amber-50/20 border-amber-200',
    description: 'Baias individuais de foco.'
  }
];

// Blocked tiles (walls, tables, furniture)
const BLOCKED_TILES = new Set<string>([
  // Meeting room walls (y = 5, col 7 to 13, except door at 10,5)
  '7,5', '8,5', '9,5', '11,5', '12,5', '13,5',
  // Meeting room side walls
  '6,0', '6,1', '6,2', '6,3', '6,4',
  '14,0', '14,1', '14,2', '14,3', '14,4',
  
  // Meeting room table
  '9,2', '10,2', '11,2', '12,2',
  '9,3', '10,3', '11,3', '12,3',

  // Lounge top wall (y = 7, col 0 to 7, except door at 6,7)
  '0,7', '1,7', '2,7', '3,7', '4,7', '5,7', '7,7',
  // Lounge espresso counter
  '1,11', '1,12',

  // Reception top wall (y = 7, col 13 to 19, except door at 14,7)
  '13,7', '15,7', '16,7', '17,7', '18,7', '19,7',
  // Reception desk
  '16,10', '17,10'
]);

// Professional fallbacks
const getInitials = (name: string): string => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const PROFESSIONAL_COLORS = [
  '#4A5568', // Slate Gray
  '#2C5282', // Dark Navy
  '#276749', // Forest Green
  '#744210', // Deep Bronze
  '#9B2C2C', // Deep Crimson
  '#44337A', // Deep Indigo
  '#2B6CB0', // Corporate Blue
  '#2D3748', // Charcoal
];

const getProfessionalColor = (name: string): string => {
  if (!name) return '#5A5A40'; // Default Slate
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PROFESSIONAL_COLORS.length;
  return PROFESSIONAL_COLORS[index];
};

const ROLES = [
  'Desenvolvedor(a)',
  'Designer UI/UX',
  'Product Manager',
  'Gerente de Projetos',
  'Marketing',
  'Atendimento',
  'Diretor(a)',
  'Outro'
];

export default function App() {
  // Firebase Auth & User States
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [authError, setAuthError] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Profile fields
  const [username, setUsername] = useState('');
  const [selectedRole, setSelectedRole] = useState(ROLES[0]);

  // Image Cropping & Zoom States
  const [cropping, setCropping] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Sidebar collapsing
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Tutorial / Instructions showing (only for first login/onboarding)
  const [showTutorial, setShowTutorial] = useState(() => {
    return localStorage.getItem('virtual_office_seen_tutorial') !== 'true';
  });

  // Zooming in/out on the map
  const [mapZoom, setMapZoom] = useState(1);

  // Sync / Room States
  const [clientId, setClientId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [desks, setDesks] = useState<Desk[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [connected, setConnected] = useState(false);

  // Keyboard navigation & local coordinates
  const [myPos, setMyPos] = useState({ x: 10, y: 7 }); // Spawn in central hallway
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);

  // Custom desk rename modal
  const [renamingDesk, setRenamingDesk] = useState<Desk | null>(null);
  const [newDeskLabel, setNewDeskLabel] = useState('');

  // Sidebar / UI Layout
  const [activeTab, setActiveTab] = useState<'team' | 'chat' | 'settings'>('team');
  const [showMeetHelp, setShowMeetHelp] = useState(false);

  // Speech bubble timers
  const [speechBubbles, setSpeechBubbles] = useState<Map<string, { text: string; expires: number }>>(new Map());

  const socketRef = useRef<WebSocket | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Get current local player object
  const me = useMemo(() => {
    return players.find((p) => p.id === clientId) || null;
  }, [players, clientId]);

  // Helper to determine if a tile is walkable
  const isWalkable = (x: number, y: number) => {
    if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) return false;
    return !BLOCKED_TILES.has(`${x},${y}`);
  };

  // Connect to websocket server
  const connectWebSocket = () => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Join immediately if already logged in
      if (isLoggedIn && username.trim()) {
        ws.send(
          JSON.stringify({
            type: 'join',
            payload: {
              name: username.trim(),
              color: getProfessionalColor(username.trim()),
              role: selectedRole,
              emoji: '',
              photoUrl: photoUrl || '',
              x: myPos.x,
              y: myPos.y
            }
          })
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'welcome': {
            setClientId(msg.payload.id);
            setPlayers(msg.payload.players);
            setDesks(msg.payload.desks);
            
            // Find self in list to align coordinates
            const selfPlayer = msg.payload.players.find((p: Player) => p.id === msg.payload.id);
            if (selfPlayer) {
              setMyPos({ x: selfPlayer.x, y: selfPlayer.y });
            }
            break;
          }

          case 'sync': {
            setPlayers(msg.payload.players);
            setDesks(msg.payload.desks);
            break;
          }

          case 'player_moved': {
            const { id, x, y } = msg.payload;
            setPlayers((prev) =>
              prev.map((p) => (p.id === id ? { ...p, x, y } : p))
            );
            break;
          }

          case 'chat': {
            const chatMsg: ChatMessage = msg.payload;
            setChatMessages((prev) => [...prev, chatMsg].slice(-100)); // Keep last 100 messages
            
            // Set floating speech bubble on the map
            if (chatMsg.senderId !== 'system') {
              setSpeechBubbles((prev) => {
                const next = new Map(prev);
                next.set(chatMsg.senderId, {
                  text: chatMsg.text,
                  expires: Date.now() + 5000 // 5 seconds duration
                });
                return next;
              });
            }
            break;
          }
        }
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setClientId(null);
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (isLoggedIn) {
          connectWebSocket();
        }
      }, 3000);
    };

    ws.onerror = () => {
      setConnected(false);
    };
  };

  // Clean speech bubbles periodically
  useEffect(() => {
    const bubbleInterval = setInterval(() => {
      setSpeechBubbles((prev) => {
        const next = new Map<string, { text: string; expires: number }>(prev);
        let changed = false;
        const now = Date.now();
        next.forEach((val, key) => {
          if (now > val.expires) {
            next.delete(key);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(bubbleInterval);
  }, []);

  // Wheel zoom listener (Ctrl + Scroll)
  useEffect(() => {
    const workspaceElement = document.getElementById('map_workspace');
    if (!workspaceElement) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        setMapZoom((prev) => {
          const nextZoom = prev + delta;
          return Math.min(3.0, Math.max(0.5, nextZoom));
        });
      }
    };

    workspaceElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      workspaceElement.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setProfileLoading(true);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            setUsername(data.name || '');
            setSelectedRole(data.role || ROLES[0]);
            setPhotoUrl(data.photoUrl || null);
            setIsLoggedIn(true);
            setShowProfileSetup(false);
          } else {
            // First time login - profile not created yet
            setShowProfileSetup(true);
            setIsLoggedIn(false);
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
          setAuthError('Erro ao carregar o seu perfil.');
        } finally {
          setProfileLoading(false);
          setAuthLoading(false);
        }
      } else {
        setIsLoggedIn(false);
        setShowProfileSetup(false);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Connect on Login
  useEffect(() => {
    if (isLoggedIn) {
      connectWebSocket();
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [isLoggedIn]);

  // Firebase Email Sign In
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setAuthError('Por favor, preencha todos os campos.');
      return;
    }
    setAuthError('');
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error(err);
      let errMsg = 'Erro ao entrar. Verifique os dados.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errMsg = 'E-mail ou senha incorretos.';
      } else if (err.code === 'auth/invalid-email') {
        errMsg = 'Formato de e-mail inválido.';
      }
      setAuthError(errMsg);
      setAuthLoading(false);
    }
  };

  // Firebase Email Sign Up / Register
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !username.trim()) {
      setAuthError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    setAuthError('');
    setAuthLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;

      const profile = {
        uid: user.uid,
        email: user.email || '',
        name: username.trim(),
        role: selectedRole,
        color: getProfessionalColor(username.trim()),
        emoji: '',
        photoUrl: photoUrl || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', user.uid), profile);
      // onAuthStateChanged will handle the logging in!
    } catch (err: any) {
      console.error(err);
      let errMsg = 'Erro ao cadastrar. Tente novamente.';
      if (err.code === 'auth/email-already-in-use') {
        errMsg = 'Este endereço de e-mail já está em uso por outro usuário.';
      } else if (err.code === 'auth/weak-password') {
        errMsg = 'A senha deve conter no mínimo 6 caracteres.';
      } else if (err.code === 'auth/invalid-email') {
        errMsg = 'Formato de e-mail inválido.';
      }
      setAuthError(errMsg);
      setAuthLoading(false);
    }
  };

  // Google Sign In Handler
  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(auth, provider);
      const user = credential.user;
      
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        setUsername(data.name || '');
        setSelectedRole(data.role || ROLES[0]);
        setPhotoUrl(data.photoUrl || null);
        setIsLoggedIn(true);
        setShowProfileSetup(false);
      } else {
        // First time Google Sign In - profile not created yet
        setUsername(user.displayName || '');
        setPhotoUrl(user.photoURL || null);
        setShowProfileSetup(true);
        setIsLoggedIn(false);
      }
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setAuthError('Erro ao entrar com o Google. Tente novamente.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // First Login / Complete profile handler
  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setAuthError('O nome é obrigatório.');
      return;
    }
    const user = auth.currentUser;
    if (!user) return;

    setAuthLoading(true);
    try {
      const profile = {
        uid: user.uid,
        email: user.email || '',
        name: username.trim(),
        role: selectedRole,
        color: getProfessionalColor(username.trim()),
        emoji: '',
        photoUrl: photoUrl || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'users', user.uid), profile);
      setShowProfileSetup(false);
      setIsLoggedIn(true);
    } catch (err) {
      console.error(err);
      setAuthError('Erro ao finalizar o cadastro.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Sign out handler
  const handleSignOut = async () => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    await signOut(auth);
    setIsLoggedIn(false);
    setUsername('');
    setPhotoUrl(null);
  };

  // Handle local file selection
  const onImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setTempImageSrc(reader.result as string);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setCropping(true);
      };
      reader.readAsDataURL(file);
    }
  };

  // Canvas Image Cropping & Zoom Execution
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleCrop = () => {
    if (!imgRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 128);
      
      const img = imgRef.current;
      const imgWidth = img.clientWidth;
      const imgHeight = img.clientHeight;
      
      // Target viewport size: 96x96px crop area at center of 192x192px viewport.
      // Scaling factor from viewport to output canvas:
      const cssToCanvas = 128 / 96;
      
      ctx.save();
      // Translate canvas center
      ctx.translate(64, 64);
      
      // Translate user dragging offsets (scaled to output canvas size)
      ctx.translate(offset.x * cssToCanvas, offset.y * cssToCanvas);
      
      // Draw image scaled by zoom factor
      const dw = imgWidth * zoom * cssToCanvas;
      const dh = imgHeight * zoom * cssToCanvas;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      
      ctx.restore();
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setPhotoUrl(dataUrl);
      
      // If logged in, update database instantly
      if (isLoggedIn && auth.currentUser) {
        updateProfileInFirestore({ photoUrl: dataUrl });
      }

      setCropping(false);
      setTempImageSrc(null);
    }
  };

  // Firestore instant profile updates
  const updateProfileInFirestore = async (updatedFields: any) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...updatedFields,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error updating profile in firestore:', err);
    }
  };

  // Movement execution helper
  const movePlayer = (dx: number, dy: number) => {
    setMyPos((prev) => {
      const nextX = prev.x + dx;
      const nextY = prev.y + dy;
      if (isWalkable(nextX, nextY)) {
        // Send move event to websocket
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              type: 'move',
              payload: { x: nextX, y: nextY }
            })
          );
        }
        return { x: nextX, y: nextY };
      }
      return prev;
    });
  };

  // Keyboard controls listener
  useEffect(() => {
    if (!isLoggedIn || !connected) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keys if user is typing in chat or model input
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          movePlayer(0, -1);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          movePlayer(0, 1);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          movePlayer(-1, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          movePlayer(1, 0);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoggedIn, connected]);

  // Interactive desk sitting claim
  const claimDesk = (deskId: string | null) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'claim_desk',
          payload: { deskId }
        })
      );
    }
  };

  // Desk rename execution
  const executeDeskRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingDesk || !newDeskLabel.trim()) return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'rename_desk',
          payload: { deskId: renamingDesk.id, name: newDeskLabel.trim() }
        })
      );
    }
    setRenamingDesk(null);
    setNewDeskLabel('');
  };

  // Status updates: mic & camera toggle
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'update_status',
          payload: { muted: nextMuted }
        })
      );
    }
  };

  const toggleCamera = () => {
    const nextCam = !isCameraOn;
    setIsCameraOn(nextCam);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'update_status',
          payload: { cameraOn: nextCam }
        })
      );
    }
  };

  // Chat message submit
  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'chat',
          payload: { text: inputText.trim() }
        })
      );
      setInputText('');
    }
  };

  // Check if player is inside any room
  const getPlayerRoom = (player: Player): OfficeRoom | null => {
    for (const room of OFFICE_ROOMS) {
      if (
        player.x >= room.x &&
        player.x < room.x + room.width &&
        player.y >= room.y &&
        player.y < room.y + room.height
      ) {
        return room;
      }
    }
    return null;
  };

  // PROXIMITY MEETING GRAPH & BFS CLUSTERING
  // Calculates real-time group meetings based on distance or room overlap
  const callSession = useMemo(() => {
    if (!me) return null;

    const myRoom = getPlayerRoom(me);
    
    // CASE A: Meeting Room Call
    // If the local user is inside the Meeting Room ("Sala de Reunião"),
    // everyone in the meeting room is part of this exact same call automatically.
    if (myRoom && myRoom.id === 'meeting_room') {
      const peers = players.filter(
        (p) => p.id !== me.id && getPlayerRoom(p)?.id === 'meeting_room'
      );
      return {
        type: 'meeting_room',
        roomName: 'SalaReuniao',
        title: 'Mesa Redonda: Sala de Reunião',
        participants: [me, ...peers]
      };
    }

    // CASE B: Proximity Call Clustering via BFS
    // We group all adjacent players (distance <= 2.2 tiles) into clusters.
    // This solves multi-party proximity calling robustly!
    const clusters: string[][] = [];
    const visited = new Set<string>();
    
    // Filter out players already inside the Meeting Room (they have their own room conference)
    const activeFloorPlayers = players.filter(
      (p) => getPlayerRoom(p)?.id !== 'meeting_room'
    );

    for (const p of activeFloorPlayers) {
      if (!visited.has(p.id)) {
        const cluster: string[] = [];
        const queue = [p.id];
        visited.add(p.id);

        while (queue.length > 0) {
          const currId = queue.shift()!;
          cluster.push(currId);

          const currPlayer = activeFloorPlayers.find((pl) => pl.id === currId);
          if (currPlayer) {
            // Find neighbors within 2.2 distance units (allows diagonal)
            const neighbors = activeFloorPlayers.filter((pl) => {
              if (pl.id === currId || visited.has(pl.id)) return false;
              const dist = Math.sqrt(
                Math.pow(currPlayer.x - pl.x, 2) + Math.pow(currPlayer.y - pl.y, 2)
              );
              return dist <= 2.2;
            });

            for (const n of neighbors) {
              visited.add(n.id);
              queue.push(n.id);
            }
          }
        }

        if (cluster.length > 1) {
          clusters.push(cluster);
        }
      }
    }

    // Find the cluster that contains the local player
    const myClusterIds = clusters.find((c) => c.includes(me.id));
    if (myClusterIds && myClusterIds.length > 1) {
      const clusterPlayers = players.filter((p) => myClusterIds.includes(p.id));
      // Generate a consistent, hashed-like room key based on sorted IDs
      const uniqueRoomSuffix = [...myClusterIds].sort().join('-');
      return {
        type: 'proximity',
        roomName: `Proximidade-${uniqueRoomSuffix.substring(0, 30)}`,
        title: 'Chamada de Vídeo por Proximidade',
        participants: clusterPlayers
      };
    }

    return null;
  }, [players, me]);

  // Jitsi Meet Frame URL Generator
  // We use Jitsi Meet's open server for high-fidelity webRTC voice and video in our iframe.
  // It provides native screen sharing, layout adjustments, and localized Portuguese support.
  const jitsiUrl = useMemo(() => {
    if (!callSession || !me) return '';
    const cleanRoomName = callSession.roomName
      .replace(/[^a-zA-Z0-9-]/g, '')
      .substring(0, 50);

    // Build configuration hash to make the UI ultra clean and in Portuguese
    return `https://meet.jit.si/${cleanRoomName}#config.prejoinPageEnabled=false&config.startWithAudioMuted=${isMuted}&config.startWithVideoMuted=${!isCameraOn}&config.lang=pt-br&interfaceConfig.TOOLBAR_BUTTONS=["microphone","camera","chat","tileview"]&interfaceConfig.SETTINGS_SECTIONS=["devices"]`;
  }, [callSession, me?.id]);

  // Handle tile map cell click-to-walk
  const handleMapClick = (col: number, row: number) => {
    if (!isLoggedIn || !connected) return;
    
    // Check if the tile is walkable
    if (isWalkable(col, row)) {
      // Move there
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'move',
            payload: { x: col, y: row }
          })
        );
      }
      setMyPos({ x: col, y: row });
    }
  };

  // Render a visual preview of local camera stream in header or settings
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    
    async function setupStream() {
      if (isCameraOn && localVideoRef.current) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 160, height: 120 },
            audio: false
          });
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error('Error accessing local webcam:', err);
        }
      }
    }

    setupStream();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isCameraOn]);

  return (
    <div className="min-h-screen bg-[#F2F1ED] text-[#4A4A3A] font-sans flex flex-col" id="app_root">
      {/* 1. LOGIN / CHARACTER SELECTOR */}
      <AnimatePresence>
        {!isLoggedIn && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#4A4A3A]/40 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto"
            id="login_overlay"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white border border-[#DCDAD2] rounded-3xl p-8 max-w-lg w-full shadow-2xl relative text-[#4A4A3A]"
              id="login_card"
            >
              {/* Background Ambient Glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#5A5A40]/5 rounded-full blur-3xl -z-10 pointer-events-none" />

              <div className="flex items-center gap-3 mb-6 justify-center">
                <div className="p-3 bg-[#5A5A40] rounded-2xl shadow-lg text-white">
                  <Building className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-bold tracking-tight text-[#2D2D24] leading-none">
                    Escritório Virtual
                  </h1>
                  <p className="text-xs text-[#8C8A7C] mt-1 font-mono">GATHER.TOWN DOMINUS ALTERNATIVE</p>
                </div>
              </div>

              {/* Error alerts */}
              {authError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold mb-4 text-center">
                  {authError}
                </div>
              )}

              {/* PROFILE SETUP MODE (FIRST LOGIN ONLY) */}
              {showProfileSetup ? (
                <div className="space-y-5">
                  <div className="bg-[#96A08A]/10 border border-[#96A08A]/20 rounded-2xl p-4 flex gap-3 text-sm text-[#4A4A3A]">
                    <Sparkles className="w-5 h-5 shrink-0 text-[#5A5A40] mt-0.5" />
                    <div>
                      <span className="font-semibold text-[#2D2D24]">Bem-vindo! Complete seu Perfil</span>
                      <p className="text-xs text-[#4A4A3A] mt-0.5 leading-relaxed">
                        Escolha o seu cargo, avatar e ajuste sua foto de perfil abaixo para que seus colegas o reconheçam!
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleCompleteProfile} className="space-y-4">
                    {/* 1. Name input */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#8C8A7C] mb-2">
                        Seu nome completo ou apelido
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Ex: Carlos Silva"
                          maxLength={18}
                          className="w-full bg-[#F9F8F6] border border-[#DCDAD2] rounded-xl px-4 py-3 pl-11 text-[#2D2D24] placeholder-[#8C8A7C] focus:outline-none focus:border-[#5A5A40]"
                        />
                        <User className="absolute left-4 top-3.5 w-4 h-4 text-[#8C8A7C]" />
                      </div>
                    </div>

                    {/* 2. Choose Role */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#8C8A7C] mb-2">
                        Seu Cargo
                      </label>
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="w-full bg-[#F9F8F6] border border-[#DCDAD2] rounded-xl px-4 py-3 text-[#2D2D24] focus:outline-none focus:border-[#5A5A40] cursor-pointer"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r} className="bg-white text-[#4A4A3A]">
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* 4. PHOTO UPLOAD AND CROPPING MODULE */}
                    <div className="border border-[#DCDAD2] rounded-2xl p-4 bg-[#F9F8F6]/50 space-y-3">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#8C8A7C]">
                        Foto de Perfil
                      </label>

                      <div className="flex items-center gap-4">
                        <div
                          className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-sans font-bold text-white uppercase shrink-0 shadow-inner overflow-hidden border border-[#DCDAD2]"
                          style={{ backgroundColor: getProfessionalColor(username) }}
                        >
                          {photoUrl ? (
                            <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            getInitials(username)
                          )}
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-1.5">
                          <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-[#DCDAD2] hover:bg-[#F9F8F6] text-[#4A4A3A] font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-sm self-start">
                            <Upload className="w-4 h-4 text-[#5A5A40]" />
                            Carregar Foto
                            <input type="file" accept="image/*" onChange={onImageSelected} className="hidden" />
                          </label>
                          {photoUrl && (
                            <button
                              type="button"
                              onClick={() => setPhotoUrl(null)}
                              className="text-xs text-rose-600 hover:underline text-left self-start cursor-pointer"
                            >
                              Remover Foto
                            </button>
                          )}
                          <p className="text-[10px] text-[#8C8A7C] leading-normal">
                            Recomendado: imagens quadradas. Você poderá arrastar e ajustar o zoom no popup.
                          </p>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-4 bg-[#5A5A40] hover:bg-[#4A4A34] text-white rounded-xl shadow-lg font-semibold cursor-pointer transition-all flex items-center justify-center gap-2"
                    >
                      {authLoading ? (
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Salvar e Entrar no Escritório Virtual'
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                /* NORMAL EMAIL LOGIN / REGISTER FORM */
                <div className="space-y-5">
                  <div className="flex border-b border-[#DCDAD2]">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setAuthError('');
                      }}
                      className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider relative transition-colors ${
                        authMode === 'login' ? 'text-[#2D2D24]' : 'text-[#8C8A7C]'
                      }`}
                    >
                      Acessar Conta
                      {authMode === 'login' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5A5A40]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setAuthError('');
                      }}
                      className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider relative transition-colors ${
                        authMode === 'register' ? 'text-[#2D2D24]' : 'text-[#8C8A7C]'
                      }`}
                    >
                      Criar Conta
                      {authMode === 'register' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5A5A40]" />
                      )}
                    </button>
                  </div>

                  <form onSubmit={authMode === 'login' ? handleSignIn : handleSignUp} className="space-y-4">
                    {/* E-mail */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#8C8A7C] mb-2">
                        Endereço de E-mail
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Ex: carlos@dominus.site"
                        className="w-full bg-[#F9F8F6] border border-[#DCDAD2] rounded-xl px-4 py-3 text-[#2D2D24] focus:outline-none focus:border-[#5A5A40]"
                      />
                    </div>

                    {/* Senha */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#8C8A7C] mb-2">
                        Senha Secreta
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="No mínimo 6 caracteres"
                        className="w-full bg-[#F9F8F6] border border-[#DCDAD2] rounded-xl px-4 py-3 text-[#2D2D24] focus:outline-none focus:border-[#5A5A40]"
                      />
                    </div>

                    {/* Pre-fill details if registering */}
                    {authMode === 'register' && (
                      <div className="space-y-4 border-t border-[#DCDAD2]/60 pt-4 mt-2">
                        <span className="text-[10px] font-bold text-[#8C8A7C] uppercase tracking-wider block">
                          Dados Básicos do Avatar
                        </span>

                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-[#8C8A7C] mb-2">
                            Nome / Apelido
                          </label>
                          <input
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Ex: Carlos"
                            maxLength={18}
                            className="w-full bg-[#F9F8F6] border border-[#DCDAD2] rounded-xl px-4 py-3 text-[#2D2D24] focus:outline-none focus:border-[#5A5A40]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-[#8C8A7C] mb-2">
                            Cargo na Empresa
                          </label>
                          <select
                            value={selectedRole}
                            onChange={(e) => setSelectedRole(e.target.value)}
                            className="w-full bg-[#F9F8F6] border border-[#DCDAD2] rounded-xl px-4 py-3 text-[#2D2D24] focus:outline-none focus:border-[#5A5A40] cursor-pointer"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-4 bg-[#5A5A40] hover:bg-[#4A4A34] text-white rounded-xl shadow-lg font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      {authLoading ? (
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : authMode === 'login' ? (
                        'Entrar no Escritório'
                      ) : (
                        'Próximo Passo: Personalizar Avatar 🛠️'
                      )}
                    </button>

                    <div className="relative flex py-2 items-center justify-center">
                      <div className="flex-grow border-t border-[#DCDAD2]"></div>
                      <span className="flex-shrink mx-4 text-[#8C8A7C] text-[10px] font-bold uppercase tracking-wider">ou</span>
                      <div className="flex-grow border-t border-[#DCDAD2]"></div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={authLoading}
                      className="w-full py-3.5 bg-white border border-[#DCDAD2] hover:bg-[#F9F8F6] text-[#4A4A3A] rounded-xl shadow-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2.5"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Entrar com o Google
                    </button>
                  </form>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. CORE SYSTEM LAYOUT (WHEN LOGGED IN) */}
      {isLoggedIn && (
        <>
          {/* HEADER BAR */}
          <header className="bg-white border-b border-[#DCDAD2] h-16 shrink-0 flex items-center justify-between px-6 z-10" id="app_header">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#5A5A40] flex items-center justify-center text-white">
                <Building className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="font-display font-bold text-[#2D2D24] text-base leading-none">Virtual Office</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-600' : 'bg-rose-500 animate-pulse'}`} />
                  <span className="text-[10px] text-[#8C8A7C] font-mono tracking-wider">
                    {connected ? 'REAL-TIME INTEGRADO' : 'RECONECTANDO...'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions & Status */}
            <div className="flex items-center gap-4">
              {/* Selfie Camera Miniature */}
              {isCameraOn && (
                <div className="hidden sm:flex items-center gap-2 bg-[#F9F8F6] border border-[#DCDAD2] rounded-xl p-1.5 pr-3">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-white relative">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  </div>
                  <span className="text-xs text-[#4A4A3A] font-medium">Sua Câmera</span>
                </div>
              )}

              {/* Toggle Status Buttons */}
              <div className="flex bg-[#F9F8F6] border border-[#DCDAD2] rounded-xl p-1 gap-1">
                <button
                  onClick={toggleMute}
                  className={`p-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                    isMuted
                      ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                      : 'text-[#4A4A3A] hover:bg-[#E5E2D9] hover:text-[#2D2D24]'
                  }`}
                  title={isMuted ? 'Ativar Microfone' : 'Mutar Microfone'}
                  id="toggle_mic_btn"
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span className="text-xs hidden md:inline font-semibold">Microfone</span>
                </button>

                <button
                  onClick={toggleCamera}
                  className={`p-2 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                    isCameraOn
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'text-[#4A4A3A] hover:bg-[#E5E2D9] hover:text-[#2D2D24]'
                  }`}
                  title={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera'}
                  id="toggle_camera_btn"
                >
                  {isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                  <span className="text-xs hidden md:inline font-semibold">Câmera</span>
                </button>
              </div>

              {/* Profile Card & LogOut */}
              {me && (
                <div className="flex items-center gap-3 border-l border-[#DCDAD2] pl-4">
                  <div className="text-right hidden lg:block">
                    <p className="text-xs font-bold text-[#2D2D24] leading-tight">{me.name}</p>
                    <p className="text-[10px] text-[#8C8A7C] leading-none mt-0.5">{me.role}</p>
                  </div>
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-sans font-bold text-white uppercase shadow-inner overflow-hidden select-none shrink-0"
                    style={{ backgroundColor: getProfessionalColor(me.name) }}
                  >
                    {me.photoUrl ? (
                      <img src={me.photoUrl} alt={me.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      getInitials(me.name)
                    )}
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="p-2 rounded-lg text-[#8C8A7C] hover:bg-[#FEF2F2] hover:text-rose-600 transition-all cursor-pointer"
                    title="Sair do Escritório"
                    id="logout_btn"
                  >
                    <LogOut className="w-4.5 h-4.5" />
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* MAIN CONTAINER */}
          <div className="flex-1 flex min-h-0 relative bg-[#F2F1ED]" id="main_layout">
            
            {/* COLLAPSIBLE SIDEBAR: USER LIST, CHAT, SETTINGS */}
            <AnimatePresence initial={false}>
              {!sidebarCollapsed && (
                <motion.aside
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 320, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="w-80 shrink-0 bg-white border-r border-[#DCDAD2] flex flex-col min-h-0 z-10 overflow-hidden relative"
                  id="sidebar_area"
                >
                  {/* Tabs selector */}
                  <div className="flex border-b border-[#DCDAD2] shrink-0">
                    <button
                      onClick={() => setActiveTab('team')}
                      className={`flex-1 py-4 text-xs font-display font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer relative ${
                        activeTab === 'team' ? 'text-[#2D2D24]' : 'text-[#8C8A7C] hover:text-[#5A5A40]'
                      }`}
                      id="tab_btn_team"
                    >
                      <Users className="w-4 h-4" />
                      Time ({players.length})
                      {activeTab === 'team' && (
                        <motion.div
                          layoutId="active_tab_bar"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5A5A40]"
                        />
                      )}
                    </button>

                    <button
                      onClick={() => setActiveTab('chat')}
                      className={`flex-1 py-4 text-xs font-display font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer relative ${
                        activeTab === 'chat' ? 'text-[#2D2D24]' : 'text-[#8C8A7C] hover:text-[#5A5A40]'
                      }`}
                      id="tab_btn_chat"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Chat Geral
                      {activeTab === 'chat' && (
                        <motion.div
                          layoutId="active_tab_bar"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5A5A40]"
                        />
                      )}
                    </button>

                    <button
                      onClick={() => setActiveTab('settings')}
                      className={`flex-1 py-4 text-xs font-display font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer relative ${
                        activeTab === 'settings' ? 'text-[#2D2D24]' : 'text-[#8C8A7C] hover:text-[#5A5A40]'
                      }`}
                      id="tab_btn_settings"
                    >
                      <Settings className="w-4 h-4" />
                      Configurações
                      {activeTab === 'settings' && (
                        <motion.div
                          layoutId="active_tab_bar"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5A5A40]"
                        />
                      )}
                    </button>
                  </div>

                  {/* TAB CONTENT: TEAM MEMBERS */}
                  {activeTab === 'team' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4" id="sidebar_team">
                      {/* Interactive instructions */}
                      <div className="bg-[#5A5A40]/5 border border-[#5A5A40]/10 p-3.5 rounded-2xl text-xs space-y-1.5 text-[#4A4A3A]">
                        <span className="font-display font-bold text-[#2D2D24] block">Escritório Colaborativo</span>
                        <p className="leading-relaxed">
                          Aproxime-se de qualquer pessoa para iniciar uma chamada de voz e vídeo por proximidade instantaneamente.
                        </p>
                      </div>

                      {/* Team online count list */}
                      <div className="space-y-2.5">
                        <h3 className="text-[10px] font-bold text-[#8C8A7C] tracking-wider uppercase mb-1">
                          Presentes no Escritório
                        </h3>
                        
                        {players.map((p) => {
                          const isMe = p.id === clientId;
                          const roomObj = getPlayerRoom(p);

                          return (
                            <div
                              key={p.id}
                              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                                isMe
                                  ? 'bg-[#5A5A40]/5 border-[#5A5A40]/20 shadow-sm'
                                  : 'bg-[#F9F8F6] border-[#DCDAD2]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-sans font-bold text-white uppercase shrink-0 shadow-inner overflow-hidden select-none"
                                  style={{ backgroundColor: getProfessionalColor(p.name) }}
                                >
                                  {p.photoUrl ? (
                                    <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    getInitials(p.name)
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-[#2D2D24]">
                                      {p.name}
                                    </span>
                                    {isMe && (
                                      <span className="text-[7px] bg-[#5A5A40]/10 text-[#5A5A40] font-bold px-1 rounded">
                                        VC
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-[#8C8A7C] mt-0.5 leading-none">{p.role}</p>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="px-1.5 py-0.5 bg-[#F9F8F6] border border-[#DCDAD2] rounded text-[8px] font-semibold text-[#4A4A3A] uppercase">
                                  {roomObj ? roomObj.name.split(' ')[0] : 'Corredor'}
                                </span>
                                <div className="flex justify-end gap-1 mt-1">
                                  {p.cameraOn ? (
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white block shadow-sm" title="Câmera Ligada" />
                                  ) : (
                                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-white block shadow-sm" title="Câmera Desligada" />
                                  )}
                                  {p.muted ? (
                                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-white block shadow-sm" title="Mudo" />
                                  ) : (
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white block shadow-sm" title="Microfone Aberto" />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB CONTENT: CHAT */}
                  {activeTab === 'chat' && (
                    <div className="flex-1 flex flex-col min-h-0 bg-white" id="sidebar_chat">
                      {/* Message History area */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col-reverse">
                        <div className="flex flex-col space-y-3">
                          {chatMessages.map((msg, idx) => {
                            const isSystem = msg.senderId === 'system';
                            const isSenderMe = msg.senderId === clientId;

                            if (isSystem) {
                              return (
                                <div key={idx} className="flex justify-center">
                                  <span className="text-[10px] bg-[#F2F1ED] border border-[#DCDAD2] text-[#8C8A7C] px-3 py-1 rounded-full font-mono">
                                    {msg.text}
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={idx}
                                className={`flex flex-col max-w-[85%] ${
                                  isSenderMe ? 'self-end items-end' : 'self-start items-start'
                                }`}
                              >
                                <span className="text-[10px] text-[#8C8A7C] mb-0.5 px-1 font-bold">
                                  {msg.senderName} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <div
                                  className={`px-3 py-2 rounded-2xl text-xs break-words font-medium ${
                                    isSenderMe
                                      ? 'bg-[#5A5A40] text-white rounded-tr-none shadow-md shadow-[#5A5A40]/15'
                                      : 'bg-[#F9F8F6] border border-[#DCDAD2] text-[#2D2D24] rounded-tl-none'
                                  }`}
                                >
                                  {msg.text}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Chat Input form */}
                      <form onSubmit={sendChatMessage} className="p-3 border-t border-[#DCDAD2] bg-[#F9F8F6] flex gap-2 shrink-0">
                        <input
                          type="text"
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder="Falar com todos no chat..."
                          maxLength={120}
                          className="flex-1 bg-white border border-[#DCDAD2] rounded-xl px-3.5 py-2 text-xs text-[#2D2D24] placeholder-[#8C8A7C] focus:outline-none focus:border-[#5A5A40]"
                        />
                        <button
                          type="submit"
                          className="p-2 bg-[#5A5A40] text-white hover:bg-[#4A4A34] rounded-xl shrink-0 transition-all cursor-pointer flex items-center justify-center shadow-md shadow-[#5A5A40]/10"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    </div>
                  )}

                  {/* TAB CONTENT: PROFILE & ABOUT SETTINGS */}
                  {activeTab === 'settings' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[#4A4A3A] text-xs" id="sidebar_settings">
                      {/* Avatar Customize form */}
                      <div className="bg-white border border-[#DCDAD2] p-4 rounded-2xl space-y-3 shadow-sm">
                        <h3 className="font-display font-semibold text-[#2D2D24]">Editar Identidade</h3>
                        
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-[#8C8A7C] tracking-wider">Nome</label>
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => {
                              const val = e.target.value.substring(0, 18);
                              setUsername(val);
                              updateProfileInFirestore({ name: val });
                              if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                                socketRef.current.send(
                                  JSON.stringify({
                                    type: 'join',
                                    payload: {
                                      name: val,
                                      color: getProfessionalColor(val),
                                      role: selectedRole,
                                      emoji: '',
                                      photoUrl: photoUrl || '',
                                      x: myPos.x,
                                      y: myPos.y
                                    }
                                  })
                                );
                              }
                            }}
                            className="w-full bg-[#F9F8F6] border border-[#DCDAD2] rounded-lg px-3 py-1.5 text-[#2D2D24] focus:outline-none focus:border-[#5A5A40]"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-[#8C8A7C] tracking-wider">Cargo</label>
                          <select
                            value={selectedRole}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSelectedRole(val);
                              updateProfileInFirestore({ role: val });
                              if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                                socketRef.current.send(
                                  JSON.stringify({
                                    type: 'join',
                                    payload: {
                                      name: username,
                                      color: getProfessionalColor(username),
                                      role: val,
                                      emoji: '',
                                      photoUrl: photoUrl || '',
                                      x: myPos.x,
                                      y: myPos.y
                                    }
                                  })
                                );
                              }
                            }}
                            className="w-full bg-[#F9F8F6] border border-[#DCDAD2] rounded-lg px-3 py-1.5 text-[#2D2D24] focus:outline-none focus:border-[#5A5A40] cursor-pointer"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Foto de Perfil */}
                        <div className="space-y-1.5 pt-2">
                          <label className="text-[10px] uppercase font-bold text-[#8C8A7C] tracking-wider block">Foto de Perfil</label>
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shrink-0 shadow-inner text-xs font-sans font-bold text-white uppercase select-none border border-[#DCDAD2]"
                              style={{ backgroundColor: getProfessionalColor(username) }}
                            >
                              {photoUrl ? (
                                <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                getInitials(username)
                              )}
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="px-3 py-1.5 bg-[#5A5A40] text-white hover:bg-[#4A4A34] font-medium text-[11px] rounded-lg transition-colors cursor-pointer flex items-center gap-1">
                                <Upload className="w-3.5 h-3.5" />
                                Alterar Foto
                                <input type="file" accept="image/*" onChange={onImageSelected} className="hidden" />
                              </label>
                              {photoUrl && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPhotoUrl(null);
                                    updateProfileInFirestore({ photoUrl: '' });
                                    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                                      socketRef.current.send(
                                        JSON.stringify({
                                          type: 'join',
                                          payload: {
                                            name: username,
                                            color: getProfessionalColor(username),
                                            role: selectedRole,
                                            emoji: '',
                                            photoUrl: '',
                                            x: myPos.x,
                                            y: myPos.y
                                          }
                                        })
                                      );
                                    }
                                  }}
                                  className="text-[10px] text-rose-600 hover:underline text-left cursor-pointer font-medium"
                                >
                                  Remover foto
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Financial Saving Info */}
                      <div className="bg-[#96A08A]/15 border border-[#96A08A]/30 p-4 rounded-2xl text-[#4A4A3A]">
                        <h3 className="font-display font-semibold text-[#5A5A40] flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-[#5A5A40]" />
                          Economia Ativa!
                        </h3>
                        <p className="text-[#4A4A3A] mt-1 leading-relaxed">
                          Sua empresa economizou <strong>R$ 6.000 por ano</strong> ao migrar para este escritório virtual interno gratuito.
                        </p>
                      </div>

                      {/* General Tips */}
                      <div className="space-y-2 bg-[#F2F1ED] p-4 border border-[#DCDAD2] rounded-2xl">
                        <span className="font-bold text-[#8C8A7C] uppercase tracking-wider text-[10px] block">Dicas de uso</span>
                        <ul className="list-disc list-inside space-y-1.5 text-[#4A4A3A]">
                          <li>Use fones de ouvido para evitar microfonia.</li>
                          <li>Clique em mesas vagas para sentar e marcar presença.</li>
                          <li>Vá para a <strong>Sala de Reunião</strong> para conversar em grupo facilmente.</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </motion.aside>
              )}
            </AnimatePresence>

            {/* COLLAPSIBLE TOGGLE HANDLE */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="absolute top-4 z-20 p-2 bg-white border border-[#DCDAD2] rounded-full shadow-md text-[#5A5A40] hover:bg-[#F9F8F6] hover:text-[#2D2D24] transition-all cursor-pointer flex items-center justify-center"
              style={{
                left: sidebarCollapsed ? '12px' : '304px',
                transition: 'left 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              id="sidebar_toggle_btn"
              title={sidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-4 h-4 text-[#5A5A40]" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-[#5A5A40]" />
              )}
            </button>

            {/* WORKSPACE & VIRTUAL MAP AREA */}
            <div className="flex-1 flex flex-col p-6 overflow-y-auto items-center justify-start min-w-0 relative" id="map_workspace">
              
              {/* Informative Header card */}
              {showTutorial && (
                <div className="max-w-[880px] w-full bg-white border border-[#DCDAD2] rounded-2xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm relative">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#F9F8F6] border border-[#DCDAD2] text-[#5A5A40] rounded-xl">
                      <Info className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#2D2D24]">Como navegar pelo escritório:</h3>
                      <p className="text-xs text-[#4A4A3A] mt-0.5">
                        Use as teclas <span className="px-1.5 py-0.5 bg-[#F9F8F6] border border-[#DCDAD2] rounded font-mono text-[10px] text-[#5A5A40] font-semibold">W, A, S, D</span> / <span className="px-1.5 py-0.5 bg-[#F9F8F6] border border-[#DCDAD2] rounded font-mono text-[10px] text-[#5A5A40] font-semibold">Setas</span>, ou simplesmente <span className="text-[#5A5A40] font-bold">clique em qualquer local</span> do mapa para caminhar até lá.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-start sm:self-center shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#8C8A7C]">Status do Time:</span>
                      <div className="flex -space-x-2">
                        {players.slice(0, 5).map((p) => (
                          <div
                            key={p.id}
                            className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-sans font-bold text-white uppercase shadow-md overflow-hidden select-none shrink-0"
                            style={{ backgroundColor: getProfessionalColor(p.name) }}
                            title={`${p.name} (${p.role})`}
                          >
                            {p.photoUrl ? (
                              <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              getInitials(p.name)
                            )}
                          </div>
                        ))}
                        {players.length > 5 && (
                          <div className="w-7 h-7 rounded-full border-2 border-white bg-[#C7C4B8] text-white flex items-center justify-center text-[10px] font-bold">
                            +{players.length - 5}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        localStorage.setItem('virtual_office_seen_tutorial', 'true');
                        setShowTutorial(false);
                      }}
                      className="p-1.5 hover:bg-[#F9F8F6] hover:text-rose-600 rounded-lg text-[#8C8A7C] transition-colors cursor-pointer flex items-center justify-center"
                      title="Ocultar instruções para sempre"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* VIRTUAL CANVAS / MAP WRAPPER WITH ZOOM SUPPORT */}
              <div
                className="relative select-none border border-[#DCDAD2] rounded-3xl bg-[#E8E6E1] overflow-hidden shadow-xl shrink-0 cursor-pointer"
                style={{
                  width: `${GRID_COLS * TILE_SIZE * mapZoom}px`,
                  height: `${GRID_ROWS * TILE_SIZE * mapZoom}px`,
                  transition: 'width 0.1s ease-out, height 0.1s ease-out',
                }}
              >
                <div
                  ref={mapContainerRef}
                  className="relative office-grid"
                  style={{
                    width: `${GRID_COLS * TILE_SIZE}px`,
                    height: `${GRID_ROWS * TILE_SIZE}px`,
                    transform: `scale(${mapZoom})`,
                    transformOrigin: 'top left',
                    transition: 'transform 0.1s ease-out',
                  }}
                  id="virtual_office_map"
                >
                {/* 2.1 ROOM DIVISION BANNERS & FLOOR TILES */}
                {OFFICE_ROOMS.map((room) => {
                  const left = room.x * TILE_SIZE;
                  const top = room.y * TILE_SIZE;
                  const width = room.width * TILE_SIZE;
                  const height = room.height * TILE_SIZE;

                  // Define custom floors
                  let floorClass = '';
                  if (room.id === 'meeting_room') floorClass = 'meeting-floor';
                  else if (room.id === 'lounge') floorClass = 'lounge-floor';
                  else if (room.id === 'reception') floorClass = 'reception-floor';
                  else floorClass = 'wood-floor';

                  return (
                    <div
                      key={room.id}
                      className={`absolute border border-slate-800/10 ${floorClass} flex flex-col justify-between p-3 select-none pointer-events-none`}
                      style={{
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: `${height}px`
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <span className="px-2 py-0.5 bg-white/95 backdrop-blur-md rounded-lg text-[10px] font-display font-semibold text-[#4A4A3A] tracking-wider border border-[#DCDAD2] uppercase shadow-sm">
                          {room.name}
                        </span>
                        
                        {/* Custom decorative indicators per room */}
                        {room.id === 'meeting_room' && <Tv className="w-4 h-4 text-[#5A5A40] opacity-50" />}
                        {room.id === 'lounge' && <Coffee className="w-4 h-4 text-[#5A5A40] opacity-50" />}
                        {room.id === 'reception' && <Building className="w-4 h-4 text-[#5A5A40] opacity-50" />}
                      </div>
                    </div>
                  );
                })}

                {/* 2.2 HALLWAY CENTRAL AREA STYLE */}
                {/* Hallway has a neutral slate grid look, we don't have to overlap it */}

                {/* 2.3 SOLID WALL BLOCKS & VISUAL DIVIDERS */}
                {/* Render elegant borders and dark pillars on mapped wall units */}
                {Array.from(BLOCKED_TILES).map((coordStr) => {
                  const [xStr, yStr] = coordStr.split(',');
                  const x = parseInt(xStr);
                  const y = parseInt(yStr);

                  // Distinguish tables from structural pillars or dividers
                  const isTable = (y === 2 || y === 3) && x >= 9 && x <= 12;
                  const isCounter = x === 1 && (y === 11 || y === 12);
                  const isReceptionDesk = y === 10 && (x === 16 || x === 17);

                  let blockContent = null;
                  let blockStyle = 'bg-[#8E8D7E] shadow border border-[#B2B0A4]';

                  if (isTable) {
                    blockStyle = 'bg-[#C7C4B8] border-b-4 border-[#B2B0A4] relative';
                    // Render meeting materials on table cells
                    if (x === 10 && y === 2) {
                      blockContent = <Laptop className="w-4 h-4 text-[#5A5A40]/80 absolute inset-0 m-auto" />;
                    } else if (x === 11 && y === 3) {
                      blockContent = <div className="w-2 h-2 rounded-full bg-red-700/60 absolute inset-0 m-auto" title="Café quentinho" />;
                    }
                  } else if (isCounter) {
                    blockStyle = 'bg-[#C7C4B8] border-[#B2B0A4] relative border-b-2';
                    if (y === 11) {
                      blockContent = <Coffee className="w-4 h-4 text-[#5A5A40]/70 absolute inset-0 m-auto" />;
                    }
                  } else if (isReceptionDesk) {
                    blockStyle = 'bg-[#C7C4B8] border-[#B2B0A4] relative border-b-2';
                    if (x === 16) {
                      blockContent = <span className="text-[10px] absolute inset-0 flex items-center justify-center font-mono opacity-60">📁</span>;
                    }
                  }

                  return (
                    <div
                      key={`wall-${coordStr}`}
                      className={`absolute z-10 flex items-center justify-center text-[#4A4A3A] font-mono text-[9px] ${blockStyle}`}
                      style={{
                        left: `${x * TILE_SIZE}px`,
                        top: `${y * TILE_SIZE}px`,
                        width: `${TILE_SIZE}px`,
                        height: `${TILE_SIZE}px`
                      }}
                      onClick={(e) => {
                        // Prevent clicking on walls from moving players, but let clicking on tables handle seat nearby
                        e.stopPropagation();
                      }}
                    >
                      {blockContent}
                    </div>
                  );
                })}

                {/* 2.4 DETAILED ROOM DECORATIONS */}
                {/* Conference Chairs surrounding the big Table */}
                <span className="absolute text-slate-500/80 text-sm pointer-events-none z-10" style={{ left: '390px', top: '35px' }}>🪑</span>
                <span className="absolute text-slate-500/80 text-sm pointer-events-none z-10" style={{ left: '440px', top: '35px' }}>🪑</span>
                <span className="absolute text-slate-500/80 text-sm pointer-events-none z-10" style={{ left: '480px', top: '35px' }}>🪑</span>
                <span className="absolute text-slate-500/80 text-sm pointer-events-none z-10" style={{ left: '390px', top: '170px' }}>🪑</span>
                <span className="absolute text-slate-500/80 text-sm pointer-events-none z-10" style={{ left: '440px', top: '170px' }}>🪑</span>
                <span className="absolute text-slate-500/80 text-sm pointer-events-none z-10" style={{ left: '480px', top: '170px' }}>🪑</span>

                {/* Plants/Fern Pots around the room boundaries to feel cozy */}
                <span className="absolute text-lg pointer-events-none z-10" style={{ left: '10px', top: '10px' }}>🪴</span>
                <span className="absolute text-lg pointer-events-none z-10" style={{ left: '840px', top: '10px' }}>🪴</span>
                <span className="absolute text-lg pointer-events-none z-10" style={{ left: '270px', top: '400px' }}>🪴</span>
                <span className="absolute text-lg pointer-events-none z-10" style={{ left: '530px', top: '400px' }}>🪴</span>

                {/* Lounge Comfort Sofas */}
                <div className="absolute flex flex-col items-center justify-center pointer-events-none z-10 p-1" style={{ left: '88px', top: '440px', width: '88px', height: '44px' }}>
                  <span className="text-2xl leading-none" title="Sofá Conforto">🛋️</span>
                </div>

                {/* 2.5 CUSTOM WORKING DESKS SYSTEM ("cada um tem seu lugar") */}
                {desks.map((desk) => {
                  const isOccupiedByMe = me && desk.occupiedBy === me.id;
                  const occupant = players.find((p) => p.id === desk.occupiedBy);

                  return (
                    <div
                      key={desk.id}
                      className="absolute group z-10 transition-all duration-200"
                      style={{
                        left: `${desk.x * TILE_SIZE}px`,
                        top: `${desk.y * TILE_SIZE}px`,
                        width: `${TILE_SIZE}px`,
                        height: `${TILE_SIZE}px`
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (desk.occupiedBy) {
                          // Allow renaming if occupied by current user
                          if (isOccupiedByMe) {
                            setRenamingDesk(desk);
                            setNewDeskLabel(desk.name);
                          }
                        } else {
                          // Claim desk
                          claimDesk(desk.id);
                        }
                      }}
                    >
                      {/* Desk Visual Shell */}
                      <div
                        className={`w-full h-full rounded-xl border flex flex-col items-center justify-between p-1.5 transition-all shadow-sm ${
                          occupant
                            ? 'bg-white border-[#5A5A40] shadow-sm'
                            : 'bg-[#F9F8F6]/90 border-[#DCDAD2] hover:border-[#8E8D7E] hover:bg-white'
                        }`}
                      >
                        {/* Small computer display or status */}
                        <div className="w-full flex justify-between items-center px-0.5">
                          <Laptop className={`w-3 h-3 ${occupant ? 'text-[#5A5A40]' : 'text-[#8C8A7C]'}`} />
                          
                          {/* Mini claim option */}
                          {!occupant && (
                            <span className="text-[8px] text-[#8C8A7C] font-bold opacity-0 group-hover:opacity-100 uppercase transition-opacity">
                              SIT
                            </span>
                          )}
                        </div>

                        {/* Desk Label / Initials */}
                        <div className="text-[8px] font-bold text-center truncate max-w-full leading-none text-[#4A4A3A] select-none pb-0.5">
                          {occupant ? occupant.name.split(' ')[0] : 'Vaga'}
                        </div>
                      </div>

                      {/* Floating Tooltip showing custom desk name on hover */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-30 bg-white border border-[#DCDAD2] px-2.5 py-1.5 rounded-xl text-[10px] font-medium text-[#4A4A3A] whitespace-nowrap shadow-lg">
                        <span className="font-semibold text-[#5A5A40]">{desk.name}</span>
                        {occupant && <p className="text-[9px] text-[#8C8A7C]">Ocupado por: {occupant.name}</p>}
                        {isOccupiedByMe && <p className="text-[8px] text-emerald-700 font-bold mt-0.5">Clique para Renomear ✏️</p>}
                        {!occupant && <p className="text-[8px] text-[#8C8A7C] font-medium">Clique para sentar e trabalhar</p>}
                      </div>
                    </div>
                  );
                })}

                {/* 2.6 ACTIVE AVATARS IN REAL TIME */}
                <AnimatePresence>
                  {players.map((p) => {
                    const isMe = p.id === clientId;
                    const left = p.x * TILE_SIZE;
                    const top = p.y * TILE_SIZE;
                    const isMutedPeer = p.muted;
                    const isCameraOnPeer = p.cameraOn;

                    // Fetch active speech bubble
                    const myBubble = speechBubbles.get(p.id);

                    return (
                      <motion.div
                        key={p.id}
                        className="absolute z-20 flex flex-col items-center justify-center transition-all duration-300 pointer-events-none"
                        style={{
                          left: `${left}px`,
                          top: `${top}px`,
                          width: `${TILE_SIZE}px`,
                          height: `${TILE_SIZE}px`
                        }}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                      >
                        {/* Speech Bubble popup inside map */}
                        <AnimatePresence>
                          {myBubble && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.8 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -5, scale: 0.8 }}
                              className="absolute bottom-full mb-3 bg-white border border-[#DCDAD2] px-3 py-1.5 rounded-2xl text-xs text-[#2D2D24] max-w-[150px] break-words text-center shadow-xl z-40 relative flex items-center justify-center font-medium"
                            >
                              {myBubble.text}
                              {/* Small triangle arrow at bottom of speech bubble */}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-0.5 w-2 h-2 bg-white border-r border-b border-[#DCDAD2] rotate-45" />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Player Interactive Token */}
                        <div className="relative flex items-center justify-center w-8 h-8 rounded-full border-2 border-[#2D2D24] shadow-md transition-transform overflow-hidden"
                          style={{
                            backgroundColor: getProfessionalColor(p.name),
                            // If sitting at desk, maybe shrink slightly or rotate to sit nicely
                            transform: p.deskId ? 'scale(0.95)' : 'scale(1)'
                          }}
                        >
                          {p.photoUrl ? (
                            <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-[10px] font-sans font-bold text-white uppercase select-none">{getInitials(p.name)}</span>
                          )}
                          
                          {/* Inner video-on glow ring */}
                          {isCameraOnPeer && (
                            <div className="absolute -inset-1 rounded-full border border-emerald-500 voice-active -z-10" />
                          )}

                          {/* Indicators overlays on avatar */}
                          {isMutedPeer && (
                            <div className="absolute -bottom-1 -right-1 bg-rose-600 rounded-full p-0.5 border border-white" title="Mutado">
                              <MicOff className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                        </div>

                        {/* Character Floating Name Tag */}
                        <div className="absolute top-full mt-1 px-1.5 py-0.5 bg-white/95 backdrop-blur-md rounded-md border border-[#DCDAD2] shadow-sm flex items-center gap-1">
                          <span className="text-[9px] font-bold text-[#2D2D24] tracking-wide truncate max-w-[70px]">
                            {isMe ? 'Você' : p.name.split(' ')[0]}
                          </span>
                          
                          {/* Indicate desk connection or room connection */}
                          {p.deskId && (
                            <span className="text-[7px] bg-[#5A5A40]/10 text-[#5A5A40] font-extrabold px-1 rounded leading-none uppercase">
                              MESA
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* 2.7 MAP CLICK GRIDS (INVISIBLE LAYER FOR BETTER UX) */}
                <div
                  className="absolute inset-0 grid z-0"
                  style={{
                    gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                    gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`
                  }}
                >
                  {Array.from({ length: GRID_ROWS }).map((_, r) =>
                    Array.from({ length: GRID_COLS }).map((_, c) => {
                      const walkable = isWalkable(c, r);
                      return (
                        <div
                          key={`tile-click-${c}-${r}`}
                          onClick={() => handleMapClick(c, r)}
                          className={`w-full h-full transition-colors ${
                            walkable ? 'hover:bg-blue-500/5' : 'cursor-not-allowed bg-transparent'
                          }`}
                        />
                      );
                    })
                  )}
                </div>

              </div>
            </div>

            {/* FLOATING ZOOM CONTROLS */}
            <div className="absolute bottom-6 right-6 bg-white/90 backdrop-blur-md border border-[#DCDAD2] rounded-2xl p-2.5 flex items-center gap-2 shadow-lg z-10" id="zoom_controls">
              <button
                onClick={() => setMapZoom((prev) => Math.max(0.5, prev - 0.1))}
                className="p-1.5 hover:bg-[#F9F8F6] rounded-xl text-[#5A5A40] transition-colors cursor-pointer flex items-center justify-center"
                title="Diminuir Zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono font-bold text-[#4A4A3A] min-w-[48px] text-center select-none">
                {Math.round(mapZoom * 100)}%
              </span>
              <button
                onClick={() => setMapZoom((prev) => Math.min(3.0, prev + 0.1))}
                className="p-1.5 hover:bg-[#F9F8F6] rounded-xl text-[#5A5A40] transition-colors cursor-pointer flex items-center justify-center"
                title="Aumentar Zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="w-[1px] h-4 bg-[#DCDAD2]" />
              <button
                onClick={() => setMapZoom(1)}
                className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#5A5A40] hover:bg-[#F9F8F6] rounded-lg transition-colors cursor-pointer"
              >
                Reset
              </button>
              <span className="text-[9px] text-[#8C8A7C] font-semibold hidden md:inline-block ml-1">
                (Ctrl + Scroll)
              </span>
            </div>

              {/* Sit / Stand action card */}
              {me && (
                <div className="max-w-[880px] w-full mt-4 flex justify-between items-center bg-white border border-[#DCDAD2] rounded-2xl p-4 gap-3 shadow-sm">
                  <div>
                    <span className="text-xs text-[#8C8A7C] uppercase font-mono tracking-wider">Membro Ocupando</span>
                    <h4 className="text-sm font-semibold text-[#2D2D24] mt-0.5">
                      {me.deskId ? (
                        <>
                          Sentado na <span className="text-[#5A5A40] font-bold">"{desks.find((d) => d.id === me.deskId)?.name}"</span>
                        </>
                      ) : (
                        'Andando pelo Corredor do Escritório'
                      )}
                    </h4>
                  </div>

                  <div className="flex gap-2">
                    {me.deskId ? (
                      <>
                        <button
                          onClick={() => {
                            const myDesk = desks.find((d) => d.id === me.deskId);
                            if (myDesk) {
                              setRenamingDesk(myDesk);
                              setNewDeskLabel(myDesk.name);
                            }
                          }}
                          className="px-3.5 py-2 bg-[#F9F8F6] border border-[#DCDAD2] text-[#4A4A3A] hover:bg-[#E5E2D9] font-display font-medium text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Renomear Mesa
                        </button>
                        <button
                          onClick={() => claimDesk(null)}
                          className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-display font-medium text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Levantar-se
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-[#8C8A7C] italic flex items-center font-medium">
                        Caminhe até uma mesa e clique nela para ocupar!
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>


          </div>

          {/* 3. FLOATING PROXIMITY VIDEO MEETING WINDOW (IFRAME WITH JITSI OVERLAY) */}
          <AnimatePresence>
            {callSession && (
              <motion.div
                initial={{ opacity: 0, y: 150 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 150 }}
                className="fixed bottom-6 left-6 right-86 bg-white border-2 border-[#5A5A40] rounded-3xl overflow-hidden shadow-2xl z-40 max-w-4xl"
                id="proximity_meet_panel"
              >
                {/* Panel Header */}
                <div className="bg-[#F9F8F6] px-6 py-3 border-b border-[#DCDAD2] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 voice-active absolute -top-0.5 -right-0.5" />
                      <div className="p-1.5 bg-[#5A5A40] text-white rounded-lg">
                        <Volume2 className="w-4 h-4" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-[#2D2D24] leading-tight">
                        {callSession.title}
                      </h3>
                      <p className="text-[10px] text-[#8C8A7C] leading-none mt-0.5">
                        Jitsi Meet Canal de Áudio & Vídeo Integrado
                      </p>
                    </div>
                  </div>

                  {/* Active participants roster in call */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 bg-white border border-[#DCDAD2] px-3 py-1 rounded-xl">
                      <Users className="w-3.5 h-3.5 text-[#5A5A40]" />
                      <span className="text-[10px] text-[#4A4A3A] font-bold">
                        {callSession.participants.length} na call
                      </span>
                    </div>

                    <button
                      onClick={() => setShowMeetHelp(!showMeetHelp)}
                      className="p-1.5 text-[#8C8A7C] hover:text-[#2D2D24] hover:bg-[#F9F8F6] rounded-lg cursor-pointer transition-colors"
                      title="Ajuda sobre a chamada"
                    >
                      <Info className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>

                {/* Meet Help Block */}
                {showMeetHelp && (
                  <div className="bg-[#96A08A]/10 border-b border-[#96A08A]/20 p-4 text-xs text-[#4A4A3A] flex gap-3 leading-relaxed">
                    <Sparkles className="w-5 h-5 shrink-0 text-[#5A5A40]" />
                    <div>
                      <span className="font-semibold text-[#2D2D24]">Sobre as Chamadas de Vídeo Integradas:</span>
                      <p className="mt-0.5 text-[#4A4A3A]">
                        O Jitsi Meet é um sistema seguro e leve que roda direto no navegador. Quando você e um colega se aproximam ou entram na Sala de Reunião, o painel abre e vocês entram na mesma sala automaticamente. Para o Jitsi funcionar perfeitamente, certifique-se de <strong>permitir o acesso à câmera e microfone</strong> se o seu navegador solicitar.
                      </p>
                    </div>
                  </div>
                )}

                {/* Call Main Stage: Integrated Jitsi Iframe */}
                <div className="relative bg-[#F9F8F6] flex" style={{ height: '350px' }} id="iframe_container">
                  <iframe
                    src={jitsiUrl}
                    allow="camera; microphone; display-capture; autoplay; clipboard-write; websocket"
                    className="w-full h-full border-0"
                    referrerPolicy="no-referrer"
                    title="Jitsi Video Conference"
                  />
                  
                  {/* Fallback details pane in case camera needs confirmation */}
                  <div className="absolute right-4 bottom-4 pointer-events-none flex flex-col gap-1.5 items-end max-w-xs bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-[#DCDAD2] shadow">
                    <span className="text-[10px] font-bold text-[#2D2D24] leading-none">Participantes Conectados:</span>
                    <div className="flex flex-wrap gap-1 mt-1 justify-end">
                      {callSession.participants.map((p) => (
                        <span
                          key={p.id}
                          className="px-2 py-0.5 bg-[#F9F8F6] border border-[#DCDAD2] rounded-md text-[9px] font-semibold text-[#4A4A3A] flex items-center gap-1"
                        >
                          <span style={{ color: p.color }}>●</span> {p.name.split(' ')[0]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Floating Call Bar Quick Link to open in native tab as well */}
                <div className="bg-[#F9F8F6] px-6 py-3 border-t border-[#DCDAD2] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                  <span className="text-[10px] text-[#8C8A7C] font-medium">
                    Afastem seus bonecos na tela para sair da chamada automaticamente.
                  </span>
                  
                  <div className="flex gap-2">
                    <a
                      href={`https://meet.jit.si/${callSession.roomName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-white border border-[#DCDAD2] hover:border-[#8E8D7E] text-[#4A4A3A] hover:bg-[#F9F8F6] font-display font-medium text-[10px] rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Abrir em nova aba
                    </a>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 4. MODALS AND DIALOGS */}
          {/* Desk Rename Modal */}
          <AnimatePresence>
            {renamingDesk && (
              <div className="fixed inset-0 bg-[#4A4A3A]/40 backdrop-blur-md flex items-center justify-center p-4 z-50" id="desk_rename_overlay">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white border border-[#DCDAD2] rounded-3xl p-6 max-w-sm w-full shadow-2xl"
                  id="desk_rename_card"
                >
                  <h3 className="text-base font-display font-bold text-[#2D2D24] mb-2 flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-[#5A5A40]" />
                    Renomear Mesa Virtual
                  </h3>
                  <p className="text-xs text-[#4A4A3A] mb-4 leading-normal">
                    Dê um nome personalizado para o seu lugar no escritório para que todos saibam qual é o seu canto!
                  </p>

                  <form onSubmit={executeDeskRename} className="space-y-4">
                    <input
                      type="text"
                      required
                      value={newDeskLabel}
                      onChange={(e) => setNewDeskLabel(e.target.value)}
                      placeholder="Ex: Carlos PM, Tech Lab, QG de QA"
                      maxLength={20}
                      className="w-full bg-[#F9F8F6] border border-[#DCDAD2] rounded-xl px-3.5 py-2 text-[#2D2D24] placeholder-[#8C8A7C] focus:outline-none focus:border-[#5A5A40] transition-colors"
                      id="desk_name_input"
                    />

                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setRenamingDesk(null)}
                        className="px-4 py-2 bg-white border border-[#DCDAD2] text-[#8C8A7C] hover:text-[#4A4A3A] hover:bg-[#F9F8F6] rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#5A5A40] hover:bg-[#4A4A34] text-white rounded-xl text-xs font-semibold cursor-pointer transition-all"
                      >
                        Salvar Nome
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* GLOBAL PHOTO CROPPING MODAL */}
      <AnimatePresence>
        {cropping && tempImageSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
            id="cropping_modal"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white border border-[#DCDAD2] rounded-3xl p-6 max-w-md w-full shadow-2xl relative text-[#4A4A3A]"
              id="cropping_card"
            >
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#8C8A7C] mb-4 text-center">
                Ajustar e Recortar Foto
              </h3>

              <div className="bg-white border border-[#DCDAD2] rounded-xl p-3 space-y-4 shadow-inner">
                <span className="text-[10px] font-bold text-[#5A5A40] block text-center uppercase tracking-wide">
                  Arraste a Foto & Use o Controle Abaixo
                </span>
                
                <div
                  className="relative w-48 h-48 mx-auto bg-black rounded-full overflow-hidden cursor-move border border-[#DCDAD2] flex items-center justify-center select-none"
                  onMouseDown={(e) => {
                    const startX = e.clientX - offset.x;
                    const startY = e.clientY - offset.y;
                    const handleMouseMove = (moveEvent: MouseEvent) => {
                      setOffset({
                        x: moveEvent.clientX - startX,
                        y: moveEvent.clientY - startY
                      });
                    };
                    const handleMouseUp = () => {
                      document.removeEventListener('mousemove', handleMouseMove);
                      document.removeEventListener('mouseup', handleMouseUp);
                    };
                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                  }}
                >
                  <img
                    ref={imgRef}
                    src={tempImageSrc}
                    alt="Crop preview"
                    className="max-w-none pointer-events-none select-none"
                    style={{
                      width: '192px',
                      height: 'auto',
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                      transition: 'none'
                    }}
                  />
                  {/* Visual Crop Guideline Ring */}
                  <div className="absolute inset-0 border-[40px] border-black/50 pointer-events-none flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full border border-dashed border-white" />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-[#8C8A7C]">
                    <span>Zoom: {zoom.toFixed(1)}x</span>
                    <button
                      type="button"
                      onClick={() => {
                        setZoom(1);
                        setOffset({ x: 0, y: 0 });
                      }}
                      className="text-[#5A5A40] hover:underline"
                    >
                      Resetar
                    </button>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-full h-1 bg-[#E5E2D9] rounded-lg appearance-none cursor-pointer accent-[#5A5A40]"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCropping(false);
                      setTempImageSrc(null);
                    }}
                    className="flex-1 py-2 border border-[#DCDAD2] hover:bg-[#FEF2F2] hover:text-rose-600 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCrop}
                    className="flex-1 py-2 bg-[#5A5A40] hover:bg-[#4A4A34] text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    Aplicar Recorte
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
