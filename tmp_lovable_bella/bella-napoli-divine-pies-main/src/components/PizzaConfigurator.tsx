import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { Pizza, Extra } from "@/types/pizza";
import { extras } from "@/data/menu";

interface PizzaConfiguratorProps {
  pizza: Pizza | null;
  onClose: () => void;
  onAddToCart: (pizza: Pizza, selectedExtras: Extra[]) => void;
}

export function PizzaConfigurator({ pizza, onClose, onAddToCart }: PizzaConfiguratorProps) {
  const [selectedExtras, setSelectedExtras] = useState<Extra[]>([]);

  if (!pizza) return null;

  const toggleExtra = (extra: Extra) => {
    setSelectedExtras((prev) =>
      prev.find((e) => e.id === extra.id)
        ? prev.filter((e) => e.id !== extra.id)
        : [...prev, extra]
    );
  };

  const extrasTotal = selectedExtras.reduce((sum, e) => sum + e.price, 0);
  const totalPrice = pizza.price + extrasTotal;

  const handleAdd = () => {
    onAddToCart(pizza, selectedExtras);
    setSelectedExtras([]);
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg bg-gradient-card border border-gold rounded-lg shadow-gold-lg overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          <div className="relative h-48">
            <img src={pizza.image} alt={pizza.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-2 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 transition-colors"
            >
              <X className="h-5 w-5 text-foreground" />
            </button>
          </div>

          <div className="p-6">
            <h3 className="font-display text-2xl font-bold text-foreground mb-1">{pizza.name}</h3>
            <p className="font-body text-sm text-muted-foreground mb-6">{pizza.description}</p>

            <h4 className="font-display text-sm uppercase tracking-widest text-primary mb-4">
              Extras hinzufügen
            </h4>

            <div className="space-y-2 mb-8">
              {extras.map((extra) => {
                const selected = selectedExtras.find((e) => e.id === extra.id);
                return (
                  <button
                    key={extra.id}
                    onClick={() => toggleExtra(extra)}
                    className={`w-full flex items-center justify-between p-3 rounded-md border transition-all duration-200 ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                          selected ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span className="font-body text-sm text-foreground">{extra.name}</span>
                    </div>
                    <span className="font-body text-sm text-primary">+{extra.price.toFixed(2)} €</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4 mb-4">
              <span className="font-display text-lg text-foreground">Gesamt</span>
              <span className="font-display text-2xl font-bold text-primary">
                {totalPrice.toFixed(2)} €
              </span>
            </div>

            <button
              onClick={handleAdd}
              className="w-full py-3 rounded-md bg-primary text-primary-foreground font-body font-semibold text-sm hover:bg-gold-light transition-colors duration-300"
            >
              In den Warenkorb
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
