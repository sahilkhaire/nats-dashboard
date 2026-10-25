import { Link, useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { NAV_GROUPS } from '@/lib/navigation'
import { useConfig } from '@/context/ConfigContext'
import { useAuth } from '@/context/AuthContext'

function NatsMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.14" />
      <path d="M9 22V10h2.6l7.8 8.1V10H22v12h-2.6l-7.8-8.1V22H9z" fill="currentColor" />
    </svg>
  )
}

export function AppSidebar(props) {
  const { pathname } = useLocation()
  const { connection } = useConfig()
  const { version } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  const protocolOnly = /^(nats|tls|ws|wss):\/\//i.test(connection?.monitoringUrl || '')

  const isItemActive = (url) => {
    if (url === '/') return pathname === '/'
    return pathname === url || pathname.startsWith(`${url}/`)
  }

  const closeOnMobile = () => { if (isMobile) setOpenMobile(false) }

  return (
    <Sidebar collapsible="icon" {...props} className="border-r border-sidebar-border">
      <SidebarHeader>
        <Link to="/" onClick={closeOnMobile} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sidebar-primary">
          <NatsMark className="h-8 w-8 shrink-0" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold leading-tight text-sidebar-foreground">NATS Dashboard</div>
            <div className="text-[11px] leading-tight text-muted-foreground">Monitoring & JetStream</div>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          className="mt-1 flex h-8 items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-2 text-xs text-muted-foreground transition-colors hover:text-foreground group-data-[collapsible=icon]:hidden"
        >
          <Search size={13} />
          <span className="flex-1 text-left">Jump to…</span>
          <span className="kbd">⌘K</span>
        </button>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.title} className="py-1">
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isItemActive(item.url)}
                    tooltip={item.monitoring && protocolOnly ? `${item.title} (needs HTTP monitoring URL)` : item.title}
                  >
                    <Link to={item.url} onClick={closeOnMobile} className={item.monitoring && protocolOnly ? 'opacity-60' : ''}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.monitoring && protocolOnly && (
                    <SidebarMenuBadge className="text-[9px] font-medium uppercase text-muted-foreground">http</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <div className="flex items-center justify-between px-2 pb-1 text-[11px] text-muted-foreground">
          <span>NATS Dashboard</span>
          {version && <span className="rounded border border-sidebar-border px-1.5 py-0.5 font-mono text-[10px]">v{version}</span>}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
