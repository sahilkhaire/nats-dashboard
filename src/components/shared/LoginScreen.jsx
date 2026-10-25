import { useState } from 'react'
import { AlertCircle, Loader2, Lock } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

export function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await onLogin(username, password)
      if (!result.ok) setError(result.error || 'Invalid credentials')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <Lock size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">NATS Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="surface-card space-y-4 p-6">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-nats-error/40 bg-nats-error/10 px-3 py-2 text-sm text-nats-error">
              <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
          <div>
            <label htmlFor="username" className="field-label">Username</label>
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div>
            <label htmlFor="password" className="field-label">Password</label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting && <Loader2 size={15} className="animate-spin" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">Credentials are verified by the dashboard server.</p>
      </div>
    </div>
  )
}
