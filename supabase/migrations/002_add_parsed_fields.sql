-- Migración 002: agregar campos de datos estructurados parseados del OCR
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase

alter table public.receipts
  add column if not exists parsed_amount numeric,
  add column if not exists parsed_date   date;
