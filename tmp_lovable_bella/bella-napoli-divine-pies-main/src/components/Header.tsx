import { useState, useEffect } from "react";
import { ShoppingCart } from "lucide-react";
import { motion } from "framer-motion";

interface HeaderProps {
  cartCount: number;
  onCartClick: () => void;
}

export function Header({ cartCount, onCartClick }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "glass-dark border-b border-gold shadow-gold" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-6 py-4">
        <a href="#" className="font-display text-2xl font-bold text-primary tracking-wide">
          Bella Napoli
        </a>
        <nav className="hidden md:flex items-center gap-8">
          <a href="#menu" className="font-body text-sm text-foreground/80 hover:text-primary transition-colors">
            Speisekarte
          </a>
          <a href="#about" className="font-body text-sm text-foreground/80 hover:text-primary transition-colors">
            Über Uns
          </a>
        </nav>
        <button
          onClick={onCartClick}
          className="relative p-2 rounded-full hover:bg-secondary transition-colors"
          aria-label="Warenkorb öffnen"
        >
          <ShoppingCart className="h-6 w-6 text-primary" />
          {cartCount > 0 && (
            <motion.span
              key={cartCount}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold"
            >
              {cartCount}
            </motion.span>
          )}
        </button>
      </div>
    </motion.header>
  );
}
