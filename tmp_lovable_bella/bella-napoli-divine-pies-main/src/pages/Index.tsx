import { useState } from "react";
import { Pizza } from "@/types/pizza";
import { useCart } from "@/hooks/useCart";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { MenuSection } from "@/components/MenuSection";
import { PizzaConfigurator } from "@/components/PizzaConfigurator";
import { CartSidebar } from "@/components/CartSidebar";
import { CheckoutFlow } from "@/components/CheckoutFlow";

const Index = () => {
  const cart = useCart();
  const [configuringPizza, setConfiguringPizza] = useState<Pizza | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const handleCheckout = () => {
    cart.setIsOpen(false);
    setCheckoutOpen(true);
  };

  const handleOrderComplete = () => {
    cart.clearCart();
    setCheckoutOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header cartCount={cart.itemCount} onCartClick={() => cart.setIsOpen(true)} />
      <main>
        <HeroSection />
        <MenuSection onConfigure={setConfiguringPizza} />
      </main>

      {configuringPizza && (
        <PizzaConfigurator
          pizza={configuringPizza}
          onClose={() => setConfiguringPizza(null)}
          onAddToCart={cart.addItem}
        />
      )}

      <CartSidebar
        isOpen={cart.isOpen}
        onClose={() => cart.setIsOpen(false)}
        items={cart.items}
        onUpdateQuantity={cart.updateQuantity}
        onRemoveItem={cart.removeItem}
        itemTotal={cart.itemTotal}
        subtotal={cart.subtotal}
        tax={cart.tax}
        deliveryFee={cart.deliveryFee}
        total={cart.total}
        onCheckout={handleCheckout}
      />

      <CheckoutFlow
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        total={cart.total}
        onComplete={handleOrderComplete}
      />
    </div>
  );
};

export default Index;
