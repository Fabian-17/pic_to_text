// supabase/functions/process-receipt/index.ts
// Edge Function de Supabase (Deno) — llama a OCR.space con la URL de la imagen

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { error: updateError } = await supabase
      .from('receipts')
      .update({
        extracted_text: extractedText || null,
        status: ocrFailed ? 'failed' : 'done',
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
