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
      },
      backgroundImage: {
        'paper-texture': "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.08%22/%3E%3C/svg%3E')",
      },
      boxShadow: {
        'sketch': '4px 4px 0px 0px #1a2234',
        'sketch-hover': '2px 2px 0px 0px #1a2234',
        'card': '0 4px 20px -2px rgba(26, 34, 52, 0.1)',
      },
    },
  },
  plugins: [],
};
