// Kota Senja — deterministic screenshot scenes behind ?shot=menu|drive|combat|chase.
// Each one plays the real game forward from a fresh world, so the frame is what a
// short session really looks like. Same seed => same frame.
export function stageShot(name, G) {
  const { actors, vehicles, missions } = G;
  const putInCar = (car, x, z, heading, speed) => {
    for (const arr of [vehicles.parked, vehicles.traffic]) {
      const i = arr.indexOf(car); if (i >= 0) arr.splice(i, 1);
    }
    car.pos.set(x, 0, z);
    car.heading = heading;
    car.mesh.rotation.y = heading;
    car.speed = speed;
    car.kind = 'player';
    actors.player.car = car;
    actors.player.pos.copy(car.pos);
    vehicles.attachHeadlight(car);
  };
  if (name === 'drive') {
    G.startGame();
    const car = vehicles.parked.find((c) => c.own) || vehicles.parked[0];
    putInCar(car, -30, 90, Math.PI / 2, 13); // east down the neon market street
    // a little traffic ahead for life
    vehicles.traffic.slice(0, 3).forEach((t, i) => {
      t.pos.set(10 + i * 22, 0, 90);
      t.heading = Math.PI / 2;
      t.route = [{ x: 54, z: 90 }, { x: 126, z: 90 }];
      t.speed = 9;
    });
    G.camYaw = Math.PI / 2;
    return { screen: 'playing' };
  }
  if (name === 'combat') {
    G.startGame();
    missions.start(1); // Preman Pasar: 4 thugs at the market
    // Stage on the open market street facing east, so the thugs stand in the
    // road in clear view (the old spot put a stall awning between camera and
    // enemies). Player west, thugs ahead in the street.
    actors.player.pos.set(-6, 0, 90);
    actors.player.heading = Math.PI / 2; // facing east, down the street
    actors.player.mesh.position.copy(actors.player.pos);
    actors.enemies.forEach((e, i) => {
      const ex = 8 + i * 4, ez = 88 + (i % 2) * 4;
      e.pos.set(ex, 0, ez);
      e.parts.group.position.copy(e.pos);
    });
    G.camYaw = Math.PI / 2;
    return { screen: 'playing' };
  }
  if (name === 'chase') {
    G.startGame();
    missions.start(2); // Kejar Patroli: wanted 3
    const car = vehicles.parked.find((c) => c.own) || vehicles.parked[0];
    putInCar(car, -60, -36, Math.PI / 2, 17);
    G.camYaw = Math.PI / 2;
    G.shotRear = true; // camera looks back at the pursuing police
    return { screen: 'playing' };
  }
  // default: menu — slow orbit over the plaza at dusk
  G.state.mode = 'menu';
  G.shotOrbit = true;
  return { screen: 'menu' };
}
