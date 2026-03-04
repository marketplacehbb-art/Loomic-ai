import { Pizza, Extra } from "@/types/pizza";
import margherita from "@/assets/pizza-margherita.jpg";
import diavola from "@/assets/pizza-diavola.jpg";
import quattro from "@/assets/pizza-quattro.jpg";
import tartufo from "@/assets/pizza-tartufo.jpg";
import prosciutto from "@/assets/pizza-prosciutto.jpg";
import vegetariana from "@/assets/pizza-vegetariana.jpg";

export const pizzas: Pizza[] = [
  {
    id: "margherita",
    name: "Margherita",
    description: "Der zeitlose Klassiker aus Neapel – perfekt in seiner Einfachheit.",
    ingredients: ["San-Marzano-Tomaten", "Büffelmozzarella", "Basilikum", "Olivenöl"],
    price: 10.9,
    image: margherita,
  },
  {
    id: "diavola",
    name: "Diavola",
    description: "Feurig-würzige Salami auf einem Bett aus geschmolzenem Käse.",
    ingredients: ["Tomatensauce", "Mozzarella", "Scharfe Salami", "Chili", "Oregano"],
    price: 13.9,
    image: diavola,
  },
  {
    id: "quattro-formaggi",
    name: "Quattro Formaggi",
    description: "Vier erlesene Käsesorten verschmelzen zu purem Genuss.",
    ingredients: ["Mozzarella", "Gorgonzola", "Parmesan", "Fontina"],
    price: 14.9,
    image: quattro,
  },
  {
    id: "tartufo",
    name: "Tartufo",
    description: "Luxuriöse Trüffelpizza mit Steinpilzen – unser Signature-Gericht.",
    ingredients: ["Crème fraîche", "Mozzarella", "Steinpilze", "Trüffelöl", "Rucola"],
    price: 18.9,
    image: tartufo,
  },
  {
    id: "prosciutto",
    name: "Prosciutto e Rucola",
    description: "Hauchdünner Parmaschinken auf frischem Rucola – bella Italia.",
    ingredients: ["Tomatensauce", "Mozzarella", "Parmaschinken", "Rucola", "Parmesan"],
    price: 15.9,
    image: prosciutto,
  },
  {
    id: "vegetariana",
    name: "Vegetariana",
    description: "Gegrilltes Gemüse der Saison auf knusprigem Teig.",
    ingredients: ["Tomatensauce", "Mozzarella", "Zucchini", "Paprika", "Aubergine", "Oliven"],
    price: 12.9,
    image: vegetariana,
  },
];

export const extras: Extra[] = [
  { id: "extra-cheese", name: "Extra Käse", price: 2.0 },
  { id: "truffle-oil", name: "Trüffelöl", price: 3.5 },
  { id: "burrata", name: "Burrata", price: 3.0 },
  { id: "prosciutto", name: "Parmaschinken", price: 2.5 },
  { id: "olives", name: "Oliven", price: 1.5 },
  { id: "arugula", name: "Frischer Rucola", price: 1.0 },
  { id: "chili", name: "Chili-Flocken", price: 0.5 },
  { id: "garlic", name: "Gerösteter Knoblauch", price: 1.0 },
];
