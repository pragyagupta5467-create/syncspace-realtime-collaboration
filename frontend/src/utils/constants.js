export const APP_NAME = "SyncSpace";
export const APP_TAGLINE = "Real-Time Multiplayer Collaboration";
export const APP_DESCRIPTION = "Empower your engineering team to collaborate seamlessly with real-time cursor tracking, live shared state synchronization, conflict resolution, and visual session replay.";

export const FEATURES = [
  {
    id: 'cursors',
    title: 'Live Multiplayer Cursors',
    description: 'Ultra-low latency cursor broadcasting with smooth interpolation, custom user badges, and cursor spotlight mode.',
    icon: 'MousePointer',
    tag: 'Real-Time'
  },
  {
    id: 'state-sync',
    title: 'Server-Authoritative Sync',
    description: 'Shared task cards and workspace state managed with strict server authority to guarantee consistency across all clients.',
    icon: 'Layers',
    tag: 'Reliability'
  },
  {
    id: 'conflict',
    title: 'Intelligent Conflict Detection',
    description: 'Detect concurrent modifications gracefully with conflict indicators and automatic state reconciliation.',
    icon: 'ShieldAlert',
    tag: 'Consensus'
  },
  {
    id: 'follow-mode',
    title: 'Follow User Viewport',
    description: 'Lock onto any collaborator to watch their moves and inspect tasks in real-time pairing sessions.',
    icon: 'UserCheck',
    tag: 'Collaboration'
  },
  {
    id: 'activity-feed',
    title: 'Real-Time Activity Feed',
    description: 'Instant event streams for joins, leaves, card movements, edits, and conflict alerts.',
    icon: 'Activity',
    tag: 'Live Stream'
  },
  {
    id: 'session-replay',
    title: 'Visual Session Replay',
    description: 'Step back through state mutation history to understand who changed what, when, and how.',
    icon: 'History',
    tag: 'Audit Trail'
  }
];
