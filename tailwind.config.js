module.exports = {
  content: [
    "./_includes/**/*.html",
    "./_layouts/*.html",
    "./_posts/**/*.{html,md}",
    "./_pages/**/*.{html,md}",
    "./*.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", "sans-serif"],
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [require("@tailwindcss/typography")],
};
