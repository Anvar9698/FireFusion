/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#101412",
        panel: "#171d19",
        mint: "#69d5a0",
        ember: "#ed8a53",
        muted: "#7d8981",
        blue: "#77b8e4",
        violet: "#ba9de8",
      },
    },
  },
  plugins: [],
};
