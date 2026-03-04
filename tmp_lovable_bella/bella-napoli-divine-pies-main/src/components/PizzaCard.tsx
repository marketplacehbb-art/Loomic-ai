import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Pizza } from "@/types/pizza";

interface PizzaCardProps {
  pizza: Pizza;
  index: number;
  onConfigure: (pizza: Pizza) => void;
}

export function PizzaCard({ pizza, index, onConfigure }: PizzaCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="group bg-gradient-card rounded-lg overflow-hidden border border-gold shadow-gold hover:shadow-gold-lg transition-all duration-500"
    >
      <div className="relative overflow-hidden aspect-square">
        <img
          src={pizza.image}
          alt={pizza.name}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
        <span className="absolute bottom-4 right-4 font-display text-2xl font-bold text-primary">
          {pizza.price.toFixed(2)} €
        </span>
      </div>
      <div className="p-5">
        <h3 className="font-display text-xl font-semibold text-foreground mb-1">{pizza.name}</h3>
        <p className="font-body text-sm text-muted-foreground mb-3">{pizza.description}</p>
        <p className="font-body text-xs text-muted-foreground/70 mb-4">
          {pizza.ingredients.join(" · ")}
        </p>
        <button
          onClick={() => onConfigure(pizza)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border border-gold text-primary font-body text-sm hover:bg-primary hover:text-primary-foreground transition-all duration-300"
        >
          <Plus className="h-4 w-4" />
          Konfigurieren & Bestellen
        </button>
      </div>
    </motion.div>
  );
}
