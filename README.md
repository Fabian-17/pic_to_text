# pic_to_text

App móvil para fotografiar cualquier documento, recibo o imagen con texto y extraer su contenido automáticamente. Guardá, organizá y buscá el texto de tus imágenes desde el celular.

## Cómo funciona

La app usa un modelo **BaaS (Backend as a Service)**, lo que significa que no hay un servidor propio que mantener. Todo el backend corre sobre servicios en la nube listos para usar:

1. **El usuario saca una foto** con la cámara nativa del celular.
2. **La imagen se sube a Supabase Storage**, un servicio de almacenamiento en la nube. Cada usuario solo puede ver sus propias imágenes gracias a las políticas de seguridad (RLS).
3. **Una Edge Function de Supabase** (código que corre en la nube, sin servidor propio) recibe la imagen, la envía a la API de **OCR.space** y extrae el texto.
4. **El texto extraído se guarda en PostgreSQL** (también dentro de Supabase) con un índice de búsqueda de texto completo.
5. **El usuario puede buscar** cualquier palabra y la app encuentra todos los documentos que la contienen.

```
Celular → Supabase Storage → Edge Function → OCR.space → PostgreSQL
```

## Funcionalidades

- 📷 Foto con la cámara nativa del celular
- 📊 Análisis de calidad de imagen antes de subir
- 🔍 OCR automático para extraer el texto
- 👤 Perfiles de usuario con datos aislados
- 🔎 Buscador de contenido en todos tus documentos
- 🔎 Zoom en la imagen del documento

## Stack

- [Expo](https://expo.dev) (React Native + TypeScript) — app móvil
- [Supabase](https://supabase.com) — BaaS: base de datos, autenticación, storage y funciones
- [OCR.space](https://ocr.space) — extracción de texto gratuita vía API

## Instalación

```bash
git clone https://github.com/Fabian-17/pic_to_text.git
cd pic_to_text/
npm install
```

Copiá `.env.example` a `.env` y completá las variables:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

```bash
npx expo start
```

## Base de datos

Ejecutá `supabase/migrations/001_initial.sql` en el SQL Editor de Supabase antes de usar la app.
