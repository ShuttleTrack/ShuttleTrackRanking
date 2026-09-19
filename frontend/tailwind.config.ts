import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        background: '#1A1A1A',
        surface: '#1A1A1A',
        'surface-dim': '#1A1A1A',
        'surface-container': '#282828',
        'surface-container-low': '#282828',
        'surface-container-high': '#333333',
        'surface-container-highest': '#333333',
        'surface-header': '#000000',
        'on-background': '#F5F5F5',
        'on-surface': '#F5F5F5',
        'on-surface-variant': '#C0C0C0',
        primary: '#EE8A33',
        'primary-container': '#F7B375',
        secondary: '#8a7f74',
        outline: '#7a736c',
        'outline-variant': '#444444',
        error: '#ba1a1a',
      },
      fontFamily: {
        headline: ['var(--font-headline)', 'Manrope', 'sans-serif'],
        body: ['var(--font-body)', 'Inter', 'sans-serif'],
        label: ['var(--font-label)', 'Space Grotesk', 'sans-serif'],
        numeric: ['var(--font-numeric)', 'Share Tech Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
      },
      keyframes: {
        slideDown: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        slideDown: 'slideDown 0.3s ease-in-out',
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        shuttletrack: {
          primary: '#EE8A33',
          'primary-content': '#ffffff',
          secondary: '#8a7f74',
          accent: '#F7B375',
          neutral: '#333333',
          'base-100': '#1A1A1A',
          'base-200': '#282828',
          'base-300': '#333333',
          'base-content': '#F5F5F5',
          info: '#F7B375',
          success: '#006c52',
          warning: '#c9a900',
          error: '#ba1a1a',
        },
      },
      'dark',
    ],
  },
};
export default config;
