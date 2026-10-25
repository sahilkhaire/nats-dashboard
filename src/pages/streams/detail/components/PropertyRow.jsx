import { useState } from 'react'
import { Pencil, Check, X as XIcon } from 'lucide-react'

export function PropertyRow({ label, value, displayValue, editable, inputType = 'text', options, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const startEdit = () => { setDraft(value ?? ''); setError(''); setEditing(true) }
  const cancel    = () => setEditing(false)

  const save = async () => {
    setError('')
    setSaving(true)
    try {
      await onSave(draft)
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="group flex flex-col gap-1 border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-muted/30 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="shrink-0 pt-0.5 text-sm text-muted-foreground sm:w-52">{label}</div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            {options ? (
              <select
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="input-enterprise h-8 w-auto text-sm"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
              >
                {options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={inputType}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                className="input-enterprise h-8 w-full font-mono text-sm"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
              />
            )}
            <button onClick={save} disabled={saving} className="rounded p-1 text-nats-ok hover:bg-nats-ok/15 disabled:opacity-50" title="Save (Enter)">
              <Check size={14} />
            </button>
            <button onClick={cancel} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Cancel">
              <XIcon size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="break-all font-mono text-sm text-foreground">{displayValue ?? value ?? '—'}</span>
            {editable && (
              <button
                onClick={startEdit}
                className="rounded p-1 text-muted-foreground opacity-40 transition-all hover:bg-muted hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
                title={`Edit ${label}`}
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
        )}
        {error && <div className="text-xs text-nats-error mt-1">{error}</div>}
      </div>
    </div>
  )
}
