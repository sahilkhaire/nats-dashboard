import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '../../lib/utils'

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for non-secure (http) origins where the async clipboard API is unavailable
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

export function CopyButton({ text, label, className, size = 13 }) {
  const [copied, setCopied] = useState(false)
  const onClick = async (e) => {
    e.stopPropagation()
    if (await writeClipboard(String(text ?? ''))) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={copied ? 'Copied' : 'Copy to clipboard'}
      aria-label={label || 'Copy to clipboard'}
      className={cn('inline-flex items-center gap-1 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', className)}
    >
      {copied ? <Check size={size} className="text-nats-ok" /> : <Copy size={size} />}
      {label && <span className="text-xs">{copied ? 'Copied' : label}</span>}
    </button>
  )
}
