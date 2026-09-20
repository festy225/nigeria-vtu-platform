import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
       brand: {
  50: '#f0fdf4',
  300: '#86efac',
  400: '#22c55e',
  500: '#16a34a',
  600: '#15803d',
  700: '#166534'
}
      }
    }
  },
  plugins: []
} satisfies Config;