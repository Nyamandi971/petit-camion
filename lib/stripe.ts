import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  throw new Error("Variable d'environnement STRIPE_SECRET_KEY manquante");
}

export const stripe = new Stripe(key);