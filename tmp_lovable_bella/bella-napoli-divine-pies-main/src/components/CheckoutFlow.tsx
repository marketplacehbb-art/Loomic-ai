import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, ArrowRight, MapPin, CreditCard, CheckCircle } from "lucide-react";
import confetti from "canvas-confetti";

interface CheckoutFlowProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  onComplete: () => void;
}

interface AddressData {
  name: string;
  street: string;
  city: string;
  zip: string;
  phone: string;
}

type PaymentMethod = "cash" | "card" | "paypal";

export function CheckoutFlow({ isOpen, onClose, total, onComplete }: CheckoutFlowProps) {
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<AddressData>({ name: "", street: "", city: "", zip: "", phone: "" });
  const [payment, setPayment] = useState<PaymentMethod>("card");
  const [errors, setErrors] = useState<Partial<AddressData>>({});
  const [orderPlaced, setOrderPlaced] = useState(false);

  const validateAddress = () => {
    const newErrors: Partial<AddressData> = {};
    if (!address.name.trim()) newErrors.name = "Pflichtfeld";
    if (!address.street.trim()) newErrors.street = "Pflichtfeld";
    if (!address.city.trim()) newErrors.city = "Pflichtfeld";
    if (!/^\d{5}$/.test(address.zip)) newErrors.zip = "5-stellige PLZ";
    if (!address.phone.trim()) newErrors.phone = "Pflichtfeld";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 0 && !validateAddress()) return;
    if (step < 2) setStep(step + 1);
  };

  const handleSubmit = () => {
    setOrderPlaced(true);
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#D4AF37", "#B22222", "#FFD700", "#FF6347"],
    });
    setTimeout(() => {
      confetti({
        particleCount: 80,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ["#D4AF37", "#FFD700"],
      });
      confetti({
        particleCount: 80,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ["#D4AF37", "#FFD700"],
      });
    }, 300);
  };

  const handleClose = () => {
    if (orderPlaced) {
      onComplete();
      setOrderPlaced(false);
    }
    setStep(0);
    setAddress({ name: "", street: "", city: "", zip: "", phone: "" });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  const steps = [
    { label: "Adresse", icon: MapPin },
    { label: "Zahlung", icon: CreditCard },
    { label: "Bestätigung", icon: CheckCircle },
  ];

  const inputClass =
    "w-full px-4 py-3 rounded-md bg-secondary border border-border text-foreground font-body text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg bg-card border border-gold rounded-lg shadow-gold-lg overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="font-display text-xl font-bold text-foreground">
              {orderPlaced ? "Bestellung bestätigt!" : "Kasse"}
            </h2>
            <button onClick={handleClose} className="p-2 rounded-full hover:bg-secondary transition-colors">
              <X className="h-5 w-5 text-foreground" />
            </button>
          </div>

          {!orderPlaced && (
            <div className="flex items-center gap-2 px-6 pt-6">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      i <= step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className={`text-xs font-body hidden sm:block ${i <= step ? "text-primary" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                  {i < steps.length - 1 && <div className={`flex-1 h-px ${i < step ? "bg-primary" : "bg-border"}`} />}
                </div>
              ))}
            </div>
          )}

          <div className="p-6">
            <AnimatePresence mode="wait">
              {orderPlaced ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 10, stiffness: 200, delay: 0.2 }}
                  >
                    <CheckCircle className="h-20 w-20 text-primary mx-auto mb-6" />
                  </motion.div>
                  <h3 className="font-display text-2xl font-bold text-foreground mb-2">
                    Vielen Dank!
                  </h3>
                  <p className="font-body text-muted-foreground mb-2">
                    Deine Bestellung wird zubereitet und ist in ca. 30–45 Minuten bei dir.
                  </p>
                  <p className="font-display text-xl text-primary font-bold">{total.toFixed(2)} €</p>
                  <button
                    onClick={handleClose}
                    className="mt-6 px-8 py-3 rounded-md bg-primary text-primary-foreground font-body font-semibold text-sm hover:bg-gold-light transition-colors"
                  >
                    Schließen
                  </button>
                </motion.div>
              ) : step === 0 ? (
                <motion.div key="address" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div>
                    <input
                      className={inputClass}
                      placeholder="Vollständiger Name"
                      value={address.name}
                      onChange={(e) => setAddress({ ...address, name: e.target.value })}
                    />
                    {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <input className={inputClass} placeholder="Straße & Hausnummer" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
                    {errors.street && <p className="text-xs text-destructive mt-1">{errors.street}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <input className={inputClass} placeholder="PLZ" value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} />
                      {errors.zip && <p className="text-xs text-destructive mt-1">{errors.zip}</p>}
                    </div>
                    <div>
                      <input className={inputClass} placeholder="Stadt" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
                      {errors.city && <p className="text-xs text-destructive mt-1">{errors.city}</p>}
                    </div>
                  </div>
                  <div>
                    <input className={inputClass} placeholder="Telefonnummer" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} />
                    {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
                  </div>
                </motion.div>
              ) : step === 1 ? (
                <motion.div key="payment" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-3">
                  {(["card", "cash", "paypal"] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      onClick={() => setPayment(method)}
                      className={`w-full flex items-center gap-4 p-4 rounded-md border transition-all ${
                        payment === method ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${payment === method ? "border-primary" : "border-muted-foreground/40"}`}>
                        {payment === method && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </div>
                      <span className="font-body text-sm text-foreground">
                        {method === "card" ? "Kreditkarte" : method === "cash" ? "Barzahlung" : "PayPal"}
                      </span>
                    </button>
                  ))}
                </motion.div>
              ) : (
                <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div className="p-4 rounded-md bg-secondary/50 space-y-2">
                    <p className="font-body text-sm text-muted-foreground">
                      <span className="text-foreground font-semibold">Lieferadresse:</span> {address.name}, {address.street}, {address.zip} {address.city}
                    </p>
                    <p className="font-body text-sm text-muted-foreground">
                      <span className="text-foreground font-semibold">Zahlung:</span>{" "}
                      {payment === "card" ? "Kreditkarte" : payment === "cash" ? "Barzahlung" : "PayPal"}
                    </p>
                    <p className="font-body text-sm text-muted-foreground">
                      <span className="text-foreground font-semibold">Telefon:</span> {address.phone}
                    </p>
                  </div>
                  <div className="flex justify-between font-display text-lg font-bold text-foreground border-t border-border pt-4">
                    <span>Zu zahlen</span>
                    <span className="text-primary">{total.toFixed(2)} €</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!orderPlaced && (
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => step > 0 && setStep(step - 1)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-body text-sm transition-colors ${
                    step > 0 ? "text-foreground hover:bg-secondary" : "text-transparent pointer-events-none"
                  }`}
                >
                  <ArrowLeft className="h-4 w-4" /> Zurück
                </button>
                {step < 2 ? (
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-2 px-6 py-2 rounded-md bg-primary text-primary-foreground font-body text-sm font-semibold hover:bg-gold-light transition-colors"
                  >
                    Weiter <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    className="flex items-center gap-2 px-6 py-2 rounded-md bg-accent text-accent-foreground font-body text-sm font-semibold hover:bg-deep-red-light transition-colors"
                  >
                    Bestellung aufgeben
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
