-- DEVELOPMENT ONLY: every doctor is fictional and visibly marked as demo.
begin;
insert into public.clinic_specialties(slug,name_en,name_ar,description_en,description_ar) values
('general-practice','General practice','طب عام','A starting point when you are unsure which kind of care you need.','نقطة البداية إذا لم تكن متأكداً من نوع الرعاية التي تحتاجها.'),
('gastroenterology','Gastroenterology','الجهاز الهضمي','Care for concerns involving the digestive system.','رعاية للمشكلات المتعلقة بالجهاز الهضمي.'),
('neurology','Neurology','المخ والأعصاب','Care for concerns involving the brain and nervous system.','رعاية للمشكلات المتعلقة بالمخ والجهاز العصبي.'),
('dermatology','Dermatology','الجلدية','Care for concerns involving skin, hair, and nails.','رعاية للمشكلات المتعلقة بالبشرة والشعر والأظافر.'),
('cardiology','Cardiology','القلب','Care for concerns involving the heart and circulation.','رعاية للمشكلات المتعلقة بالقلب والدورة الدموية.'),
('pediatrics','Pediatrics','طب الأطفال','Care for infants, children, and adolescents.','رعاية الرضع والأطفال والمراهقين.')
on conflict(slug) do nothing;
-- Explicitly publish only these complete fictional DEVELOPMENT fixtures.
insert into public.clinic_doctors(slug,name,name_ar,bio,bio_ar,city,address,languages,price,is_demo,is_active,consultation_types) values
('demo-layla-hassan','Dr. Layla Hassan (Demo)','د. ليلى حسن (تجريبي)','Fictional test clinician. This profile exists to test finding care and appointment booking. It does not represent a licensed clinician.','طبيبة افتراضية للاختبار. هذا الملف لتجربة البحث والحجز، ولا يمثل طبيبة مرخصة.','Cairo','Development clinic — no real-world appointments',array['English','Arabic'],350,true,true,array['in_person']),
('demo-omar-salem','Dr. Omar Salem (Demo)','د. عمر سالم (تجريبي)','Fictional test clinician for the development directory. No real medical care is offered.','طبيب افتراضي ضمن دليل الاختبار. لا تُقدم رعاية طبية حقيقية.','Cairo','Development clinic — no real-world appointments',array['English','Arabic'],450,true,true,array['in_person','video']),
('demo-nour-ali','Dr. Nour Ali (Demo)','د. نور علي (تجريبي)','Fictional test clinician for the development directory. No real medical care is offered.','طبيبة افتراضية ضمن دليل الاختبار. لا تُقدم رعاية طبية حقيقية.','Alexandria','Development clinic — no real-world appointments',array['Arabic','English'],400,true,true,array['in_person']),
('demo-adam-youssef','Dr. Adam Youssef (Demo)','د. آدم يوسف (تجريبي)','Fictional test clinician for the development directory. No real medical care is offered.','طبيب افتراضي ضمن دليل الاختبار. لا تُقدم رعاية طبية حقيقية.','Cairo','Development clinic — no real-world appointments',array['Arabic','English'],500,true,true,array['in_person'])
on conflict(slug) do nothing;
insert into public.clinic_doctor_specialties(doctor_id,specialty_id,is_primary)
select d.id,s.id,true from public.clinic_doctors d join public.clinic_specialties s on s.slug=case d.slug when 'demo-layla-hassan' then 'general-practice' when 'demo-omar-salem' then 'gastroenterology' when 'demo-nour-ali' then 'neurology' when 'demo-adam-youssef' then 'dermatology' end where d.is_demo on conflict do nothing;
insert into public.clinic_doctor_availability(doctor_id,start_at,end_at,consultation_type)
select d.id,(((current_date+day::integer)+time '12:00') at time zone 'Africa/Cairo')+slot*interval '30 minutes',(((current_date+day::integer)+time '12:00') at time zone 'Africa/Cairo')+(slot+1)*interval '30 minutes','in_person'
from public.clinic_doctors d cross join generate_series(1,14) day cross join generate_series(0,3) slot
where d.is_demo and not exists(select 1 from public.clinic_doctor_availability a where a.doctor_id=d.id and a.start_at=(((current_date+day::integer)+time '12:00') at time zone 'Africa/Cairo')+slot*interval '30 minutes');
commit;
