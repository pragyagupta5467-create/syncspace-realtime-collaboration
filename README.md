# SyncSpace

A real-time multiplayer collaborative workspace engine featuring synchronized Kanban task boards, live multiplayer cursors, peer-to-peer WebRTC video calling, deterministic session replay, in-app notifications, and an AI workspace assistant.

---

## Overview

SyncSpace solves state collisions, communication silos, and disconnected workflows in distributed team collaboration by integrating live task management, presence awareness, WebRTC video calls, and context-aware AI into a single synchronized workspace.

- Purpose: Prevent multi-user editing race conditions with Optimistic Concurrency Control (OCC) while providing fluid multiplayer presence.
- How It Works: React frontend communicates via REST APIs for auth and health checks, and Socket.IO for low-latency state synchronization, ephemeral cursors, and WebRTC mesh signaling with MongoDB persistence.
- Target Users: Software teams, sprint coordinators, study groups, and remote collaborators.

---

## Features

- JWT Authentication: Secure user registration and login with bcrypt password hashing and token-based route protection.
- SaaS Dashboard: Overview of created workspaces, visited room history stored locally, and live backend connection metrics.
- Collaborative Kanban Board: 3-column workflow (TODO, IN_PROGRESS, DONE) with drag-and-drop ordering and granular single-task mutations.
- OCC Conflict Resolution: Document versioning (v1 -> v2) with automatic clash detection and side-by-side diff resolution modals.
- Multiplayer Cursors & Presence: Normalized mouse tracking (~30 FPS), spotlight radar rings, and follow-mode viewport tracking.
- WebRTC Mesh Video & Screen Share: Multi-peer audio/video calling, in-call mute/camera controls, and dynamic screen share streaming.
- Activity Feed & Session Replay: Immutable audit log with filter pills and step-by-step timeline replay with variable playback speeds.
- Real-Time Notification Center: In-app alerts for task assignments, status updates, completions, room joins, and edit conflicts.
- SyncSpace AI Assistant: Natural language workspace Q&A and session summaries grounded in real tasks, with an internal zero-crash fallback engine.
- Theme Engine: Persistent Light, Dark, and System preference switcher.

---

## Tech Stack

- Frontend: React 19, Vite 8, Tailwind CSS 4, React Router 7, Socket.IO Client 4.8, Lucide React
- Backend: Node.js (ESM), Express 4.21, Socket.IO 4.8, Mongoose 9.10, jsonwebtoken, bcryptjs
- Database: MongoDB (Users, Rooms, Tasks, Activities, Notifications)
- Real-Time & Networking: WebSockets (Socket.IO), WebRTC (STUN server mesh)
- AI Integration: OpenAI API (gpt-4o-mini) and SyncSpace Contextual Synthesizer engine
- Testing: 15 automated Node ESM test suites

---

## Project Architecture & Flow

```
Frontend (React + Vite)
  │── HTTP REST API ──> Express Backend (Auth, Health, AI) ──> MongoDB / OpenAI
  └── WebSocket (Socket.IO) ──> Room Presence / OCC Task Engine / WebRTC Relays
```

1. User Action: Client initiates task mutation or WebRTC call join.
2. Server Validation: Backend checks token, room membership, and sliding-window rate limits.
3. State & Persistence: Task version is checked against MongoDB. On match, version increments and updates database; on mismatch, conflict payload is returned.
4. Real-Time Broadcast: Authoritative state, audit activity, and targeted notifications are pushed to room sockets.

---

## Project Structure

```
SyncSpace/
├── backend/
│   ├── src/
│   │   ├── config/          # db.js (MongoDB connection), index.js (env setup)
│   │   ├── middleware/      # authMiddleware.js (JWT), errorHandler.js
│   │   ├── models/          # User.js, Room.js, Task.js, Activity.js, Notification.js
│   │   ├── routes/          # authRoutes.js, apiRoutes.js, notificationRoutes.js, aiRoutes.js
│   │   ├── services/        # dbService.js (OCC CRUD), roomManager.js, callManager.js, aiService.js
│   │   ├── sockets/         # socketHandler.js (Task sync, cursors, WebRTC signaling)
│   │   ├── utils/           # validation.js, rateLimiter.js
│   │   └── server.js        # Express and Socket.IO server entry
│   ├── .env.example
│   └── test_*.mjs           # 15 automated test scripts
├── frontend/
│   ├── src/
│   │   ├── components/      # TaskBoard, VideoCall, AIAssistant, Replay, Notifications, Cursors, UI
│   │   ├── context/         # AuthContext.jsx, ThemeContext.jsx
│   │   ├── hooks/           # useSocket, useRoom, useCollaborativeBoard, useWebRTC, useSessionReplay
│   │   ├── pages/           # Landing.jsx, Login.jsx, SignUp.jsx, Dashboard.jsx, Workspace.jsx
│   │   ├── services/        # api.js (REST client), socket.js (Socket.IO singleton)
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## Installation and Setup

### Prerequisites
Node.js (>=18), npm (>=9), and a running MongoDB instance.

### 1. Clone and Configure Backend
```bash
git clone https://github.com/your-username/SyncSpace.git
cd SyncSpace/backend
cp .env.example .env
npm install
npm run dev
```

### 2. Configure and Start Frontend
```bash
# In a new terminal
cd SyncSpace/frontend
npm install
npm run dev
```

Open `http://localhost:5173` to access the application.

---

## Environment Variables

Configure `backend/.env`:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| PORT | No | 5000 | Backend server port |
| CLIENT_URL | No | http://localhost:5173 | Allowed CORS origin |
| NODE_ENV | No | development | Runtime environment |
| MONGODB_URI | Yes | mongodb://localhost:27017/syncspace | MongoDB connection URI |
| JWT_SECRET | Yes | - | Secret key for signing JWTs |
| OPENAI_API_KEY | No | - | OpenAI API key (optional; fallback engine used if omitted) |
| OPENAI_MODEL | No | gpt-4o-mini | OpenAI model name |

---

## API & Socket.IO Summary

### REST Endpoints
- POST /api/auth/register - Register account { name, email, password }
- POST /api/auth/login - Login { email, password }
- GET /api/auth/me - Authenticated profile (Bearer Token)
- GET /health - Server and database connection status
- POST /api/rooms - Create room { roomId, user }
- GET /api/rooms/:roomId/tasks - Fetch persisted room tasks
- GET /api/rooms/:roomId/activities - Fetch audit logs (?limit=50)
- GET /api/rooms/:roomId/replay - Fetch chronological events for replay
- GET /api/notifications - Fetch user notifications and unread count
- PATCH /api/notifications/:id/read - Mark notification read
- PATCH /api/notifications/read-all - Mark all read
- POST /api/ai/workspace - Ask AI context question { roomId, question }
- POST /api/ai/summary - Generate workspace summary { roomId }

### Socket.IO Events
- Rooms & Presence: join-room, leave-room, room-joined, room-users, user-joined, user-left
- Kanban & OCC: task-create, task-update, task-move, task-delete, task-conflict
- Multiplayer Cursors: cursor-move (throttled ~30 FPS), cursor-leave, cursor-spotlight
- WebRTC Mesh: call-join, call-signal (Offer/Answer/ICE relay), call-state-update, call-leave
- Notifications: subscribe-notifications, notification-created

---

## Database Schemas

- User: name, email (unique), passwordHash (bcrypt), userColor
- Room: roomId (unique), name, createdBy
- Task: taskId, roomId, title, description, status (TODO/IN_PROGRESS/DONE), priority, version, position, createdBy, updatedBy, assignedTo
- Activity: activityId, roomId, userId, userName, type, taskId, taskTitle, metadata, timestamp
- Notification: notificationId, recipientId, actorId, actorName, roomId, type, message, isRead, createdAt

---

## Challenges and Solutions

1. OCC State Synchronization: Used integer version tracking to detect simultaneous edits, reject stale writes, and return visual diffs to clients.
2. WebRTC Mesh Signaling: Built in-memory CallManager with dynamic video track replacement for reliable multi-user audio, video, and screen sharing.
3. Cursor Performance: Applied ~30 FPS client-side throttling and normalized percentage coordinates with volatile broadcasting to prevent database load.
4. AI Hallucination Guard: Structured real MongoDB tasks and activities into a grounding system prompt, backed by a deterministic fallback synthesizer.

---

## Verification & Testing

Run the 15 automated test suites from the backend directory:
```bash
cd backend
node test_auth_system.mjs
node test_socket_rooms.mjs
node test_task_sync.mjs
node test_conflict_detection.mjs
node test_activity_feed.mjs
node test_session_replay.mjs
node test_notifications.mjs
node test_ai_assistant.mjs
node test_video_call.mjs
node test_production_security.mjs
```

---

## Future Improvements

- Canvas and whiteboard tab for visual wireframing
- Google and GitHub OAuth 2.0 integration
- Cloud file and image attachments for tasks
- Workspace data export and import (JSON/CSV)
- Selective Forwarding Unit (SFU) architecture for larger video calls

---

## Running the Project (Quick Commands)

```bash
# Terminal 1: Backend
cd backend && npm install && npm run dev

# Terminal 2: Frontend
cd frontend && npm install && npm run dev
```

App: `http://localhost:5173` | Health: `http://localhost:5000/health`

---

## License

ISC License
