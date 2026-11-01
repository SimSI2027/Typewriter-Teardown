// The rear works: the escapement (star wheel and pinion on one shaft along z, the rocker with its loose and rigid
// dogs, the escapement frame), the mainspring drum with its drawband to the carriage's right end, and the margin
// bell (dome inside the left side frame, hammer, rod, and the trip on the frame that the margin stop meets).
import * as THREE from 'three';
import {BELL, CARRIAGE, ESC, MAINSPRING, PITCH} from '../params.js';
import {RACK_Y} from '../kinematics.js';
import {X_TRIP} from './carriage.js';
import {boxGeo, cylGeo, gearGeo, mesh, rodBetween, sphereGeo, spokedGeo} from './util.js';

const D2R = Math.PI / 180;

export function buildRear(mats, nodes) {
  const {m} = mats;
  // ------------------------------------------------------------ escapement
  const esG = new THREE.Group();
  esG.name = 'escapement';
  nodes.escapement.push(esG);
  const AY = ESC.axisY;
  // escapement frame: a bracket from the rear cross member holding the shaft
  mesh(boxGeo(46, 6, 44), m('escapement', 'iron'), [0, AY - 42, ESC.axisZ - 2], null, esG);
  // bearing posts at each end of the shaft (thin, so the wheel and the dogs stay visible)
  for (const z of [ESC.pinionZ + 6, ESC.wheelZ - 6]) {
    mesh(boxGeo(6, 44, 4), m('escapement', 'iron'), [0, AY - 20, z], null, esG);
    mesh(cylGeo(3.4, 3.4, 5, 16), m('escapement', 'iron'), [0, AY, z], [Math.PI / 2, 0, 0], esG);
  }
  mesh(boxGeo(46, 6, 10), m('escapement', 'iron'), [0, AY - 34, -146], null, esG);
  mesh(cylGeo(1.8, 1.8, ESC.pinionZ - ESC.wheelZ + 16, 10), m('escapement', 'steel'), [0, AY, (ESC.pinionZ + ESC.wheelZ) / 2], [Math.PI / 2, 0, 0], esG);
  const wheel = mesh(gearGeo(ESC.wheelTeeth, ESC.wheelR, ESC.wheelR - 2.6, 2.2, 1.8, 'star'), m('escapement', 'brass'), [0, AY, ESC.wheelZ], null, esG);
  const pinion = mesh(gearGeo(ESC.pinionTeeth, ESC.pinionR + 1.3, ESC.pinionR - 1.6, 5, 1.8, 'spur'), m('escapement', 'steel'), [0, AY, ESC.pinionZ], null, esG);
  // rocker: pivots on an x-axis below the wheel; its dogs reach up to the wheel's lowest teeth and move along z
  const ROCK = [0, AY - ESC.wheelR - 16, ESC.wheelZ];
  const rocker = new THREE.Group();
  rocker.position.set(...ROCK);
  esG.add(rocker);
  mesh(boxGeo(20, 5, 12, 1), m('escapement', 'darkSteel'), [0, 0, 0], null, rocker);
  mesh(cylGeo(1.6, 1.6, 30, 10), m('escapement', 'steel'), [0, 0, 0], [0, 0, Math.PI / 2], rocker);
  // the trip arm forward to the universal-bar rocker arm
  mesh(boxGeo(4, 4, 26), m('escapement', 'darkSteel'), [0, 2, 14], null, rocker);
  mesh(cylGeo(1.2, 1.2, 6, 8), m('escapement', 'nickel'), [0, 5, 25], null, rocker);
  // the rigid dog: fixed on the rocker, behind the wheel plane at rest
  const rigid = mesh(boxGeo(3, 14, 2), m('escapement', 'steel'), [2.5, 9, -3.4], null, rocker);
  // the loose dog: on its own pivot stud, sprung; in the wheel plane at rest
  const loose = new THREE.Group();
  loose.position.set(-2.5, 3, 0);
  rocker.add(loose);
  mesh(boxGeo(3, 14, 2), m('escapement', 'nickel'), [0, 6, 0], null, loose);
  mesh(cylGeo(1, 1, 4, 8), m('escapement', 'steel'), [0, 0, 0], [Math.PI / 2, 0, 0], loose);

  // ------------------------------------------------------------ mainspring and drawband
  const msG = new THREE.Group();
  msG.name = 'mainspring';
  nodes.mainspring.push(msG);
  const D = [MAINSPRING.drumX, MAINSPRING.drumY, MAINSPRING.drumZ];
  mesh(boxGeo(60, 6, 30), m('mainspring', 'iron'), [D[0] + 10, D[1] - 14, D[2] + 12], null, msG);
  mesh(boxGeo(8, 30, 8), m('mainspring', 'iron'), [D[0] + 30, D[1] - 28, D[2] + 20], null, msG);
  const drum = new THREE.Group();
  drum.position.set(...D);
  msG.add(drum);
  mesh(cylGeo(MAINSPRING.drumR, MAINSPRING.drumR, MAINSPRING.drumH, 40), m('mainspring', 'darkSteel'), [0, 0, 0], null, drum);
  mesh(spokedGeo(MAINSPRING.drumR - 0.5, 4, 5, 5, 1.6), m('mainspring', 'nickel'), [0, MAINSPRING.drumH / 2 + 0.8, 0], [-Math.PI / 2, 0, 0], drum);
  mesh(boxGeo(4, MAINSPRING.drumH + 2, 2), m('mainspring', 'steel'), [MAINSPRING.drumR - 2, 0, 0], null, drum);
  mesh(cylGeo(2.5, 2.5, 30, 10), m('mainspring', 'steel'), [D[0], D[1] + 4, D[2]], null, msG);
  const band = mesh(boxGeo(1, 6, 0.5), m('mainspring', 'steel'), null, null, msG);

  // ------------------------------------------------------------ bell, hammer, trip
  const beG = new THREE.Group();
  beG.name = 'bell';
  nodes.bell.push(beG);
  // dome: a spherical cap facing out of the left window
  const domeGeo = new THREE.SphereGeometry(BELL.r, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const dome = mesh(domeGeo, m('bell', 'chrome'), [BELL.x + 8, BELL.y, BELL.z], [0, 0, Math.PI / 2], beG);
  dome.material.side = THREE.DoubleSide;
  mesh(cylGeo(3, 3, 22, 12), m('bell', 'steel'), [BELL.x - 2, BELL.y, BELL.z], [0, 0, Math.PI / 2], beG);
  mesh(boxGeo(6, 34, 10), m('bell', 'iron'), [BELL.x + 12, BELL.y - 14, BELL.z], null, beG);
  // hammer on an arm hanging from a pivot, striking the dome's front rim
  const HP = [BELL.x, BELL.y + 42, BELL.z + BELL.r + 10];
  const hammer = new THREE.Group();
  hammer.position.set(...HP);
  beG.add(hammer);
  mesh(boxGeo(2.4, 40, 3), m('bell', 'steel'), [0, -20, 0], null, hammer);
  mesh(sphereGeo(4, 16), m('bell', 'darkSteel'), [0, -42, 0], null, hammer);
  mesh(cylGeo(2, 2, 8, 10), m('bell', 'steel'), [0, 0, 0], [0, 0, Math.PI / 2], hammer);
  // the trip on the frame (bell trip adjuster) and the rod to the hammer
  const TRIP = [X_TRIP, CARRIAGE.railY + 6, -140];
  const trip = new THREE.Group();
  trip.position.set(...TRIP);
  beG.add(trip);
  mesh(boxGeo(4, 14, 5), m('bell', 'nickel'), [0, 7, 0], null, trip);
  mesh(boxGeo(10, 6, 12), m('bell', 'iron'), [0, -4, 4], null, trip);
  const rod = mesh(cylGeo(1.1, 1.1, 1, 8), m('bell', 'steel'), null, null, beG);

  function update(s) {
    wheel.rotation.z = s.wheelDeg * D2R;
    pinion.rotation.z = s.pinionDeg * D2R;
    rocker.rotation.x = -s.rockerDeg * D2R;
    // the rigid dog enters the wheel plane as the loose dog leaves it (z offsets on the rocker), the loose dog is
    // carried sideways by the tooth while it is out, then springs back
    rigid.position.z = -3.4 + 3.4 * s.rigidDog;
    loose.position.z = 3.4 * s.looseDog;
    loose.rotation.z = -s.dogCarry * 0.5;
    // drawband: from the drum's tangent along x to a stud on the carriage's right end
    const xEnd = s.carriageX + CARRIAGE.frameLen / 2 - 6;
    const bz = MAINSPRING.drumZ + MAINSPRING.drumR;
    band.position.set((MAINSPRING.drumX + xEnd) / 2, MAINSPRING.bandY, bz);
    band.scale.set(Math.max(1, Math.abs(xEnd - MAINSPRING.drumX)), 1, 1);
    drum.rotation.y = s.drumDeg * D2R;
    // bell hammer: strike = +1 (touching the rim), cocked = negative
    hammer.rotation.x = s.bellHammer >= 0 ? -0.28 + 0.443 * s.bellHammer : -0.28 + 0.25 * s.bellHammer; // +1 head on the rim
    trip.rotation.x = s.bellHammer < 0 ? s.bellHammer * 0.5 : 0;
    rodBetween(rod, [TRIP[0], TRIP[1] - 4, TRIP[2] + 6], [HP[0] + 6, HP[1], HP[2] - 30], 1);
  }
  return {esG, msG, beG, update, RACK_Y, PITCH};
}
