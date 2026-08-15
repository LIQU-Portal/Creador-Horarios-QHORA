import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creador de Horarios para LQUI",
  description: "Generador de propuestas de horario para CUCEI basado en claves, cupos y compatibilidad.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
