DO $$
DECLARE
  o record;
  svc uuid[];
  ctr uuid[];
  d int;
  n int;
  i int;
  seq int;
  jt timestamptz;
  hr int;
  wait_min numeric;
  serv_min numeric;
  st public.ticket_status;
  pr public.ticket_priority;
  r numeric;
  names text[] := array['Ama','Kofi','Yaa','Kwame','Abena','Kojo','Esi','Yaw','Akosua','Fiifi','Adjoa','Nana','Afua','Kwesi','Serwaa','Mensah','Adwoa','Kobby'];
  notes text[] := array['Fast and friendly','Short wait, thank you','Staff were helpful','Took a while but fine','Great service','Very organised'];
BEGIN
  FOR o IN SELECT id, slug, avg_service_minutes FROM public.organizations LOOP
    SELECT array_agg(id) INTO svc FROM public.services WHERE org_id = o.id AND active;
    SELECT array_agg(id) INTO ctr FROM public.counters WHERE org_id = o.id AND active;

    -- Past history: 8 days back
    FOR d IN 1..8 LOOP
      n := 16 + floor(random() * 12)::int;
      seq := 0;
      FOR i IN 1..n LOOP
        seq := seq + 1;
        -- late-morning peak
        hr := (array[8,9,10,10,11,11,11,12,12,13,14,15,16])[1 + floor(random()*13)::int];
        jt := (current_date - d) + make_interval(hours => hr, mins => floor(random()*60)::int);
        r := random();
        pr := CASE WHEN r < 0.08 THEN 'elderly'::public.ticket_priority
                   WHEN r < 0.15 THEN 'urgent'::public.ticket_priority
                   ELSE 'none'::public.ticket_priority END;
        r := random();
        st := CASE WHEN r < 0.85 THEN 'served'::public.ticket_status
                   WHEN r < 0.93 THEN 'no_show'::public.ticket_status
                   ELSE 'left'::public.ticket_status END;
        wait_min := 3 + random() * (CASE WHEN hr BETWEEN 10 AND 12 THEN 28 ELSE 12 END);
        serv_min := greatest(1, o.avg_service_minutes * (0.6 + random() * 0.9));

        IF st = 'served' THEN
          INSERT INTO public.tickets (org_id, service_id, counter_id, code, name, priority, status, joined_at, called_at, closed_at, walk_in, rating, rating_note)
          VALUES (o.id, svc[1 + floor(random()*array_length(svc,1))::int], ctr[1 + floor(random()*array_length(ctr,1))::int],
                  upper(substr(o.slug,1,1)) || lpad(seq::text,3,'0'),
                  names[1 + floor(random()*array_length(names,1))::int], pr, st,
                  jt, jt + make_interval(mins => wait_min::int), jt + make_interval(mins => (wait_min+serv_min)::int),
                  random() < 0.35,
                  CASE WHEN random() < 0.6 THEN 3 + floor(random()*3)::int ELSE NULL END,
                  CASE WHEN random() < 0.25 THEN notes[1 + floor(random()*array_length(notes,1))::int] ELSE NULL END);
        ELSIF st = 'no_show' THEN
          INSERT INTO public.tickets (org_id, service_id, counter_id, code, name, priority, status, joined_at, called_at, closed_at, walk_in)
          VALUES (o.id, svc[1 + floor(random()*array_length(svc,1))::int], ctr[1 + floor(random()*array_length(ctr,1))::int],
                  upper(substr(o.slug,1,1)) || lpad(seq::text,3,'0'),
                  names[1 + floor(random()*array_length(names,1))::int], pr, st,
                  jt, jt + make_interval(mins => wait_min::int), jt + make_interval(mins => (wait_min+3)::int), random() < 0.35);
        ELSE
          INSERT INTO public.tickets (org_id, service_id, code, name, priority, status, joined_at, closed_at, walk_in)
          VALUES (o.id, svc[1 + floor(random()*array_length(svc,1))::int],
                  upper(substr(o.slug,1,1)) || lpad(seq::text,3,'0'),
                  names[1 + floor(random()*array_length(names,1))::int], pr, st,
                  jt, jt + make_interval(mins => (wait_min+5)::int), random() < 0.35);
        END IF;
      END LOOP;
    END LOOP;

    -- Today: served earlier
    seq := 0;
    FOR i IN 1..5 LOOP
      seq := seq + 1;
      jt := now() - make_interval(mins => 240 - i*30);
      wait_min := 4 + random()*14;
      serv_min := greatest(1, o.avg_service_minutes * (0.7 + random()*0.7));
      INSERT INTO public.tickets (org_id, service_id, counter_id, code, name, priority, status, joined_at, called_at, closed_at, walk_in, rating, rating_note)
      VALUES (o.id, svc[1 + floor(random()*array_length(svc,1))::int], ctr[1 + floor(random()*array_length(ctr,1))::int],
              upper(substr(o.slug,1,1)) || lpad(seq::text,3,'0'),
              names[1 + floor(random()*array_length(names,1))::int], 'none', 'served',
              jt, jt + make_interval(mins => wait_min::int), jt + make_interval(mins => (wait_min+serv_min)::int),
              random() < 0.4,
              3 + floor(random()*3)::int,
              CASE WHEN random() < 0.4 THEN notes[1 + floor(random()*array_length(notes,1))::int] ELSE NULL END);
    END LOOP;

    -- Today: one no-show
    seq := seq + 1;
    jt := now() - interval '95 minutes';
    INSERT INTO public.tickets (org_id, service_id, counter_id, code, name, status, joined_at, called_at, closed_at)
    VALUES (o.id, svc[1], ctr[1], upper(substr(o.slug,1,1)) || lpad(seq::text,3,'0'),
            names[1 + floor(random()*array_length(names,1))::int], 'no_show',
            jt, jt + interval '20 minutes', jt + interval '24 minutes');

    -- Today: currently being called
    seq := seq + 1;
    jt := now() - interval '18 minutes';
    INSERT INTO public.tickets (org_id, service_id, counter_id, code, name, priority, status, joined_at, called_at)
    VALUES (o.id, svc[1 + floor(random()*array_length(svc,1))::int], ctr[1],
            upper(substr(o.slug,1,1)) || lpad(seq::text,3,'0'),
            names[1 + floor(random()*array_length(names,1))::int], 'none', 'called',
            jt, now() - interval '2 minutes');

    -- Today: waiting queue (priority first by join order)
    n := 6 + floor(random()*4)::int;
    FOR i IN 1..n LOOP
      seq := seq + 1;
      jt := now() - make_interval(mins => (n - i) * 5 + 2);
      r := random();
      pr := CASE WHEN i <= 2 AND r < 0.7 THEN (array['elderly','urgent'])[1 + floor(random()*2)::int]::public.ticket_priority
                 ELSE 'none'::public.ticket_priority END;
      INSERT INTO public.tickets (org_id, service_id, code, name, priority, status, joined_at, walk_in, kiosk)
      VALUES (o.id, svc[1 + floor(random()*array_length(svc,1))::int],
              upper(substr(o.slug,1,1)) || lpad(seq::text,3,'0'),
              names[1 + floor(random()*array_length(names,1))::int], pr, 'waiting',
              jt, random() < 0.4, random() < 0.3);
    END LOOP;
  END LOOP;
END $$;