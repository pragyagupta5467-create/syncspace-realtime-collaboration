import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  UserPlus,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  FileEdit,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import {
  getNotificationsApi,
  markNotificationAsReadApi,
  markAllNotificationsAsReadApi,
} from '../services/api';

/**
 * Format relative time (e.g. "just now", "5m ago", "2h ago", "yesterday")
 */
function formatRelativeTime(dateString) {
  if (!dateString) return 'recently';
  const now = new Date();
  const date = new Date(dateString);
  const diffSec = Math.max(0, Math.floor((now - date) / 1000));

  if (diffSec < 15) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Icon & color resolver for notification types
 */
function getNotificationVisuals(type) {
  switch (type) {
    case 'USER_JOINED':
      return {
        icon: UserPlus,
        color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
        badge: 'Join',
      };
    case 'TASK_ASSIGNED':
      return {
        icon: UserCheck,
        color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
        badge: 'Assigned',
      };
    case 'TASK_COMPLETED':
      return {
        icon: CheckCircle2,
        color: 'text-teal-500 bg-teal-500/10 border-teal-500/20',
        badge: 'Done',
      };
    case 'TASK_CONFLICT':
      return {
        icon: AlertTriangle,
        color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
        badge: 'Conflict',
      };
    case 'TASK_UPDATED':
    default:
      return {
        icon: FileEdit,
        color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
        badge: 'Update',
      };
  }
}

/**
 * NotificationBell Component
 * Real-time notification center with instant unread counter and interactive dropdown panel.
 */
export function NotificationBell({ socket, currentUser, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [toastNotification, setToastNotification] = useState(null);

  const dropdownRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const navigate = useNavigate();

  // Initial fetch of real notifications from MongoDB
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await getNotificationsApi(40);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.warn('[Notifications] Could not fetch notifications:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Listen for real-time Socket.IO notification events
  useEffect(() => {
    if (!socket) return;

    // Subscribe to personal notification channel
    if (currentUser?.userId || currentUser?.id) {
      const uid = currentUser.userId || currentUser.id;
      socket.emit('subscribe-notifications', { userId: uid });
    }

    const handleNotificationCreated = (newNotif) => {
      if (!newNotif) return;

      // Ensure this notification belongs to current user
      const myId = currentUser?.userId || currentUser?.id;
      if (myId && newNotif.recipientId && newNotif.recipientId !== myId) {
        return;
      }

      setNotifications((prev) => {
        // Prevent duplicate items
        if (prev.some((n) => (n.id || n.notificationId) === (newNotif.id || newNotif.notificationId))) {
          return prev;
        }
        return [newNotif, ...prev];
      });

      setUnreadCount((prev) => prev + 1);

      // Trigger temporary floating toast alert
      setToastNotification(newNotif);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setToastNotification(null);
      }, 5000);
    };

    socket.on('notification-created', handleNotificationCreated);

    return () => {
      socket.off('notification-created', handleNotificationCreated);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [socket, currentUser]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Mark single item as read
  const handleMarkAsRead = async (item, e) => {
    if (e) e.stopPropagation();
    const notifId = item.id || item.notificationId;
    if (!notifId || item.isRead) return;

    // Optimistically update UI
    setNotifications((prev) =>
      prev.map((n) =>
        (n.id || n.notificationId) === notifId ? { ...n, isRead: true } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await markNotificationAsReadApi(notifId);
    } catch (err) {
      console.warn('[Notifications] Failed to mark read:', err.message);
    }
  };

  // Mark all items as read
  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);

    // Optimistically update UI
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsAsReadApi();
    } catch (err) {
      console.warn('[Notifications] Failed to mark all read:', err.message);
    } finally {
      setMarkingAll(false);
    }
  };

  // Handle clicking a notification item
  const handleItemClick = (item) => {
    handleMarkAsRead(item);
    if (item.roomId) {
      setIsOpen(false);
      navigate(`/workspace/${encodeURIComponent(item.roomId)}`);
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Notification Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) {
            fetchNotifications();
          }
        }}
        aria-label="Notifications"
        className={`relative p-2 rounded-xl border transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          isOpen
            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm'
        }`}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'Notifications'}
      >
        <Bell className="h-4 w-4" />

        {/* Unread Counter Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-slate-900 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Real-time Floating Toast Alert */}
      {toastNotification && (
        <div
          onClick={() => {
            handleItemClick(toastNotification);
            setToastNotification(null);
          }}
          className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 flex items-start gap-3 cursor-pointer hover:border-indigo-500/50 transition-all animate-in slide-in-from-bottom-5 duration-300"
        >
          {(() => {
            const visual = getNotificationVisuals(toastNotification.type);
            const IconComp = visual.icon;
            return (
              <div className={`p-2 rounded-xl border ${visual.color} shrink-0 mt-0.5`}>
                <IconComp className="h-4 w-4" />
              </div>
            );
          })()}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {toastNotification.actorName || 'SyncSpace'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {formatRelativeTime(toastNotification.createdAt)}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
              {toastNotification.message}
            </p>
          </div>
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden flex flex-col max-h-[480px] animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold font-mono">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/50">
            {loading && notifications.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2">
                <div className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                  <Sparkles className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No notifications yet
                </p>
                <p className="text-[11px] text-slate-400 max-w-[220px] mx-auto">
                  Collaborative events like room joins, task assignments, and updates will show up here.
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const isRead = !!item.isRead;
                const visual = getNotificationVisuals(item.type);
                const IconComp = visual.icon;

                return (
                  <div
                    key={item.id || item.notificationId}
                    onClick={() => handleItemClick(item)}
                    className={`p-3 transition-colors flex items-start gap-3 cursor-pointer group ${
                      !isRead
                        ? 'bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Visual Icon */}
                    <div className={`p-2 rounded-xl border ${visual.color} shrink-0 mt-0.5`}>
                      <IconComp className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {item.actorName || 'Collaborator'}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                            {visual.badge}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                        {item.message}
                      </p>

                      {item.roomId && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">
                          <ExternalLink className="h-3 w-3" />
                          <span>Room: {item.roomId}</span>
                        </div>
                      )}
                    </div>

                    {/* Unread Indicator Dot */}
                    {!isRead && (
                      <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0 mt-2" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
