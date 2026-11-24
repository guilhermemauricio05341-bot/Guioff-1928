export const INSTAGRAM_URL = import.meta.env.VITE_INSTAGRAM_URL || "https://www.instagram.com/_guioff";
export const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || "5511954938680";
export const WHATSAPP_DISPLAY = "(11) 95493-8680";
export const waLink = (text = "Olá! Vim pelo site da GUIOFF e gostaria de mais informações.") =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
