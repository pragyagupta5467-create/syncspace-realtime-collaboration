import { config } from '../config/index.js';
import { getRoomTasks, getRoomActivities } from './dbService.js';
import { roomManager } from './roomManager.js';

/**
 * Build clean, sanitized, and structured context from REAL MongoDB data
 */
export async function buildWorkspaceContext(roomId, requestingUser) {
  const cleanRoomId = roomId?.trim()?.toUpperCase();
  if (!cleanRoomId) throw new Error('Valid Room ID is required');

  const [tasks, activities] = await Promise.all([
    getRoomTasks(cleanRoomId),
    getRoomActivities(cleanRoomId, 50),
  ]);

  const activeUsers = roomManager.getRoomUsers(cleanRoomId) || [];

  const todoTasks = tasks.filter((t) => t.status === 'TODO');
  const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS');
  const doneTasks = tasks.filter((t) => t.status === 'DONE');
  const highPriorityTasks = tasks.filter((t) => t.priority === 'HIGH' && t.status !== 'DONE');

  const conflicts = activities.filter((a) => a.type === 'TASK_CONFLICT');

  // Format tasks summary
  const formattedTasks = tasks.map((t) => ({
    id: t.id || t.taskId,
    title: t.title,
    description: t.description || 'No description provided',
    status: t.status,
    priority: t.priority,
    assignedTo: t.assignedTo ? t.assignedTo.displayName || t.assignedTo.userId : 'Unassigned',
    createdBy: t.createdBy?.displayName || 'Unknown',
    version: t.version || 1,
    updatedAt: t.updatedAt,
  }));

  // Format recent activities
  const formattedActivities = activities.slice(0, 30).map((a) => ({
    type: a.type,
    user: a.userName || 'Collaborator',
    taskTitle: a.taskTitle || 'N/A',
    timestamp: a.createdAt,
    details: a.metadata ? JSON.stringify(a.metadata) : '',
  }));

  return {
    roomId: cleanRoomId,
    requestingUser: {
      name: requestingUser?.displayName || requestingUser?.name || 'Workspace Member',
      id: requestingUser?.userId || requestingUser?.id || 'unknown',
    },
    activeCollaborators: activeUsers.map((u) => u.displayName || u.name),
    stats: {
      totalTasks: tasks.length,
      todoCount: todoTasks.length,
      inProgressCount: inProgressTasks.length,
      doneCount: doneTasks.length,
      highPriorityPendingCount: highPriorityTasks.length,
      conflictCount: conflicts.length,
      recentActivitiesCount: activities.length,
    },
    tasks: formattedTasks,
    recentActivities: formattedActivities,
    conflicts: conflicts.map((c) => ({
      taskTitle: c.taskTitle,
      user: c.userName,
      timestamp: c.createdAt,
      metadata: c.metadata,
    })),
  };
}

const SYSTEM_INSTRUCTION = `You are SyncSpace AI, the intelligent real-time collaborative workspace assistant for SyncSpace.
Your role is to help users understand their collaborative workspace, prioritize tasks, track team progress, analyze activities, and resolve blockers.

STRICT CONTEXT RULES:
1. Answer ONLY using the supplied workspace context.
2. NEVER invent tasks, users, metrics, timestamps, or activity events that do not exist in the context.
3. If information is unavailable or the room has no tasks/activities, clearly state that it is unavailable or empty.
4. When suggesting what to work on next:
   - Prioritize HIGH priority tasks that are in TODO or IN_PROGRESS.
   - Factor in task assignment (if assigned to the requesting user or unassigned).
   - Give clear reasoning based on status, priority, and recent updates.
5. NEVER expose passwords, JWT tokens, API keys, or internal security hashes.
6. Present your answers with clean Markdown formatting (headings, bullet points, bold key terms).
7. Keep responses concise, well-structured, and directly useful.`;

/**
 * Contextual Deterministic Synthesizer (Zero-Crash Fallback Engine)
 * Used when OPENAI_API_KEY is not configured or OpenAI service is unreachable.
 * Synthesizes accurate responses directly from real database metrics.
 */
function synthesizeContextualResponse(context, question, isSummary = false) {
  const { stats, tasks, recentActivities, conflicts, requestingUser, activeCollaborators } = context;
  const q = (question || '').toLowerCase().trim();

  if (isSummary || q.includes('summar') || q.includes('overview') || q.includes('status')) {
    if (stats.totalTasks === 0 && stats.recentActivitiesCount === 0) {
      return `### Workspace Summary: Room ${context.roomId}\n\n**No activity or tasks available to summarize.** This workspace is currently empty.`;
    }

    let summaryText = `### Workspace Summary: Room ${context.roomId}\n\n`;
    summaryText += `**Current Overview:**\n`;
    summaryText += `- **Total Tasks:** ${stats.totalTasks} (${stats.todoCount} To-Do, ${stats.inProgressCount} In Progress, ${stats.doneCount} Done)\n`;
    summaryText += `- **Active Collaborators Online:** ${activeCollaborators.length > 0 ? activeCollaborators.join(', ') : 'None currently active'}\n`;
    summaryText += `- **Recent Recorded Activities:** ${stats.recentActivitiesCount} events\n\n`;

    if (stats.highPriorityPendingCount > 0) {
      const highTasks = tasks.filter((t) => t.priority === 'HIGH' && t.status !== 'DONE');
      summaryText += `**High Priority Incomplete Tasks:**\n`;
      highTasks.forEach((t) => {
        summaryText += `- **${t.title}** (${t.status}) — Assigned to: ${t.assignedTo}\n`;
      });
      summaryText += `\n`;
    }

    if (recentActivities.length > 0) {
      summaryText += `**Recent Collaboration Activity:**\n`;
      recentActivities.slice(0, 5).forEach((a) => {
        summaryText += `- **${a.user}**: ${a.type.toLowerCase().replace(/_/g, ' ')} on "${a.taskTitle}"\n`;
      });
      summaryText += `\n`;
    }

    if (conflicts.length > 0) {
      summaryText += `**Important Events:**\n`;
      summaryText += `- Detected ${conflicts.length} OCC edit/move conflict(s) that were isolated and resolved.\n`;
    }

    return summaryText;
  }

  if (q.includes('next') || q.includes('work on') || q.includes('recommend') || q.includes('priority')) {
    const pendingTasks = tasks.filter((t) => t.status !== 'DONE');
    if (pendingTasks.length === 0) {
      return `### Next Work Recommendations\n\nAll tasks in this workspace are currently **completed** (${stats.doneCount}/${stats.totalTasks} DONE). Great job! You can create new tasks to continue.`;
    }

    // Sort by priority (HIGH -> MEDIUM -> LOW), then status (IN_PROGRESS first)
    const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    pendingTasks.sort((a, b) => {
      const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
      if (pDiff !== 0) return pDiff;
      if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
      if (b.status === 'IN_PROGRESS' && a.status !== 'IN_PROGRESS') return 1;
      return 0;
    });

    const topTask = pendingTasks[0];
    let response = `### Recommended Next Tasks for ${requestingUser.name}\n\n`;
    response += `Based on priority and current status, you should focus on:\n\n`;
    response += `1. **${topTask.title}**\n`;
    response += `   - **Priority:** \`${topTask.priority}\` | **Status:** \`${topTask.status}\`\n`;
    response += `   - **Assignee:** ${topTask.assignedTo}\n`;
    if (topTask.description && topTask.description !== 'No description provided') {
      response += `   - **Details:** ${topTask.description}\n`;
    }
    response += `\n`;

    if (pendingTasks.length > 1) {
      response += `**Other Pending Items:**\n`;
      pendingTasks.slice(1, 4).forEach((t, idx) => {
        response += `${idx + 2}. **${t.title}** (\`${t.priority}\` — ${t.status}) — Assigned: ${t.assignedTo}\n`;
      });
    }

    return response;
  }

  if (q.includes('pending') || q.includes('incomplete') || q.includes('todo') || q.includes('in progress')) {
    const pending = tasks.filter((t) => t.status !== 'DONE');
    if (pending.length === 0) {
      return `### Pending Tasks\n\nThere are **no pending tasks** in this workspace. All ${stats.totalTasks} task(s) are completed!`;
    }

    let response = `### Pending Workspace Tasks (${pending.length})\n\n`;
    pending.forEach((t) => {
      response += `- **${t.title}** (\`${t.priority}\` | \`${t.status}\`) — Assigned to: **${t.assignedTo}**\n`;
    });
    return response;
  }

  if (q.includes('conflict') || q.includes('clash') || q.includes('error')) {
    if (conflicts.length === 0) {
      return `### Conflict Report\n\nNo version conflicts have been recorded in this workspace. All real-time updates have been applied cleanly.`;
    }
    let response = `### Conflict History (${conflicts.length})\n\n`;
    conflicts.forEach((c) => {
      response += `- **${c.taskTitle}**: Edit conflict encountered by **${c.user}** at ${new Date(c.timestamp).toLocaleTimeString()}.\n`;
    });
    return response;
  }

  if (q.includes('who') || q.includes('team') || q.includes('collaborator') || q.includes('member')) {
    let response = `### Workspace Collaborators & Assignments\n\n`;
    response += `**Currently Connected Online:** ${activeCollaborators.length > 0 ? activeCollaborators.join(', ') : 'None'}\n\n`;
    response += `**Task Assignments:**\n`;
    const assignments = {};
    tasks.forEach((t) => {
      const assignee = t.assignedTo || 'Unassigned';
      if (!assignments[assignee]) assignments[assignee] = [];
      assignments[assignee].push(`${t.title} (${t.status})`);
    });

    for (const [member, taskList] of Object.entries(assignments)) {
      response += `- **${member}** (${taskList.length} task${taskList.length > 1 ? 's' : ''}):\n`;
      taskList.forEach((t) => {
        response += `  • ${t}\n`;
      });
    }
    return response;
  }

  // General fallback query response
  let generalResponse = `### Workspace Intelligence Report\n\n`;
  generalResponse += `**Room ${context.roomId} Current State:**\n`;
  generalResponse += `- **Tasks:** ${stats.totalTasks} total (${stats.todoCount} To-Do, ${stats.inProgressCount} In Progress, ${stats.doneCount} Done)\n`;
  generalResponse += `- **Pending High Priority:** ${stats.highPriorityPendingCount}\n`;
  generalResponse += `- **Online Collaborators:** ${activeCollaborators.length > 0 ? activeCollaborators.join(', ') : 'None'}\n\n`;

  if (tasks.length > 0) {
    generalResponse += `**Key Incomplete Tasks:**\n`;
    tasks.filter((t) => t.status !== 'DONE').slice(0, 3).forEach((t) => {
      generalResponse += `- **${t.title}** (\`${t.priority}\` — ${t.status}) assigned to ${t.assignedTo}\n`;
    });
  } else {
    generalResponse += `No tasks exist yet in this workspace. Create tasks to begin collaboration.\n`;
  }

  return generalResponse;
}

/**
 * Ask SyncSpace AI a contextual question about the workspace
 */
export async function askWorkspaceAI(roomId, question, requestingUser) {
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('Please provide a question for SyncSpace AI');
  }

  const cleanQuestion = question.trim().slice(0, 500);
  const context = await buildWorkspaceContext(roomId, requestingUser);

  // If OpenAI API key is configured, call OpenAI Chat Completions API
  if (config.openaiApiKey && config.openaiApiKey.trim().length > 0 && !config.openaiApiKey.includes('your_openai_api_key')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const promptPayload = {
        model: config.openaiModel || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          {
            role: 'user',
            content: `WORKSPACE CONTEXT:\n${JSON.stringify(context, null, 2)}\n\nUSER QUESTION from ${requestingUser?.name || 'Workspace Member'}:\n"${cleanQuestion}"`,
          },
        ],
        temperature: 0.2,
        max_tokens: 800,
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openaiApiKey.trim()}`,
        },
        body: JSON.stringify(promptPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const answer = data?.choices?.[0]?.message?.content;
        if (answer && answer.trim().length > 0) {
          return {
            success: true,
            answer: answer.trim(),
            provider: 'openai',
            model: config.openaiModel,
          };
        }
      } else {
        const errBody = await response.text();
        console.warn(`[OpenAI API Warning] HTTP ${response.status}: ${errBody}`);
      }
    } catch (err) {
      console.warn('[OpenAI Request Warning]:', err.message);
    }
  }

  // Fallback synthesis with 100% real database data
  const fallbackAnswer = synthesizeContextualResponse(context, cleanQuestion, false);
  return {
    success: true,
    answer: fallbackAnswer,
    provider: 'syncspace-context-engine',
  };
}

/**
 * Generate a comprehensive AI Session Summary of the workspace
 */
export async function generateWorkspaceSummary(roomId, requestingUser) {
  const context = await buildWorkspaceContext(roomId, requestingUser);

  if (config.openaiApiKey && config.openaiApiKey.trim().length > 0 && !config.openaiApiKey.includes('your_openai_api_key')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const promptPayload = {
        model: config.openaiModel || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          {
            role: 'user',
            content: `WORKSPACE CONTEXT:\n${JSON.stringify(context, null, 2)}\n\nGenerate a structured, professional workspace summary including Recent Activity, Team Activity, Pending Work, and Important Events.`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openaiApiKey.trim()}`,
        },
        body: JSON.stringify(promptPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const summary = data?.choices?.[0]?.message?.content;
        if (summary && summary.trim().length > 0) {
          return {
            success: true,
            summary: summary.trim(),
            provider: 'openai',
            model: config.openaiModel,
          };
        }
      }
    } catch (err) {
      console.warn('[OpenAI Summary Warning]:', err.message);
    }
  }

  // Fallback synthesis with 100% real database data
  const fallbackSummary = synthesizeContextualResponse(context, 'summarize workspace', true);
  return {
    success: true,
    summary: fallbackSummary,
    provider: 'syncspace-context-engine',
  };
}
