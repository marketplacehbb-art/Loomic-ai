import { useState, useEffect, useCallback } from "react";
import { CartItem, Pizza, Extra } from "@/types/pizza";

const CART_KEY = "bella-napoli-cart";

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((pizza: Pizza, extras: Extra[]) => {
    setItems((prev) => {
      const extrasKey = extras.map((e) => e.id).sort().join(",");
      const existing = prev.find(
        (i) => i.pizza.id === pizza.id && i.extras.map((e) => e.id).sort().join(",") === extrasKey
      );
      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { pizza, quantity: 1, extras }];
    });
    setIsOpen(true);
  }, []);

  const updateQuantity = useCallback((index: number, quantity: number) => {
    setItems((prev) => {
      if (quantity <= 0) return prev.filter((_, i) => i !== index);
      return prev.map((item, i) => (i === index ? { ...item, quantity } : item));
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    localStorage.removeItem(CART_KEY);
  }, []);

  const itemTotal = (item: CartItem) => {
    const extrasTotal = item.extras.reduce((sum, e) => sum + e.price, 0);
    return (item.pizza.price + extrasTotal) * item.quantity;
  };

  const subtotal = items.reduce((sum, item) => sum + itemTotal(item), 0);
  const tax = subtotal * 0.07;
  const deliveryFee = items.length > 0 ? 5 : 0;
  const total = subtotal + tax + deliveryFee;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items,
    isOpen,
    setIsOpen,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    itemTotal,
    subtotal,
    tax,
    deliveryFee,
    total,
    itemCount,
  };
}
