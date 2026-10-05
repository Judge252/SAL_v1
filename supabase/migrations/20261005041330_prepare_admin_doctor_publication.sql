begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Do not silently unpublish or repair existing records during deployment.
do $$ begin
  if exists (
    select 1 from public.clinic_doctors d
    where d.is_active and (
      length(btrim(d.name)) not between 2 and 100
      or length(d.slug) not between 3 and 80
      or cardinality(d.languages) = 0
      or cardinality(d.consultation_types) = 0
      or not exists (
        select 1 from public.clinic_doctor_specialties s where s.doctor_id = d.id
      )
    )
  ) then
    raise exception 'Existing published doctors need review before this migration';
  end if;
end $$;

-- Reuse the existing publication flag: false is draft/archived, true is public.
alter table public.clinic_doctors alter column is_active set default false;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.clinic_doctors'::regclass
      and conname = 'clinic_doctor_publish_fields'
  ) then
    alter table public.clinic_doctors add constraint clinic_doctor_publish_fields
      check (not is_active or (
        length(btrim(name)) between 2 and 100
        and length(slug) between 3 and 80
        and cardinality(languages) > 0
        and cardinality(consultation_types) > 0
      )) not valid;
  end if;
end $$;
alter table public.clinic_doctors validate constraint clinic_doctor_publish_fields;

-- Check specialty links at commit, so the existing atomic save RPC can replace
-- links without temporarily violating publication requirements.
create or replace function clinic_private.check_doctor_publish_specialty()
returns trigger language plpgsql security definer set search_path = '' as $$
declare checked_ids uuid[]; checked_doctor uuid;
begin
  if tg_table_name = 'clinic_doctors' then
    checked_ids := array[new.id];
  elsif tg_op = 'DELETE' then
    checked_ids := array[old.doctor_id];
  elsif tg_op = 'UPDATE' then
    checked_ids := array[old.doctor_id, new.doctor_id];
  else
    checked_ids := array[new.doctor_id];
  end if;
  for checked_doctor in select distinct unnest(checked_ids) order by 1 loop
    -- Serialize publication and specialty changes for the same doctor.
    perform 1 from public.clinic_doctors where id = checked_doctor for update;
    if exists (
      select 1 from public.clinic_doctors d
      where d.id = checked_doctor and d.is_active and not exists (
        select 1 from public.clinic_doctor_specialties s where s.doctor_id = d.id
      )
    ) then
      raise exception 'Published doctor must have a specialty'
        using errcode = '23514', constraint = 'clinic_doctor_publish_specialty';
    end if;
  end loop;
  return null;
end $$;
revoke all on function clinic_private.check_doctor_publish_specialty()
  from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger
    where tgrelid = 'public.clinic_doctors'::regclass
      and tgname = 'clinic_doctor_publish_specialty') then
    create constraint trigger clinic_doctor_publish_specialty
      after insert or update on public.clinic_doctors
      deferrable initially deferred for each row
      execute function clinic_private.check_doctor_publish_specialty();
  end if;
  if not exists (select 1 from pg_trigger
    where tgrelid = 'public.clinic_doctor_specialties'::regclass
      and tgname = 'clinic_doctor_specialty_publish_guard') then
    create constraint trigger clinic_doctor_specialty_publish_guard
      after insert or update or delete on public.clinic_doctor_specialties
      deferrable initially deferred for each row
      execute function clinic_private.check_doctor_publish_specialty();
  end if;
end $$;

-- A patient can still see public doctor details on their own old appointment.
-- The private helper avoids recursion through appointment/doctor RLS policies.
create or replace function clinic_private.has_doctor_appointment(p_doctor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.clinic_appointments
    where doctor_id = p_doctor and patient_id = (select auth.uid())
  );
$$;
revoke all on function clinic_private.has_doctor_appointment(uuid)
  from public, anon, authenticated;
grant execute on function clinic_private.has_doctor_appointment(uuid) to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clinic_doctors'
      and policyname = 'clinic_doctors_appointment_history') then
    create policy clinic_doctors_appointment_history on public.clinic_doctors
      for select to authenticated
      using (not is_active and clinic_private.has_doctor_appointment(id));
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
