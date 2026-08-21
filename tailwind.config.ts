import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0d0f14',
        panel: '#151922',
        panel2: '#1b2029',
        edge: '#262d3a',
        accent: '#3b82f6',
        muted: '#8b95a7',
      },
    },
  },
  plugins: [],
};

export default config;
