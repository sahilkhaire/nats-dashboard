import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, Bell, CheckCircle2, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu'

const NotificationContext = createContext(null)

const TOAST_TIMEOUT_MS = 4500
const MAX_NOTIFICATIONS = 100

function getNotificationKey(item = {}) {
  return [item.level || 'info', item.title || '', item.message || '', item.source || 'app'].join('::')
}

function buildNotification(partial = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: partial.title || 'Notification',
    message: partial.message || '',
    level: partial.level || 'info',
    createdAt: Date.now(),
    read: false,
    source: partial.source || 'app',
  }
}

function ToastItem({ item, onClose }) {
  const styleByLevel = {
    error:   { icon: <AlertCircle size={16} className="text-nats-error" />,   container: 'border-l-nats-error' },
    warning: { icon: <AlertTriangle size={16} className="text-nats-warn" />,  container: 'border-l-nats-warn' },
    success: { icon: <CheckCircle2 size={16} className="text-nats-ok" />,     container: 'border-l-nats-ok' },
    info:    { icon: <Bell size={16} className="text-nats-info" />,           container: 'border-l-nats-info' },
  }
  const common = { title: 'text-foreground', message: 'text-muted-foreground', close: 'text-muted-foreground hover:bg-muted hover:text-foreground' }
  const style = { ...common, ...(styleByLevel[item.level] || styleByLevel.info) }

  return (
    <div className={`rounded-lg border border-l-4 border-border bg-popover p-3 shadow-xl ${style.container}`}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{style.icon}</div>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold ${style.title}`}>{item.title}</div>
          {item.message && <div className={`mt-1 text-xs ${style.message}`}>{item.message}</div>}
        </div>
        <button onClick={() => onClose(item.id)} className={`rounded p-1 transition-colors ${style.close}`} aria-label="Close notification">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

function NotificationToasts({ toasts, dismissToast }) {
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastItem item={item} onClose={dismissToast} />
        </div>
      ))}
    </div>
  )
}

export function NotificationCenterButton() {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Notifications" className="relative h-8 w-8">
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))]">
        <div className="flex items-center justify-between gap-3 px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          <div className="flex gap-3">
            <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground">Mark all read</button>
            <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
          </div>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-auto">
          {notifications.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No notifications yet.</div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`border-b border-border px-2 py-2 last:border-b-0 ${n.read ? '' : 'bg-muted/50'}`}>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${n.level === 'error' ? 'bg-nats-error' : n.level === 'warning' ? 'bg-nats-warn' : n.level === 'success' ? 'bg-nats-ok' : 'bg-nats-info'}`} />
                  {n.title}
                </div>
                {n.message && <div className="mt-0.5 break-words text-xs text-muted-foreground">{n.message}</div>}
                <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {n.level} · {new Date(n.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((partial) => {
    const item = buildNotification(partial)
    setToasts((prev) => [item, ...prev].slice(0, 5))
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== item.id))
    }, TOAST_TIMEOUT_MS)
    return item
  }, [])

  const pushNotification = useCallback((partial) => {
    const item = buildNotification(partial)
    const key = getNotificationKey(item)
    setNotifications((prev) => [item, ...prev.filter((n) => getNotificationKey(n) !== key)].slice(0, MAX_NOTIFICATIONS))
    return item
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => setNotifications([]), [])

  const api = useMemo(() => ({
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    showToast,
    pushNotification,
    dismissToast,
    markAllRead,
    clearAll,
    notifyError: (title, message, source = 'app') => { pushNotification({ level: 'error', title, message, source }); return showToast({ level: 'error', title, message, source }) },
    notifyWarning: (title, message, source = 'app') => { pushNotification({ level: 'warning', title, message, source }); return showToast({ level: 'warning', title, message, source }) },
    notifySuccess: (title, message, source = 'app') => showToast({ level: 'success', title, message, source }),
    notifyInfo: (title, message, source = 'app') => showToast({ level: 'info', title, message, source }),
  }), [clearAll, dismissToast, markAllRead, notifications, pushNotification, showToast])

  useEffect(() => {
    const onNotify = (event) => {
      const detail = event?.detail || {}
      const payload = {
        level: detail.level || 'info',
        title: detail.title || 'Notification',
        message: detail.message || '',
        source: detail.source || 'system',
      }
      const channel = detail.channel || 'notification'
      if (channel === 'toast') {
        showToast(payload)
      } else if (channel === 'both') {
        pushNotification(payload)
        showToast(payload)
      } else {
        pushNotification(payload)
      }
    }
    window.addEventListener('app-notify', onNotify)
    return () => window.removeEventListener('app-notify', onNotify)
  }, [pushNotification, showToast])

  return (
    <NotificationContext.Provider value={api}>
      {children}
      <NotificationToasts toasts={toasts} dismissToast={dismissToast} />
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
