export interface Extra {
  id: string;
  name: string;
  price: number;
}

export interface Pizza {
  id: string;
  name: string;
  description: string;
  ingredients: string[];
  price: number;
  image: string;
}

export interface CartItem {
  pizza: Pizza;
  quantity: number;
  extras: Extra[];
}
