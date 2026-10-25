import {
  Activity,
  Boxes,
  Database,
  FileKey2,
  Gauge,
  Globe,
  HeartPulse,
  Leaf,
  Network,
  Radio,
  Server,
  TerminalSquare,
  Users,
  Waves,
} from 'lucide-react'

/**
 * Single source of truth for pages: sidebar, header breadcrumbs and the command palette.
 * `monitoring: true` marks pages that need the HTTP monitoring port.
 */
export const NAV_GROUPS = [
  {
    title: 'Monitor',
    items: [
      { title: 'Overview', url: '/', icon: Activity, description: 'Server health, throughput and resources' },
      { title: 'Health', url: '/health', icon: HeartPulse, description: 'Health check status' },
    ],
  },
  {
    title: 'JetStream',
    items: [
      { title: 'JetStream', url: '/jetstream', icon: Gauge, description: 'Storage, memory and API usage' },
      { title: 'Streams', url: '/streams', icon: Database, description: 'Streams, messages and configuration' },
      { title: 'Consumers', url: '/consumers', icon: Waves, description: 'Consumer lag and delivery' },
      { title: 'Key-Value', url: '/kv', icon: FileKey2, description: 'KV buckets and keys' },
      { title: 'Object Store', url: '/objects', icon: Boxes, description: 'Object buckets and files' },
    ],
  },
  {
    title: 'Core NATS',
    items: [
      { title: 'Connections', url: '/connections', icon: Network, monitoring: true, description: 'Client connections' },
      { title: 'Subscriptions', url: '/subscriptions', icon: Radio, monitoring: true, description: 'Subscription routing' },
    ],
  },
  {
    title: 'Infrastructure',
    items: [
      { title: 'Cluster', url: '/cluster', icon: Server, monitoring: true, description: 'Cluster routes' },
      { title: 'Gateways', url: '/gateways', icon: Globe, monitoring: true, description: 'Supercluster gateways' },
      { title: 'Leaf Nodes', url: '/leaf-nodes', icon: Leaf, monitoring: true, description: 'Leaf node connections' },
      { title: 'Accounts', url: '/accounts', icon: Users, monitoring: true, description: 'Per-account statistics' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { title: 'CLI', url: '/cli', icon: TerminalSquare, description: 'Run nats CLI commands' },
    ],
  },
]

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })))

export function findNavItem(pathname) {
  if (pathname === '/') return NAV_ITEMS[0]
  return NAV_ITEMS.filter((i) => i.url !== '/' && (pathname === i.url || pathname.startsWith(`${i.url}/`)))
    .sort((a, b) => b.url.length - a.url.length)[0] || null
}
