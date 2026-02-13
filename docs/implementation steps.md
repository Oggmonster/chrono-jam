Step 1 (now): Scaffold a React Router app, add the visual theme/tokens, and build static route shells (/, host lobby, player game, results) with mocked data matching your screenshot direction.
Step 2: Add a client game state machine (phases + timers + round progression) with local mock data only.
Step 3: Implement offline autocomplete engine (normalize, prefix buckets, ranked suggestions) and wire song/artist answer flow.
Step 4: Implement timeline placement interaction + correctness check + local scoring.
Step 5: Add backend room service + WebSocket protocol (create/join/start, phase updates, submissions).
Step 6: Add GamePack loading/caching and preload readiness checks.
Step 7: UI polish, accessibility pass, and test coverage for scoring/timeline/autocomplete.