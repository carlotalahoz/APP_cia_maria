-- AD Compañía de María · Fase 2 (1/2): nuevos valores de enumerados.
-- Va en un fichero aparte porque un valor nuevo de enum no puede usarse en la misma transacción en que se añade.
alter type public.event_type add value if not exists 'preparacion_fisica';
alter type public.event_type add value if not exists 'tecnificacion';
alter type public.event_type add value if not exists 'torneo';

alter type public.event_status add value if not exists 'pendiente_aprobacion';
alter type public.event_status add value if not exists 'aplazado';
alter type public.event_status add value if not exists 'pendiente';
alter type public.event_status add value if not exists 'finalizado';
