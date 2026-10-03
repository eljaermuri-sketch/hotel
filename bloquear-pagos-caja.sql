-- bloquear-pagos-caja.sql  (versión 2)
-- Reglas para los pagos de caja:
--   * NADIE puede BORRAR un pago de caja.
--   * Solo la RECEPCIONISTA puede EDITAR un pago (desde su ventana "Pagos de caja").
--   * Nunca se puede cambiar quién registró el pago ni cuándo se registró.
--   * Cada edición queda anotada (editado_por / editado_el).
--
-- Ejecútalo completo en Supabase → SQL Editor. Reemplaza la versión anterior de este
-- archivo y se puede ejecutar varias veces sin problema.
--
-- Si quieres que otro rol también pueda editar (por ejemplo 'admin'), agrégalo en la
-- lista del paso 4 y en ROLES_EDITAN_PAGOS_CAJA dentro del archivo .html.

-- 1) Columnas para dejar rastro de las ediciones
alter table public.pagos_caja add column if not exists editado_por text;
alter table public.pagos_caja add column if not exists editado_el  timestamptz;

-- 2) Políticas: leer, crear y actualizar. NO hay política de borrado.
drop policy if exists "pagos_caja por rol"  on public.pagos_caja;
drop policy if exists "pagos_caja leer"     on public.pagos_caja;
drop policy if exists "pagos_caja crear"    on public.pagos_caja;
drop policy if exists "pagos_caja reenviar" on public.pagos_caja;
drop policy if exists "pagos_caja editar"   on public.pagos_caja;

create policy "pagos_caja leer" on public.pagos_caja
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()
         and coalesce(p.activo, true) and p.rol in ('creador','admin','recepcionista','contador')));

create policy "pagos_caja crear" on public.pagos_caja
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()
         and coalesce(p.activo, true) and p.rol in ('creador','admin','recepcionista')));

-- La app a veces vuelve a enviar un pago ya guardado, sin cambios (por ejemplo, al
-- recuperar la conexión). Por eso los roles que crean pagos necesitan permiso de
-- actualizar. Quién puede CAMBIAR datos de verdad lo decide el paso 4.
create policy "pagos_caja editar" on public.pagos_caja
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()
         and coalesce(p.activo, true) and p.rol in ('creador','admin','recepcionista')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()
         and coalesce(p.activo, true) and p.rol in ('creador','admin','recepcionista')));

-- 3) Sin permiso de borrar para los usuarios de la app
revoke delete on public.pagos_caja from anon, authenticated;

-- 4) Candado en la tabla (aplica también al panel de Supabase)
create or replace function public.pagos_caja_inmutables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rol_usuario    text;
  nombre_usuario text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Los pagos de caja no se pueden borrar.';
  end if;

  -- Quién registró el pago y cuándo no se cambian nunca.
  if (new.id, new.usuario, new.creado_el) is distinct from (old.id, old.usuario, old.creado_el) then
    raise exception 'No se puede cambiar quién registró el pago ni cuándo se registró.';
  end if;

  -- Si no cambió ningún dato (reenvío de la app), se deja pasar tal cual.
  if (new.fecha, new.concepto, new.beneficiario, new.categoria, new.soporte, new.valor, new.forma_pago)
     is not distinct from
     (old.fecha, old.concepto, old.beneficiario, old.categoria, old.soporte, old.valor, old.forma_pago) then
    new.editado_por := old.editado_por;
    new.editado_el  := old.editado_el;
    return new;
  end if;

  -- Hubo cambios: solo la recepcionista puede hacerlos.
  select p.rol, p.nombre into rol_usuario, nombre_usuario
  from public.profiles p
  where p.id = auth.uid() and coalesce(p.activo, true);

  if rol_usuario is null or rol_usuario not in ('recepcionista') then
    raise exception 'Solo la recepcionista puede editar los pagos de caja.';
  end if;

  new.editado_por := coalesce(nombre_usuario, 'recepcionista');
  new.editado_el  := now();
  return new;
end;
$$;

drop trigger if exists pagos_caja_inmutables on public.pagos_caja;
create trigger pagos_caja_inmutables
  before update or delete on public.pagos_caja
  for each row execute function public.pagos_caja_inmutables();

-- Si algún día un administrador necesita corregir algo por SQL, puede desactivar
-- el candado un momento:
--   alter table public.pagos_caja disable trigger pagos_caja_inmutables;
--   ... corrección ...
--   alter table public.pagos_caja enable trigger pagos_caja_inmutables;
