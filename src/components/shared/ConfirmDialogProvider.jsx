import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import { Input } from '../ui/input'

const ConfirmContext = createContext(null)

const CLOSED = { open: false, title: '', description: '', confirmLabel: 'Continue', destructive: true, requireText: null }

/**
 * Promise-based confirmation dialog.
 *
 *   const ok = await confirm('Delete stream?', 'This cannot be undone.', { confirmLabel: 'Delete', requireText: 'ORDERS' })
 */
export function ConfirmDialogProvider({ children }) {
  const [dialog, setDialog] = useState(CLOSED)
  const [typed, setTyped] = useState('')
  const resolverRef = useRef(null)

  const confirm = useCallback((title, description, options = {}) => {
    resolverRef.current?.(false)
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setTyped('')
      setDialog({
        open: true,
        title,
        description,
        confirmLabel: options.confirmLabel || 'Continue',
        destructive: options.destructive !== false,
        requireText: options.requireText || null,
      })
    })
  }, [])

  const close = useCallback((accepted) => {
    resolverRef.current?.(accepted)
    resolverRef.current = null
    setDialog((d) => ({ ...d, open: false }))
  }, [])

  const value = useMemo(() => ({ confirm }), [confirm])
  const blocked = Boolean(dialog.requireText) && typed !== dialog.requireText

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog open={dialog.open} onOpenChange={(open) => { if (!open) close(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            {dialog.description && <AlertDialogDescription>{dialog.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {dialog.requireText && (
            <div className="mt-4">
              <label className="field-label" htmlFor="confirm-text">
                Type <span className="font-mono text-foreground">{dialog.requireText}</span> to confirm
              </label>
              <Input
                id="confirm-text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoFocus
                className="font-mono"
                onKeyDown={(e) => { if (e.key === 'Enter' && !blocked) close(true) }}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={dialog.destructive ? 'destructive' : 'default'}
              disabled={blocked}
              onClick={(e) => {
                if (blocked) { e.preventDefault(); return }
                close(true)
              }}
            >
              {dialog.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirmDialog() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirmDialog must be used within ConfirmDialogProvider')
  return ctx
}
