import assert from "node:assert/strict";
import test from "node:test";
import { defaultFraming, photoGeometry } from "./photo-framing";

test("landscape and portrait frames start with the same centered square crop as the camera preview", () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920], [512, 512]]) {
    const geometry = photoGeometry(width, height, 512, defaultFraming);
    assert.equal(geometry.x, -geometry.width / 2);
    assert.equal(geometry.y, -geometry.height / 2);
    assert.equal(Math.min(geometry.width, geometry.height), 512);
  }
});

test("straightening and moving a crop never expose blank corners", () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920], [512, 512]]) {
    for (const angle of [-45, -25, 0, 25, 45]) {
      for (const zoom of [1, 1.5, 3]) {
        for (const horizontal of [-100, 0, 100]) {
          for (const vertical of [-100, 0, 100]) {
            const geometry = photoGeometry(width, height, 512, { angle, zoom, horizontal, vertical });
            // Transform every output corner back into image space and check containment.
            for (const x of [-256, 256]) for (const y of [-256, 256]) {
              const localX = x * Math.cos(geometry.radians) + y * Math.sin(geometry.radians);
              const localY = -x * Math.sin(geometry.radians) + y * Math.cos(geometry.radians);
              assert.ok(localX >= geometry.x - 1e-8 && localX <= geometry.x + geometry.width + 1e-8);
              assert.ok(localY >= geometry.y - 1e-8 && localY <= geometry.y + geometry.height + 1e-8);
            }
          }
        }
      }
    }
  }
});
