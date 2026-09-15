import assert from "node:assert/strict";
import { decryptUtf8, encryptUtf8, isEncryptedBlob, SiteAccessError } from "../src/lib/site-access";

async function main() {
  const sample = JSON.stringify({ teachers: [{ id: "t1", name: "測試老師" }], secret: "不可公開" });
  const key = "mkpkc-test-key-not-for-github";
  const blob = await encryptUtf8(sample, key);

  assert.equal(isEncryptedBlob(blob), true);
  assert.equal(blob.ct.includes("測試老師"), false);
  assert.equal(JSON.stringify(blob).includes("不可公開"), false);

  const roundTrip = await decryptUtf8(blob, key);
  assert.equal(roundTrip, sample);

  await assert.rejects(() => decryptUtf8(blob, "wrong-key"), (err: unknown) => {
    assert.ok(err instanceof SiteAccessError);
    assert.equal(err.code, "invalid");
    return true;
  });

  console.log("site-access tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
