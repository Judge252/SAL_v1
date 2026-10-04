begin;
create function public.salapp_save_doctor(p_data jsonb,p_specialty uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid := coalesce((p_data->>'id')::uuid,gen_random_uuid()); linked_profile uuid := (p_data->>'profile_id')::uuid;
begin
  if not exists(select 1 from public.clinic_specialties where id=p_specialty) then raise exception 'INVALID_SPECIALTY'; end if;
  if linked_profile is not null and not exists(select 1 from public.clinic_profiles where id=linked_profile and role in ('patient','doctor')) then raise exception 'INVALID_PROFILE'; end if;
  insert into public.clinic_doctors(id,profile_id,slug,name,name_ar,bio,bio_ar,city,address,languages,price,currency,years_experience,photo_url,is_active,is_verified,is_demo,consultation_types)
  values(result,linked_profile,p_data->>'slug',p_data->>'name',p_data->>'name_ar',p_data->>'bio',p_data->>'bio_ar',p_data->>'city',p_data->>'address',array(select jsonb_array_elements_text(p_data->'languages')),(p_data->>'price')::numeric,p_data->>'currency',(p_data->>'years_experience')::integer,p_data->>'photo_url',(p_data->>'is_active')::boolean,(p_data->>'is_verified')::boolean,(p_data->>'is_demo')::boolean,array(select jsonb_array_elements_text(p_data->'consultation_types')))
  on conflict(id) do update set profile_id=excluded.profile_id,slug=excluded.slug,name=excluded.name,name_ar=excluded.name_ar,bio=excluded.bio,bio_ar=excluded.bio_ar,city=excluded.city,address=excluded.address,languages=excluded.languages,price=excluded.price,currency=excluded.currency,years_experience=excluded.years_experience,photo_url=excluded.photo_url,is_active=excluded.is_active,is_verified=excluded.is_verified,is_demo=excluded.is_demo,consultation_types=excluded.consultation_types;
  delete from public.clinic_doctor_specialties where doctor_id=result;
  insert into public.clinic_doctor_specialties(doctor_id,specialty_id,is_primary) values(result,p_specialty,true);
  if linked_profile is not null then update public.clinic_profiles set role='doctor' where id=linked_profile and role='patient'; end if;
  return result;
end; $$;
create function public.salapp_save_knowledge(p_document jsonb,p_chunks jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid := coalesce((p_document->>'id')::uuid,gen_random_uuid()); chunk jsonb;
begin
  if jsonb_array_length(p_chunks)<1 or jsonb_array_length(p_chunks)>30 then raise exception 'INVALID_CHUNKS'; end if;
  insert into public.clinic_knowledge_documents(id,title,source,content,is_active) values(result,p_document->>'title',p_document->>'source',p_document->>'content',(p_document->>'is_active')::boolean)
  on conflict(id) do update set title=excluded.title,source=excluded.source,content=excluded.content,is_active=excluded.is_active;
  delete from public.clinic_knowledge_chunks where document_id=result;
  for chunk in select * from jsonb_array_elements(p_chunks) loop
    insert into public.clinic_knowledge_chunks(document_id,content,embedding,metadata) values(result,chunk->>'content',(chunk->'embedding')::text::extensions.vector(768),jsonb_build_object('embedding_model','gemini-embedding-001'));
  end loop;
  return result;
end; $$;
revoke all on function public.salapp_save_doctor(jsonb,uuid),public.salapp_save_knowledge(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.salapp_save_doctor(jsonb,uuid),public.salapp_save_knowledge(jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
