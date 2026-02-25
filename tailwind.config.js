/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./client/index.html",
        "./client/src/**/*.{js,jsx,ts,tsx}",
    ],
    safelist: [
        'bg-primary',
        'bg-background-light',
        'bg-background-dark',
        'dark:bg-background-dark',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: "#7C3AED",
                'brand-purple': "#7c3aed",
                'brand-teal': "#14b8a6",
                'background-light': "#F8FAFC",
                'background-dark': "#0B0A1A",
                'sidebar-dark': "#0D0C1F",
                'card-dark': "#16152B",
                'editor-bg': "#0F0E23",
                'editor-tab-active': "#1E1C3D",
                'syntax-tag': "#F472B6",
                'syntax-attr': "#FB923C",
                'syntax-string': "#4ADE80",
                'syntax-comment': "#64748B",
                'syntax-keyword': "#C084FC",
                'border-dark': "#2d1b4d",
                background: {
                    light: "#f6f6f8",
                    dark: "#0a0a0a",
                },
                surface: {
                    dark: "#161022",
                },
                border: {
                    dark: "#2f2348",
                },
                glass: "rgba(34, 25, 51, 0.6)",
            },
            fontFamily: {
                display: ["Outfit", "sans-serif"],
                sans: ["Inter", "sans-serif"],
                mono: ["JetBrains Mono", "monospace"],
            },
            borderRadius: {
                DEFAULT: "0.75rem",
                lg: "1rem",
                xl: "1.5rem",
                full: "9999px",
            },
            animation: {
                'slide-up': 'slideUp 0.3s ease-out',
                'fade-in': 'fadeIn 0.4s ease-out',
                'scale-in': 'scaleIn 0.2s ease-out',
                'shimmer': 'shimmer 2s infinite',
            },
            keyframes: {
                slideUp: {
                    'from': { opacity: '0', transform: 'translateY(20px)' },
                    'to': { opacity: '1', transform: 'translateY(0)' },
                },
                fadeIn: {
                    'from': { opacity: '0' },
                    'to': { opacity: '1' },
                },
                scaleIn: {
                    'from': { transform: 'scale(0.9)', opacity: '0' },
                    'to': { transform: 'scale(1)', opacity: '1' },
                },
                shimmer: {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(100%)' },
                }
            }
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/container-queries'),
    ],
}
