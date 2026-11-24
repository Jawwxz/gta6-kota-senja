// shots.js — screenshot staging for Kota Senja.
// The test driver loads the game with ?shot=menu|drive|combat|chase and
// captures a frame; each value stages a different scene so the shot shows
// the game, not an empty street. ?fresh=1 clears the save, ?seed=N seeds
// the city so shots are deterministic.

export function parseParams() {
  const q = new URLSearchParams(location.search);
  return {
    shot: q.get('shot'),
    fresh: q.get('fresh') === '1',
    seed: parseInt(q.get('seed') || '1', 10) || 1,
  };
}

// Stage a scenario. Returns true when the game was started for the shot.
export function stageShot(g, shot) {
  if (!shot || shot === 'menu') return false;
  g.startGame();
  if (shot === 'drive') {
    // Dimas already in his own car, rolling down the market street.
    g.enterOwnCar();
    g.player.car.speed = 8;
  } else if (shot === 'combat') {
    // Mission 2 ambush: Dimas on foot, four thugs closing in.
    g.noDamage = true;
    g.missions.start(1);
    g.teleport(0, 84);
    g.player.heading = Math.PI;
    g.camYaw = Math.PI;
  } else if (shot === 'chase') {
    // Three stars, police on the tail, Dimas driving away.
    g.enterOwnCar();
    g.setWanted(3);
    g.player.car.speed = 12;
  }
  return true;
}
