# Creador de Horarios Lic. Química

**QHORA** es una herramienta para la Licenciatura en Química, diseñada con la estequiometría exacta para reducir huecos y mantener los horarios en equilibrio. Permite cargar oferta desde Google Sheets, Excel o CSV, consultar claves y NRC en SIIAU y construir combinaciones compatibles.

## Funciones

- Carga de Google Sheets públicos, archivos Excel `.xlsx` y CSV.
- Captura manual de claves de materias y NRC.
- Comparación de cupos locales contra SIIAU con cálculo de faltantes.
- Generación de combinaciones sin traslapes.
- Priorización por compactación: menos minutos libres, menos huecos y menos días.
- Clasificación matutina, vespertina, mixta o sin horario.
- Guía rápida sobrepuesta e imprimible.
- Selección de una o varias propuestas y exportación conjunta en CSV, PNG o PDF.

## Desarrollo

```bash
npm install
npm run dev
```

## Verificación

```bash
npm run check
```

La oferta de SIIAU puede cambiar durante el periodo de movimientos. Los NRC y cupos deben confirmarse antes de realizar cualquier trámite.
