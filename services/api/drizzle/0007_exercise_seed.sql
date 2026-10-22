-- Starter exercise library. Every row is reviewed = false: the content has NOT been checked by a qualified coach
-- or physiotherapist and the app labels it "Awaiting expert review". Safe to re-run.
INSERT INTO "exercises" ("slug", "name", "category", "equipment", "cues", "safety_notes", "reviewed") VALUES
('goblet-squat', 'Goblet squat', 'STRENGTH', '["dumbbell or kettlebell"]', 'Hold the weight at your chest. Keep your heels down. Sit between your hips and stand tall.', 'Start light and stop a rep or two before form breaks down.', false),
('back-squat', 'Back squat', 'STRENGTH', '["barbell","squat rack"]', 'Brace your trunk. Keep your heels down. Control the way down.', 'Use safety bars or a spotter for heavy sets. Not for maximal attempts without a coach.', false),
('romanian-deadlift', 'Romanian deadlift', 'STRENGTH', '["barbell or dumbbells"]', 'Push your hips back. Keep the weight close to your legs. Stop when your hamstrings feel tight.', 'Keep your back flat and the load moderate.', false),
('split-squat', 'Split squat', 'STRENGTH', '["bodyweight or dumbbells"]', 'Take a long step. Lower straight down. Keep your front foot flat.', 'Hold a wall or rail if you lose balance.', false),
('calf-raise', 'Calf raise', 'STRENGTH', '["bodyweight or dumbbells"]', 'Rise slowly onto your toes, pause, lower slowly.', 'Increase reps and load gradually.', false),
('nordic-hamstring-curl', 'Nordic hamstring curl', 'STRENGTH', '["partner or anchor"]', 'Kneel with your ankles held. Lower your body slowly. Catch yourself with your hands.', 'Advanced and often leaves you very sore. Start with very few reps.', false),
('box-jump', 'Box jump', 'POWER', '["sturdy box"]', 'Swing your arms, jump up, land softly with bent knees, then step down.', 'Choose a box height you can land on comfortably. Step down rather than jump down.', false),
('broad-jump', 'Broad jump', 'POWER', '["open space"]', 'Swing your arms, jump forward, land softly and hold the landing.', 'Use a non-slip surface.', false),
('pogo-hops', 'Pogo hops', 'PLYOMETRIC', '["none"]', 'Stay tall. Hop quickly off the balls of your feet with stiff ankles.', 'Keep sets short. Stop if your calves or Achilles feel painful.', false),
('sprint-10m', '10 m sprint', 'SPEED_AGILITY', '["open space","cones"]', 'Lean forward and drive your arms and knees. Take powerful first steps.', 'Warm up first and rest fully between runs.', false),
('lateral-shuffle', 'Lateral shuffle', 'SPEED_AGILITY', '["cones"]', 'Stay low in an athletic stance. Push off the back foot. Do not cross your feet.', 'Warm up first.', false),
('plank', 'Plank', 'CORE', '["none"]', 'Keep a straight line from head to heels. Squeeze your glutes. Breathe steadily.', 'Stop when your form breaks down.', false),
('bike-intervals', 'Bike intervals', 'CONDITIONING', '["stationary bike"]', 'Alternate hard efforts with easy pedaling. Keep the hard efforts repeatable.', 'Build up the number of intervals gradually.', false),
('hip-90-90', '90/90 hip mobility', 'MOBILITY', '["none"]', 'Sit with both knees bent at 90 degrees. Rotate gently from side to side.', 'Move within a comfortable range and never force it.', false)
ON CONFLICT ("slug") DO NOTHING;
