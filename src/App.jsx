import { lazy, Suspense, useMemo, Component } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { ConfigProvider, useConfig } from './context/ConfigContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { NotificationProvider } from './context/NotificationContext'
import { LoginScreen } from './components/shared/LoginScreen'
import { ConfirmDialogProvider } from './components/shared/ConfirmDialogProvider'
import { CommandPalette } from './components/shared/CommandPalette'
import { NoConnection } from './components/shared/NoConnection'
import { LoadingState } from './components/shared/PageState'
import { EmptyState } from './components/shared/EmptyState'
import { AppSidebar } from './components/app-sidebar'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'
import { TooltipProvider } from './components/ui/tooltip'
import { Header } from './components/layout/Header'
import { useNatsPolling } from './hooks/useNatsPolling'
import { refetchAll } from './lib/poller'
import { Compass, Loader2 } from 'lucide-react'

const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })))

const OverviewPage      = page(() => import('./pages/overview/OverviewPage'), 'OverviewPage')
const ConnectionsPage   = page(() => import('./pages/connections/ConnectionsPage'), 'ConnectionsPage')
const JetStreamPage     = page(() => import('./pages/jetstream/JetStreamPage'), 'JetStreamPage')
const StreamsPage       = page(() => import('./pages/streams/StreamsPage'), 'StreamsPage')
const StreamDetailPage  = page(() => import('./pages/streams/detail/StreamDetailPage'), 'StreamDetailPage')
const ConsumersPage     = page(() => import('./pages/consumers/ConsumersPage'), 'ConsumersPage')
const SubscriptionsPage = page(() => import('./pages/subscriptions/SubscriptionsPage'), 'SubscriptionsPage')
const ClusterPage       = page(() => import('./pages/cluster/ClusterPage'), 'ClusterPage')
const GatewayPage       = page(() => import('./pages/gateway/GatewayPage'), 'GatewayPage')
const LeafNodesPage     = page(() => import('./pages/leafnodes/LeafNodesPage'), 'LeafNodesPage')
const AccountsPage      = page(() => import('./pages/accounts/AccountsPage'), 'AccountsPage')
const HealthPage        = page(() => import('./pages/health/HealthPage'), 'HealthPage')
const CliPage           = page(() => import('./pages/cli/CliPage'), 'CliPage')
const KvPage            = page(() => import('./pages/kv/KvPage'), 'KvPage')
const ObjectPage        = page(() => import('./pages/objects/ObjectPage'), 'ObjectPage')

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error) {
      return (
        <div className="surface-card mx-auto max-w-2xl p-6">
          <div className="font-semibold text-nats-error">This page crashed</div>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{String(this.state.error?.message || this.state.error)}</pre>
          <button type="button" className="link mt-3 text-sm" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      )
    }
    return this.props.children
  }
}

function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The page you are looking for does not exist."
      action={<Link to="/" className="link text-sm">Go to overview</Link>}
    />
  )
}

function AppContent() {
  const { connection } = useConfig()
  const location = useLocation()
  const { data: varz, lastFetch } = useNatsPolling('/varz')

  const serverMode = useMemo(() => {
    if (!varz || varz._via === 'nats_protocol') return null
    const routes = varz.routes ?? 0
    const isCluster = routes > 0 || Boolean(varz.cluster?.name)
    return { type: isCluster ? 'cluster' : 'standalone', routes, clusterName: varz.cluster?.name }
  }, [varz])

  // Full-bleed pages manage their own padding.
  const fullBleed = location.pathname.startsWith('/cli') || /^\/streams\/.+/.test(location.pathname)

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="page-shell min-w-0 overflow-x-clip">
        <Header serverMode={serverMode} lastUpdated={lastFetch} onRefresh={refetchAll} />
        <main className={fullBleed ? 'min-w-0 flex-1' : 'content-shell min-w-0 flex-1 p-4 sm:p-6'}>
          <PageErrorBoundary resetKey={`${location.pathname}|${connection?.id}`}>
            <Suspense fallback={<div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="animate-spin" size={20} /></div>}>
              {!connection ? <div className="p-4 sm:p-6"><NoConnection /></div> : (
                // Re-mount pages when the connection changes so no state leaks across servers.
                <Routes key={connection.id}>
                  <Route path="/"              element={<OverviewPage />} />
                  <Route path="/connections"   element={<ConnectionsPage />} />
                  <Route path="/jetstream"     element={<JetStreamPage />} />
                  <Route path="/streams"       element={<StreamsPage />} />
                  <Route path="/streams/:name" element={<StreamDetailPage />} />
                  <Route path="/consumers"     element={<ConsumersPage />} />
                  <Route path="/subscriptions" element={<SubscriptionsPage />} />
                  <Route path="/cluster"       element={<ClusterPage />} />
                  <Route path="/gateways"      element={<GatewayPage />} />
                  <Route path="/leaf-nodes"    element={<LeafNodesPage />} />
                  <Route path="/accounts"      element={<AccountsPage />} />
                  <Route path="/health"        element={<HealthPage />} />
                  <Route path="/kv"            element={<KvPage />} />
                  <Route path="/objects"       element={<ObjectPage />} />
                  <Route path="/cli"           element={<CliPage />} />
                  <Route path="*"              element={<NotFound />} />
                </Routes>
              )}
            </Suspense>
          </PageErrorBoundary>
        </main>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  )
}

function AppWithAuth() {
  const { authenticated, loading, login } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={22} />
      </div>
    )
  }

  if (!authenticated) return <LoginScreen onLogin={login} />
  return (
    <ConfigProvider>
      <AppContent />
    </ConfigProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <TooltipProvider delayDuration={200}>
              <ConfirmDialogProvider>
                <AppWithAuth />
              </ConfirmDialogProvider>
            </TooltipProvider>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
