/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', '"DM Sans"', 'sans-serif'],
        serif: ['var(--font-serif)', '"Playfair Display"', 'serif'],
        'ui-sans': ['var(--font-body-stack)', '"DM Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Noto Sans Devanagari"', 'sans-serif'],
        'ui-serif': ['var(--font-display-stack)', '"Playfair Display"', 'Georgia', '"Noto Serif Devanagari"', 'serif'],
      },
      colors: {
        brand: {
          navy: '#1a2234',
          orange: '#e8a838',
          cream: '#f5f2eb',
          peach: '#f4c4a8',
          gray: '#6b6b6b',
          white: '#ffffff',
        },
        ui: {
          canvas: 'var(--ui-canvas, #F8F5EE)',
          surface: 'var(--ui-surface, #FFFFFF)',
          'surface-subtle': 'var(--ui-surface-subtle, #F1EBDF)',
          'border-decorative': 'var(--ui-border-decorative, #E8DFD0)',
          text: 'var(--ui-text, #172B4D)',
          'text-secondary': 'var(--ui-text-secondary, #526174)',
          blue: 'var(--ui-blue, #2457A7)',
          'blue-hover': 'var(--ui-blue-hover, #1D478A)',
          'control-border': 'var(--ui-control-border, #7A8796)',
          success: 'var(--ui-success, #25633E)',
          warning: 'var(--ui-warning, #855800)',
          danger: 'var(--ui-danger, #B42318)',
        },
      },
      backgroundImage: {
        'paper-texture': "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.08%22/%3E%3C/svg%3E')",
      },
      boxShadow: {
        'sketch': '4px 4px 0px 0px #1a2234',
        'sketch-hover': '2px 2px 0px 0px #1a2234',
        'card': '0 4px 20px -2px rgba(26, 34, 52, 0.1)',
        'ui-card': '0 2px 8px rgba(23, 43, 77, 0.05)',
        'ui-modal': '0 20px 60px rgba(23, 43, 77, 0.18)',
      },
    },
  },
  plugins: [],
};
