import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { homeAddressSchema } from "./home-address";
import { preparePhoto } from "./profile-photo";
import { timeAwayInputSchema } from "./time-away-validation";

test("time away rejects an end date before the start date", () => {
  const result = timeAwayInputSchema.safeParse({
    employeeId: "550e8400-e29b-41d4-a716-446655440000",
    type: "vacation",
    startDate: "2026-10-10",
    endDate: "2026-10-09",
  });
  assert.equal(result.success, false);
});

test("home address requires complete structured fields", () => {
  const result = homeAddressSchema.safeParse({ line1: "123 Main Street", city: "Phoenix", region: "AZ", country: "US" });
  assert.equal(result.success, false);
});

test("photo processing produces a bounded WebP image and rejects false MIME claims", async () => {
  const input = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#406a52" } }).png().toBuffer();
  const encoded = await preparePhoto(input, "image/png");
  const output = await sharp(Buffer.from(encoded, "base64")).metadata();
  assert.equal(output.format, "webp");
  assert.equal(output.width, 512);
  assert.equal(output.height, 512);
  await assert.rejects(() => preparePhoto(Buffer.from("not an image"), "image/png"));
});
