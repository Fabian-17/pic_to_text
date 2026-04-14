// supabase/functions/process-receipt/index.ts
// Edge Function de Supabase (Deno) — llama a OCR.space con la URL de la imagen

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Parseo de monto ───────────────────────────────────────────────────────────
// Busca sinónimos de "total" en el texto y extrae el mayor número de esas líneas.
function parseAmount(text: string): number | null {
  const keywords = [
    'total a pagar', 'importe total', 'monto total', 'precio total',
    'valor total', 'gran total', 'neto a pagar', 'importe a pagar',
    'a pagar', 'a cobrar', 'total neto', 'total:', 'subtotal:',
    'importe:', 'monto:', 'cobro:', 'neto:',
    'total', 'subtotal', 'importe', 'monto', 'amount', 'price',
  ];

  const candidates: number[] = [];

  for (const line of text.split(/\r?\n/)) {
    const lower = line.toLowerCase();
    if (!keywords.some(kw => lower.includes(kw))) continue;

    // Captura formatos: 1.234,56 | 1,234.56 | 1234.56 | 1234,56 | 1234
    const numRegex = /(?:\$\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+[.,]\d{1,2}|\d{3,})/g;
    let m: RegExpExecArray | null;
    while ((m = numRegex.exec(line)) !== null) {
      const raw = m[1];
      let val: number;

      if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)) {
        // Europeo/Latinoamericano: 1.234,56 o 1.234
        val = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
      } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(raw)) {
        // US: 1,234.56 o 1,234
        val = parseFloat(raw.replace(/,/g, ''));
      } else if (/^\d+,\d{1,2}$/.test(raw)) {
        // Decimal con coma: 1234,56
        val = parseFloat(raw.replace(',', '.'));
      } else {
        val = parseFloat(raw);
      }

      if (!isNaN(val) && val > 0 && val < 100_000_000) {
        candidates.push(val);
      }
    }
  }

  return candidates.length > 0 ? Math.max(...candidates) : null;
}

// ── Parseo de fecha ───────────────────────────────────────────────────────────
// Detecta múltiples formatos de fecha y los convierte a ISO (YYYY-MM-DD).
function parseDate(text: string): string | null {
  const months: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  };

  // DD/MM/YYYY o DD-MM-YYYY
  const m1 = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (m1) {
    const day = parseInt(m1[1]), month = parseInt(m1[2]), year = m1[3];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
  }

  // YYYY-MM-DD (ISO)
  const m2 = text.match(/\b(\d{4})[\/\-](\d{2})[\/\-](\d{2})\b/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  // "15 de enero de 2024" o "15 enero 2024"
  const monthNames = Object.keys(months).join('|');
  const m3 = text.toLowerCase().match(
    new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${monthNames})\\s+(?:de\\s+)?(\\d{4})\\b`)
  );
  if (m3) {
    const day = String(parseInt(m3[1])).padStart(2,'0');
    const mo  = months[m3[2]];
    return `${m3[3]}-${mo}-${day}`;
  }

  // DD/MM/YY (año de dos dígitos)
  const m4 = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\b/);
  if (m4) {
    const day = parseInt(m4[1]), month = parseInt(m4[2]);
    const year = parseInt(m4[3]) >= 50 ? 1900 + parseInt(m4[3]) : 2000 + parseInt(m4[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
  }

  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { receiptId, imageUrl, ocrBase64 } = await req.json();

    if (!receiptId || !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'receiptId e imageUrl son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Procesando recibo ${receiptId}, imagen: ${imageUrl}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const ocrApiKey = Deno.env.get('OCR_SPACE_API_KEY') ?? 'helloworld';

    // ── Usar base64 enviado por el cliente (ya comprimido a < 1 MB) ──────────
    // El cliente comprime la imagen antes de enviarla, evitando el límite de
    // 1024 KB de OCR.space y el stack overflow de btoa con arrays grandes.
    const base64Image = `data:image/jpeg;base64,${ocrBase64}`;
    console.log(`Base64 recibido: ${Math.round(ocrBase64.length * 0.75 / 1024)} KB aprox.`);

    // ── Llamar a OCR.space con base64 ────────────────────────────────────────
    const formData = new FormData();
    formData.append('base64Image', base64Image);
    formData.append('language', 'spa');
    formData.append('isOverlayRequired', 'false');
    formData.append('OCREngine', '2');
    formData.append('scale', 'true');
    formData.append('detectOrientation', 'true');

    let ocrResult: any;
    try {
      const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { apikey: ocrApiKey },
        body: formData,
        signal: AbortSignal.timeout(30_000),
      });
      ocrResult = await ocrResponse.json();
      console.log('OCR respuesta status:', ocrResponse.status);
      console.log('OCR resultado:', JSON.stringify(ocrResult).slice(0, 300));
    } catch (fetchErr) {
      console.error('OCR fetch error:', fetchErr);
      ocrResult = { IsErroredOnProcessing: true, ErrorMessage: String(fetchErr) };
    }

    let extractedText = '';
    let ocrFailed = false;

    if (
      ocrResult.IsErroredOnProcessing === false &&
      ocrResult.ParsedResults &&
      ocrResult.ParsedResults.length > 0 &&
      ocrResult.ParsedResults[0].ParsedText?.trim()
    ) {
      extractedText = ocrResult.ParsedResults
        .map((r: { ParsedText: string }) => r.ParsedText)
        .join('\n')
        .trim();
      console.log(`Texto extraído: ${extractedText.length} caracteres`);
    } else {
      ocrFailed = true;
      const errMsg = ocrResult.ErrorMessage ?? ocrResult.ErrorDetails ?? JSON.stringify(ocrResult);
      console.error('OCR falló:', errMsg);
    }

    // ── 3. Guardar resultado en la base de datos ──────────────────────────────
    const parsedAmount = extractedText ? parseAmount(extractedText) : null;
    const parsedDate   = extractedText ? parseDate(extractedText)   : null;
    if (parsedAmount !== null) console.log(`Monto detectado: ${parsedAmount}`);
    if (parsedDate   !== null) console.log(`Fecha detectada: ${parsedDate}`);

    const { error: updateError } = await supabase
      .from('receipts')
      .update({
        extracted_text: extractedText || null,
        status: ocrFailed ? 'failed' : 'done',
        parsed_amount: parsedAmount,
        parsed_date:   parsedDate,
      })
      .eq('id', receiptId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, textLength: extractedText.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('process-receipt error:', message);

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
