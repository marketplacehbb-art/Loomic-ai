import { motion } from "framer-motion";
import { Pizza } from "@/types/pizza";
import { PizzaCard } from "./PizzaCard";
import { pizzas } from "@/data/menu";

interface MenuSectionProps {
  onConfigure: (pizza: Pizza) => void;
}

export function MenuSection({ onConfigure }: MenuSectionProps) {
  return (
    <section id="menu" className="py-24 bg-gradient-dark">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="font-body text-sm uppercase tracking-[0.3em] text-primary mb-3">
            Unsere Kreationen
          </p>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-gradient-gold">
            Speisekarte
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {pizzas.map((pizza, i) => (
            <PizzaCard key={pizza.id} pizza={pizza} index={i} onConfigure={onConfigure} />
          ))}
        </div>
      </div>
    </section>
  );
}
