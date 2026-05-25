/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        mono: ['JetBrainsMono_400Regular'],
        'mono-semibold': ['JetBrainsMono_600SemiBold'],
      },
    },
  },
  plugins: [],
}

