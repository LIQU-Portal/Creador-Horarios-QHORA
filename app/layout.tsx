import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creador de Horarios Lic. Química",
  description: "Herramienta para explorar la oferta académica y generar horarios compactos para la Licenciatura en Química.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
