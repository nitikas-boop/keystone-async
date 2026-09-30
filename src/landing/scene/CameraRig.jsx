// Continuous camera path. p 0–0.75 follows a Catmull-Rom spline (keyframes every 0.15 of scroll: push-in, the
// keystone close-up, the burst, the graph); 0.75–0.95 orbits the graph ~300°, joining the spline's last point;
// 0.95–1 eases back as the graph settles. While the cards sit on the left (p 0.5–0.95) the camera looks a little
// left of the graph, so the graph sits in the right half of the frame instead of under the text.
import { useFrame } from '@react-three/fiber';
import { CatmullRomCurve3, Vector3 } from 'three';
import { GRAPH_CENTER } from '../layout';
import { ramp, easeInOutCubic, smooth } from '../timeline';

const G = new Vector3(...GRAPH_CENTER);
const R = 11.2; // orbit radius
const Y0 = 1.3; // orbit height above the graph centre at the start of the turn

const POS = new CatmullRomCurve3([
  new Vector3(0, 0.3, 13.5),     // 0.00 the arch, wide
  new Vector3(0, 0.8, 10.8),     // 0.15 slow push-in
  new Vector3(1.1, 2.1, 9.6),    // 0.30 keystone close-up, slightly off-axis
  new Vector3(0.3, 1.9, 11.0),   // 0.45 the burst
  new Vector3(0, 1.8, R + 0.2),  // 0.60 the graph
  new Vector3(0, G.y + Y0, R),   // 0.75 start of the orbit
], false, 'centripetal');
const LOOK = new CatmullRomCurve3([
  new Vector3(0, 0.5, 0),
  new Vector3(0, 0.9, 0),
  new Vector3(0, 2.5, 2.6),
  new Vector3(0, 2.0, 1.6),
  G.clone(),
  G.clone(),
], false, 'centripetal');

const pos = new Vector3();
const look = new Vector3();

export default function CameraRig({ prog, lite }) {
  const shift = lite ? 0 : 2.3; // mobile cards sit at the bottom, so no sideways framing
  useFrame(({ camera, size, scene }) => {
    const p = prog.damped;
    if (p <= 0.75) {
      const t = p / 0.75;
      POS.getPoint(t, pos);
      LOOK.getPoint(t, look);
      look.x -= shift * smooth(p, 0.47, 0.6);
    } else {
      const theta = ((300 * Math.PI) / 180) * easeInOutCubic(ramp(p, 0.75, 0.95));
      const r = R + 1.4 * smooth(p, 0.95, 1);
      const y = Y0 + 1.6 * Math.sin(theta * 0.5) * (1 - 0.4 * smooth(p, 0.9, 1));
      pos.set(G.x + r * Math.sin(theta), G.y + y, G.z + r * Math.cos(theta));
      // Keep the graph right of centre through the turn: offset along the camera's own left.
      const k = shift * (1 - smooth(p, 0.94, 1));
      look.set(G.x - k * Math.cos(theta), G.y, G.z + k * Math.sin(theta));
    }
    // Portrait screens: pull back along the view line so the arch and the graph still fit across.
    const fit = Math.min(2.0, Math.max(1, 0.8 / (size.width / size.height)));
    if (fit > 1) pos.sub(look).multiplyScalar(fit).add(look);
    if (scene.fog) { scene.fog.near = 9 * fit; scene.fog.far = 27 * fit; } // the fog moves back with the camera
    camera.position.copy(pos);
    camera.lookAt(look);
  }, -1);
  return null;
}
