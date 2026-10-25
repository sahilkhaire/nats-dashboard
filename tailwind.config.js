/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
  	extend: {
  		colors: {
  			border: 'rgb(var(--border) / <alpha-value>)',
  			input: 'rgb(var(--input) / <alpha-value>)',
  			ring: 'rgb(var(--ring) / <alpha-value>)',
  			background: 'rgb(var(--background) / <alpha-value>)',
  			foreground: 'rgb(var(--foreground) / <alpha-value>)',
  			primary: {
  				DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
  				foreground: 'rgb(var(--primary-foreground) / <alpha-value>)'
  			},
  			secondary: {
  				DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
  				foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)'
  			},
  			destructive: {
  				DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
  				foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)'
  			},
  			muted: {
  				DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
  				foreground: 'rgb(var(--muted-foreground) / <alpha-value>)'
  			},
  			accent: {
  				DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
  				foreground: 'rgb(var(--accent-foreground) / <alpha-value>)'
  			},
  			popover: {
  				DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
  				foreground: 'rgb(var(--popover-foreground) / <alpha-value>)'
  			},
  			card: {
  				DEFAULT: 'rgb(var(--card) / <alpha-value>)',
  				foreground: 'rgb(var(--card-foreground) / <alpha-value>)'
  			},
  			chart: {
  				'1': 'rgb(var(--chart-1) / <alpha-value>)',
  				'2': 'rgb(var(--chart-2) / <alpha-value>)',
  				'3': 'rgb(var(--chart-3) / <alpha-value>)',
  				'4': 'rgb(var(--chart-4) / <alpha-value>)',
  				'5': 'rgb(var(--chart-5) / <alpha-value>)'
  			},
  			nats: {
  				focus: 'rgb(var(--nats-focus) / <alpha-value>)'
  			},
  			'nats-bg': 'rgb(var(--nats-bg)    / <alpha-value>)',
  			'nats-card': 'rgb(var(--nats-card)  / <alpha-value>)',
  			'nats-border': 'rgb(var(--nats-border)/ <alpha-value>)',
  			'nats-accent': 'rgb(var(--nats-accent)/ <alpha-value>)',
  			'nats-accent-2': 'rgb(var(--nats-accent-2)/<alpha-value>)',
  			'nats-ok': 'rgb(var(--nats-ok)    / <alpha-value>)',
  			'nats-warn': 'rgb(var(--nats-warn)  / <alpha-value>)',
  			'nats-error': 'rgb(var(--nats-error) / <alpha-value>)',
  			'nats-info': 'rgb(var(--nats-info) / <alpha-value>)',
  			'nats-text-primary': 'rgb(var(--nats-text-primary)  / <alpha-value>)',
  			'nats-text-secondary': 'rgb(var(--nats-text-secondary)/ <alpha-value>)',
  			'nats-text-muted': 'rgb(var(--nats-text-muted)    / <alpha-value>)',
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		fontFamily: {
  			sans: [
  				'Inter',
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif'
  			],
  			mono: [
  				'JetBrains Mono',
  				'Fira Code',
  				'monospace'
  			]
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		boxShadow: {
  			surface: '0 1px 2px rgb(0 0 0 / 0.04)'
  		}
  	}
  },
  plugins: [],
}
