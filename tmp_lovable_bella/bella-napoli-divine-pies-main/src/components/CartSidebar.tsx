import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, Trash2 } from "lucide-react";
import { CartItem } from "@/types/pizza";

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  itemTotal: (item: CartItem) => number;
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  onCheckout: () => void;
}

export function CartSidebar({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  itemTotal,
  subtotal,
  tax,
  deliveryFee,
  total,
  onCheckout,
}: CartSidebarProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[80] w-full max-w-md bg-card border-l border-gold shadow-gold-lg flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-display text-xl font-bold text-foreground">Warenkorb</h2>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary transition-colors">
                <X className="h-5 w-5 text-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {items.length === 0 ? (
                <p className="text-center text-muted-foreground font-body py-12">
                  Dein Warenkorb ist leer.
                </p>
              ) : (
                items.map((item, index) => (
                  <motion.div
                    key={`${item.pizza.id}-${index}`}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex gap-4 p-3 rounded-lg bg-secondary/50"
                  >
                    <img
                      src={item.pizza.image}
                      alt={item.pizza.name}
                      className="w-16 h-16 rounded-md object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-display text-sm font-semibold text-foreground truncate">
                        {item.pizza.name}
                      </h4>
                      {item.extras.length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">
                          + {item.extras.map((e) => e.name).join(", ")}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                            className="w-7 h-7 flex items-center justify-center rounded border border-border hover:border-primary transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-body w-6 text-center">{item.quantity}</span>
                          <button
                            onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                            className="w-7 h-7 flex items-center justify-center rounded border border-border hover:border-primary transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-body text-sm text-primary font-semibold">
                            {itemTotal(item).toFixed(2)} €
                          </span>
                          <button
                            onClick={() => onRemoveItem(index)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {items.length > 0 && (
              <div className="p-6 border-t border-border space-y-2">
                <div className="flex justify-between font-body text-sm text-muted-foreground">
                  <span>Zwischensumme</span>
                  <span>{subtotal.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between font-body text-sm text-muted-foreground">
                  <span>MwSt. (7%)</span>
                  <span>{tax.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between font-body text-sm text-muted-foreground">
                  <span>Liefergebühr</span>
                  <span>{deliveryFee.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between font-display text-lg font-bold text-foreground pt-2 border-t border-border">
                  <span>Gesamt</span>
                  <span className="text-primary">{total.toFixed(2)} €</span>
                </div>
                <button
                  onClick={onCheckout}
                  className="w-full mt-4 py-3 rounded-md bg-primary text-primary-foreground font-body font-semibold text-sm hover:bg-gold-light transition-colors duration-300"
                >
                  Zur Kasse
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
