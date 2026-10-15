-- =====================================================================================
-- Mappa dell'Igiene — 0004_ai_faces.sql
-- Colonne per l'esito "volti" del filtro automatico (Edge Function ai-photo-check).
--
-- Il modello restituisce, oltre al verdetto, i riquadri dei volti riconoscibili (frazioni 0..1
-- dell'immagine: {x, y, w, h}). La moderazione li usa come punto di partenza per la sfocatura
-- obbligatoria prima della pubblicazione (rule.blur_required). Non sono mai esposti al pubblico:
-- la vista public_reports elenca le colonne in modo esplicito e non include queste.
-- =====================================================================================

alter table public.reports
  add column ai_faces_detected boolean,
  add column ai_face_boxes     jsonb not null default '[]'::jsonb,
  add column ai_model          text;

alter table public.reports
  add constraint reports_ai_face_boxes_array_check check (jsonb_typeof(ai_face_boxes) = 'array');

comment on column public.reports.ai_faces_detected is 'Esito del filtro automatico: almeno un volto umano riconoscibile nella foto (da sfocare prima della pubblicazione).';
comment on column public.reports.ai_face_boxes     is 'Riquadri dei volti [{x,y,w,h}] in frazioni 0..1 dell''immagine, come restituiti dal modello. Solo moderazione/segnalante.';
comment on column public.reports.ai_model          is 'Identificativo del modello che ha prodotto il verdetto (es. claude-opus-5-5), null se simulato o non eseguito.';
