import { motion } from "framer-motion";
import heroImage from "@/assets/hero-pizza.jpg";

export function HeroSection() {
  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        <img src={heroImage} alt="Handgemachte Pizza aus dem Holzofen" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
      </div>
      <div className="relative z-10 text-center px-6 max-w-3xl">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="font-body text-sm uppercase tracking-[0.3em] text-primary mb-4"
        >
          Handwerkliche Pizzeria seit 1987
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="font-display text-5xl md:text-7xl font-bold text-gradient-gold mb-6 leading-tight"
        >
          Bella Napoli
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="font-body text-lg text-foreground/70 mb-8 max-w-xl mx-auto"
        >
          Authentische neapolitanische Pizza, gebacken im Holzofen mit den feinsten Zutaten Italiens.
        </motion.p>
        <motion.a
          href="#menu"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.8 }}
          className="inline-block px-8 py-3 border border-gold rounded-full font-body text-sm uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-300"
        >
          Zur Speisekarte
        </motion.a>
      </div>
    </section>
  );
}
