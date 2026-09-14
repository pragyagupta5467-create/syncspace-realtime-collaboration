import React, { Component } from 'react';
import { Sun, Moon, Laptop, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { CONNECTION_STATUS } from '../hooks/useSocket';

/**
 * Lightweight React Error Boundary
 * Prevents unhandled rendering exceptions from crashing into a blank screen.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV;

      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-2xl space-y-6 animate-in fade-in">
            <div className="h-14 w-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto border border-rose-500/20">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Something went wrong
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Please try again.
              </p>
            </div>

            {isDev && this.state.error && (
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-left overflow-x-auto text-[11px] font-mono text-rose-600 dark:text-rose-400 max-h-32">
                <div className="font-bold mb-1">{this.state.error.toString()}</div>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[10px] text-slate-500 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={this.handleReset}
                className="flex-1 py-2.5 rounded-xl font-semibold text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Return to Dashboard
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 py-2.5 rounded-xl font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reload</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Global Theme Toggle Component
 * Cycles: Dark 🌙 -> Light ☀️ -> System 💻
 */
export function ThemeToggle({ className = '' }) {
  const { theme, effectiveTheme, cycleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className={`p-2 rounded-xl border transition-all flex items-center justify-center gap-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        effectiveTheme === 'dark'
          ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
          : 'bg-white border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-100 shadow-sm'
      } ${className}`}
      title={`Theme: ${theme.toUpperCase()} (Click to cycle Light/Dark/System)`}
      aria-label={`Toggle theme, currently ${theme}`}
    >
      {theme === 'dark' && <Moon className="h-4 w-4 text-indigo-400" />}
      {theme === 'light' && <Sun className="h-4 w-4 text-amber-500" />}
      {theme === 'system' && <Laptop className="h-4 w-4 text-cyan-400" />}
      <span className="capitalize hidden md:inline text-[11px] font-mono">{theme}</span>
    </button>
  );
}

/**
 * Socket.IO Connection Status Badge
 */
export function ConnectionBadge({ status = CONNECTION_STATUS.CONNECTED, className = '' }) {
  const isConnected = status === CONNECTION_STATUS.CONNECTED;
  const isReconnecting = status === CONNECTION_STATUS.RECONNECTING;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium border backdrop-blur-md transition-all ${
        isConnected
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-sm'
          : isReconnecting
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
          : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
      } ${className}`}
    >
      <span className="relative flex h-2 w-2">
        {isConnected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isConnected ? 'bg-emerald-500' : isReconnecting ? 'bg-amber-500' : 'bg-rose-500'
          }`}
        />
      </span>
      <span>{isConnected ? 'Live Sync' : isReconnecting ? 'Reconnecting...' : 'Disconnected'}</span>
    </div>
  );
}

/**
 * Accessible Modal Wrapper
 */
export function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
      <div
        className={`w-full ${maxWidth} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 relative`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Interactive User Profile Dropdown Menu
 * Shows real authenticated user details, theme selector, and logout.
 */
export function UserProfileMenu({ user, onLogout, className = '' }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { theme, setTheme } = useTheme();
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
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

  if (!user) return null;

  const displayName = user.name || user.displayName || 'Collaborator';
  const initial = displayName.charAt(0).toUpperCase();
  const userColor = user.userColor || '#6366f1';

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
        title="User Profile & Settings"
      >
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm"
          style={{ backgroundColor: userColor }}
        >
          {initial}
        </div>
        <div className="hidden sm:block text-left">
          <div className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[110px]">
            {displayName}
          </div>
          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[110px]">
            {user.email || 'Member'}
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150 p-2 space-y-2">
          {/* User Details Header */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div
                className="h-8 w-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0"
                style={{ backgroundColor: userColor }}
              >
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {displayName}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
                  {user.email}
                </div>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[10px] font-mono">
              <span className="text-slate-400">Status:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
            </div>
          </div>

          {/* Theme Quick Selector */}
          <div className="p-2 rounded-xl bg-slate-50/50 dark:bg-slate-950/30">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Theme Mode
            </span>
            <div className="grid grid-cols-3 gap-1 bg-slate-200/60 dark:bg-slate-800/60 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`py-1 text-[11px] font-semibold rounded-md flex items-center justify-center gap-1 transition-all ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Sun className="h-3 w-3 text-amber-500" />
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`py-1 text-[11px] font-semibold rounded-md flex items-center justify-center gap-1 transition-all ${
                  theme === 'dark'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Moon className="h-3 w-3 text-indigo-400" />
                <span>Dark</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`py-1 text-[11px] font-semibold rounded-md flex items-center justify-center gap-1 transition-all ${
                  theme === 'system'
                    ? 'bg-slate-800 text-cyan-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                <Laptop className="h-3 w-3" />
                <span>Auto</span>
              </button>
            </div>
          </div>

          {/* Logout Action */}
          {onLogout && (
            <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onLogout();
                }}
                className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Sign Out Account</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

