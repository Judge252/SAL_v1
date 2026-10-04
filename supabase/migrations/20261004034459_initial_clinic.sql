-- Isolated namespace: existing public.profiles/doctors/appointments are untouched.
begin;
create schema if not exists extensions;
create schema if not exists clinic_private;
create extension if not exists vector with schema extensions;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table public.clinic_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (length(name) <= 100),
  role text not null default 'patient' check (role in ('patient','doctor','admin')),
  avatar_url text, phone text, locale text not null default 'en' check (locale in ('en','ar')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clinic_specialties (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  name_en text not null, name_ar text not null, description_en text not null default '', description_ar text not null default ''
);
create table public.clinic_doctors (
  id uuid primary key default gen_random_uuid(), profile_id uuid unique references public.clinic_profiles(id) on delete set null,
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'), name text not null, name_ar text not null default '',
  bio text not null default '', bio_ar text not null default '', photo_url text,
  city text not null default '', address text not null default '', languages text[] not null default '{}',
  years_experience integer check (years_experience >= 0), price numeric(10,2) check (price >= 0), currency text not null default 'EGP',
  is_verified boolean not null default false, is_active boolean not null default true, is_demo boolean not null default false,
  consultation_types text[] not null default '{in_person}' check (consultation_types <@ array['in_person','video']::text[]),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clinic_doctor_specialties (
  doctor_id uuid not null references public.clinic_doctors(id) on delete cascade,
  specialty_id uuid not null references public.clinic_specialties(id) on delete restrict,
  is_primary boolean not null default false, primary key(doctor_id,specialty_id)
);
create unique index salapp_primary_specialty on public.clinic_doctor_specialties(doctor_id) where is_primary;
create index salapp_specialty_doctor on public.clinic_doctor_specialties(specialty_id,doctor_id);
create index salapp_doctor_profile on public.clinic_doctors(profile_id);
create index salapp_doctor_active_city on public.clinic_doctors(city) where is_active;
create table public.clinic_doctor_availability (
  id uuid primary key default gen_random_uuid(), doctor_id uuid not null references public.clinic_doctors(id) on delete cascade,
  start_at timestamptz not null, end_at timestamptz not null, consultation_type text not null default 'in_person' check (consultation_type in ('in_person','video')),
  is_active boolean not null default true, created_at timestamptz not null default now(),
  check (end_at > start_at and end_at <= start_at + interval '4 hours'),
  exclude using gist (doctor_id with =, tstzrange(start_at,end_at,'[)') with &&) where (is_active)
);
create index salapp_availability_doctor_start on public.clinic_doctor_availability(doctor_id,start_at);
create table public.clinic_appointments (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.clinic_profiles(id) on delete cascade,
  doctor_id uuid not null references public.clinic_doctors(id), availability_id uuid not null references public.clinic_doctor_availability(id),
  start_at timestamptz not null, end_at timestamptz not null, status text not null default 'confirmed' check (status in ('pending','confirmed','cancelled','completed')),
  reason text not null check (length(reason) between 3 and 2000), notes text,
  consultation_type text not null check (consultation_type in ('in_person','video')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (end_at > start_at),
  exclude using gist (doctor_id with =, tstzrange(start_at,end_at,'[)') with &&) where (status in ('pending','confirmed'))
);
create index salapp_appointments_patient_time on public.clinic_appointments(patient_id,start_at);
create index salapp_appointments_doctor_time on public.clinic_appointments(doctor_id,start_at);
create index salapp_appointments_availability on public.clinic_appointments(availability_id);
create table public.clinic_sal_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.clinic_profiles(id) on delete cascade,
  guest_token_hash text, initial_request_id uuid unique, title text not null default 'SAL conversation' check (length(title) <= 100),
  locale text not null default 'en' check (locale in ('en','ar')),
  processing_until timestamptz not null default '-infinity', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((user_id is not null and guest_token_hash is null) or (user_id is null and guest_token_hash ~ '^[a-f0-9]{64}$'))
);
create index salapp_sessions_owner on public.clinic_sal_sessions(user_id,updated_at desc);
create index salapp_sessions_guest on public.clinic_sal_sessions(guest_token_hash) where user_id is null;
create table public.clinic_sal_messages (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.clinic_sal_sessions(id) on delete cascade,
  request_id uuid not null, role text not null check (role in ('user','assistant')), content text not null,
  structured_data jsonb, created_at timestamptz not null default now(), unique(session_id,request_id,role)
);
create index salapp_messages_session_time on public.clinic_sal_messages(session_id,created_at);
create table public.clinic_knowledge_documents (
  id uuid primary key default gen_random_uuid(), title text not null, source text not null, content text not null,
  metadata jsonb not null default '{}', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clinic_knowledge_chunks (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.clinic_knowledge_documents(id) on delete cascade,
  content text not null, embedding extensions.vector(768), metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index salapp_chunks_document on public.clinic_knowledge_chunks(document_id);
create index salapp_chunks_vector on public.clinic_knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);
create table public.clinic_favorites (
  user_id uuid references public.clinic_profiles(id) on delete cascade, doctor_id uuid references public.clinic_doctors(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(user_id,doctor_id)
);
create index salapp_favorites_doctor on public.clinic_favorites(doctor_id);
create table public.clinic_rate_buckets (scope text not null, day date not null default current_date, count integer not null default 0, primary key(scope,day));

create function clinic_private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
create trigger clinic_profile_updated before update on public.clinic_profiles for each row execute function clinic_private.touch_updated_at();
create trigger clinic_doctor_updated before update on public.clinic_doctors for each row execute function clinic_private.touch_updated_at();
create trigger clinic_appointment_updated before update on public.clinic_appointments for each row execute function clinic_private.touch_updated_at();
create trigger clinic_session_updated before update on public.clinic_sal_sessions for each row execute function clinic_private.touch_updated_at();
create trigger clinic_knowledge_updated before update on public.clinic_knowledge_documents for each row execute function clinic_private.touch_updated_at();
create function clinic_private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.clinic_profiles(id,name) values(new.id,left(coalesce(new.raw_user_meta_data->>'name',new.raw_user_meta_data->>'full_name',''),100)) on conflict(id) do nothing; return new; end; $$;
revoke all on function clinic_private.handle_new_user() from public,anon,authenticated;
create trigger clinic_on_user_created after insert on auth.users for each row execute function clinic_private.handle_new_user();
-- Existing accounts get new application profiles; user-editable role claims are ignored.
insert into public.clinic_profiles(id,name) select id,left(coalesce(raw_user_meta_data->>'name',raw_user_meta_data->>'full_name',''),100) from auth.users on conflict(id) do nothing;

alter table public.clinic_profiles enable row level security;
alter table public.clinic_specialties enable row level security;
alter table public.clinic_doctors enable row level security;
alter table public.clinic_doctor_specialties enable row level security;
alter table public.clinic_doctor_availability enable row level security;
alter table public.clinic_appointments enable row level security;
alter table public.clinic_sal_sessions enable row level security;
alter table public.clinic_sal_messages enable row level security;
alter table public.clinic_knowledge_documents enable row level security;
alter table public.clinic_knowledge_chunks enable row level security;
alter table public.clinic_favorites enable row level security;
alter table public.clinic_rate_buckets enable row level security;

revoke all on public.clinic_profiles,public.clinic_specialties,public.clinic_doctors,public.clinic_doctor_specialties,public.clinic_doctor_availability,public.clinic_appointments,public.clinic_sal_sessions,public.clinic_sal_messages,public.clinic_knowledge_documents,public.clinic_knowledge_chunks,public.clinic_favorites,public.clinic_rate_buckets from anon,authenticated;
grant all on public.clinic_profiles,public.clinic_specialties,public.clinic_doctors,public.clinic_doctor_specialties,public.clinic_doctor_availability,public.clinic_appointments,public.clinic_sal_sessions,public.clinic_sal_messages,public.clinic_knowledge_documents,public.clinic_knowledge_chunks,public.clinic_favorites,public.clinic_rate_buckets to service_role;
grant select on public.clinic_specialties,public.clinic_doctors,public.clinic_doctor_specialties,public.clinic_doctor_availability to anon,authenticated;
grant select on public.clinic_profiles,public.clinic_appointments,public.clinic_sal_sessions,public.clinic_sal_messages,public.clinic_favorites to authenticated;
grant update(name,phone,locale,avatar_url) on public.clinic_profiles to authenticated;
grant update(name,name_ar,bio,bio_ar,city,address,languages,price,consultation_types,photo_url) on public.clinic_doctors to authenticated;
grant insert,update,delete on public.clinic_doctor_availability to authenticated;
grant insert,delete on public.clinic_favorites to authenticated;
create policy clinic_profile_own_read on public.clinic_profiles for select to authenticated using(id=(select auth.uid()));
create policy clinic_profile_own_update on public.clinic_profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy clinic_specialties_public on public.clinic_specialties for select to anon,authenticated using(true);
create policy clinic_doctors_public on public.clinic_doctors for select to anon,authenticated using(is_active or profile_id=(select auth.uid()));
create policy clinic_doctors_own_update on public.clinic_doctors for update to authenticated using(profile_id=(select auth.uid())) with check(profile_id=(select auth.uid()));
create policy clinic_doctor_specialties_public on public.clinic_doctor_specialties for select to anon,authenticated using(exists(select 1 from public.clinic_doctors d where d.id=doctor_id and d.is_active));
create policy clinic_availability_public on public.clinic_doctor_availability for select to anon,authenticated using(is_active and exists(select 1 from public.clinic_doctors d where d.id=doctor_id and d.is_active) or exists(select 1 from public.clinic_doctors d where d.id=doctor_id and d.profile_id=(select auth.uid())));
create policy clinic_availability_own on public.clinic_doctor_availability for all to authenticated using(exists(select 1 from public.clinic_doctors d where d.id=doctor_id and d.profile_id=(select auth.uid()))) with check(exists(select 1 from public.clinic_doctors d where d.id=doctor_id and d.profile_id=(select auth.uid())));
create policy clinic_appointments_own on public.clinic_appointments for select to authenticated using(patient_id=(select auth.uid()) or exists(select 1 from public.clinic_doctors d where d.id=doctor_id and d.profile_id=(select auth.uid())));
create policy clinic_sessions_own on public.clinic_sal_sessions for select to authenticated using(user_id=(select auth.uid()));
create policy clinic_messages_own on public.clinic_sal_messages for select to authenticated using(exists(select 1 from public.clinic_sal_sessions s where s.id=session_id and s.user_id=(select auth.uid())));
create policy clinic_favorites_own on public.clinic_favorites for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create function clinic_private.book_appointment(p_slot uuid,p_reason text) returns public.clinic_appointments language plpgsql security definer set search_path='' as $$
declare selected public.clinic_doctor_availability; result public.clinic_appointments; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if length(trim(p_reason)) not between 3 and 2000 then raise exception 'INVALID_REASON'; end if;
  select * into selected from public.clinic_doctor_availability where id=p_slot for update;
  if not found or not selected.is_active or selected.start_at <= now() or not exists(select 1 from public.clinic_doctors where id=selected.doctor_id and is_active) then raise exception 'INVALID_SLOT'; end if;
  if exists(select 1 from public.clinic_appointments where doctor_id=selected.doctor_id and status in ('pending','confirmed') and tstzrange(start_at,end_at,'[)') && tstzrange(selected.start_at,selected.end_at,'[)')) then raise exception 'SLOT_UNAVAILABLE'; end if;
  insert into public.clinic_appointments(patient_id,doctor_id,availability_id,start_at,end_at,reason,consultation_type)
    values(actor,selected.doctor_id,selected.id,selected.start_at,selected.end_at,trim(p_reason),selected.consultation_type) returning * into result;
  return result;
exception when exclusion_violation then raise exception 'SLOT_UNAVAILABLE';
end; $$;
create function public.clinic_book_appointment(p_slot uuid,p_reason text) returns public.clinic_appointments language sql security invoker set search_path='' as $$ select clinic_private.book_appointment(p_slot,p_reason); $$;
create function clinic_private.cancel_appointment(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  update public.clinic_appointments set status='cancelled' where id=p_id and patient_id=auth.uid() and status in ('pending','confirmed') and start_at>now();
  if not found then raise exception 'CANNOT_CANCEL'; end if; return true;
end; $$;
create function public.clinic_cancel_appointment(p_id uuid) returns boolean language sql security invoker set search_path='' as $$ select clinic_private.cancel_appointment(p_id); $$;
create function clinic_private.available_slots(p_doctor uuid) returns setof public.clinic_doctor_availability language sql stable security definer set search_path='' as $$
select s.* from public.clinic_doctor_availability s join public.clinic_doctors d on d.id=s.doctor_id where s.doctor_id=p_doctor and d.is_active and s.is_active and s.start_at>now() and not exists(select 1 from public.clinic_appointments a where a.doctor_id=s.doctor_id and a.status in ('pending','confirmed') and tstzrange(a.start_at,a.end_at,'[)') && tstzrange(s.start_at,s.end_at,'[)')) order by s.start_at limit 160;
$$;
create function public.clinic_available_slots(p_doctor uuid) returns setof public.clinic_doctor_availability language sql stable security invoker set search_path='' as $$ select * from clinic_private.available_slots(p_doctor); $$;
create function public.clinic_consume_limit(p_scope text,p_limit integer) returns boolean language plpgsql security invoker set search_path='' as $$
declare consumed integer;
begin
  if p_limit not between 1 and 10000 or length(p_scope)>200 then return false; end if;
  insert into public.clinic_rate_buckets(scope,day,count) values(p_scope,current_date,1)
    on conflict(scope,day) do update set count=public.clinic_rate_buckets.count+1 where public.clinic_rate_buckets.count<p_limit returning count into consumed;
  return consumed is not null;
end; $$;
create function public.clinic_match_knowledge(query_embedding extensions.vector(768),match_count integer default 4,threshold float default .55)
returns table(id uuid,title text,source text,content text) language sql stable security invoker set search_path='' as $$
select c.id,d.title,d.source,c.content from public.clinic_knowledge_chunks c join public.clinic_knowledge_documents d on d.id=c.document_id
where d.is_active and c.embedding is not null and 1-(c.embedding operator(extensions.<=>) query_embedding)>threshold
order by c.embedding operator(extensions.<=>) query_embedding limit least(greatest(match_count,1),8);
$$;
revoke all on function public.clinic_book_appointment(uuid,text),public.clinic_cancel_appointment(uuid),public.clinic_available_slots(uuid),public.clinic_consume_limit(text,integer),public.clinic_match_knowledge(extensions.vector,integer,float) from public,anon,authenticated;
revoke all on all functions in schema clinic_private from public,anon,authenticated;
grant usage on schema clinic_private to anon,authenticated,service_role;
grant execute on function public.clinic_book_appointment(uuid,text),public.clinic_cancel_appointment(uuid),clinic_private.book_appointment(uuid,text),clinic_private.cancel_appointment(uuid) to authenticated;
grant execute on function public.clinic_available_slots(uuid),clinic_private.available_slots(uuid) to anon,authenticated,service_role;
grant execute on function public.clinic_consume_limit(text,integer),public.clinic_match_knowledge(extensions.vector,integer,float) to service_role;
grant execute on all functions in schema clinic_private to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('clinic-doctor-photos','clinic-doctor-photos',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy clinic_photo_public_read on storage.objects for select to anon,authenticated using(bucket_id='clinic-doctor-photos');
notify pgrst,'reload schema';
commit;
