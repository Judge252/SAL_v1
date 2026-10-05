begin;

-- Account links are private; directory data remains readable under existing RLS.
revoke select on public.clinic_doctors from public,anon,authenticated;
revoke select(profile_id) on public.clinic_doctors from public,anon,authenticated;
grant select(id,slug,name,name_ar,bio,bio_ar,photo_url,city,address,languages,
  years_experience,price,currency,is_verified,is_active,is_demo,consultation_types,
  created_at,updated_at) on public.clinic_doctors to anon,authenticated;

-- RLS needs ownership without granting callers access to other account IDs.
create or replace function clinic_private.owns_doctor(p_doctor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from public.clinic_doctors
    where id=p_doctor and profile_id=(select auth.uid())
  );
$$;
revoke all on function clinic_private.owns_doctor(uuid) from public,anon,authenticated;
grant execute on function clinic_private.owns_doctor(uuid) to anon,authenticated,service_role;

alter policy clinic_availability_public on public.clinic_doctor_availability
  using (
    is_active and exists(
      select 1 from public.clinic_doctors d where d.id=doctor_id and d.is_active
    ) or clinic_private.owns_doctor(doctor_id)
  );
alter policy clinic_availability_own on public.clinic_doctor_availability
  using (clinic_private.owns_doctor(doctor_id))
  with check (clinic_private.owns_doctor(doctor_id));
alter policy clinic_appointments_own on public.clinic_appointments
  using (patient_id=(select auth.uid()) or clinic_private.owns_doctor(doctor_id));

notify pgrst,'reload schema';
commit;
