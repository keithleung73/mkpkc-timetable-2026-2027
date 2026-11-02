import assert from "node:assert/strict";
import {
  captureAccessCodeFromLocation,
  decryptUtf8,
  encryptUtf8,
  githubPagesUnlockUrl,
  isEncryptedBlob,
  parseAccessCodeInput,
  SiteAccessError,
} from "../src/lib/site-access";

const KEY = "mkpkc-A8O2kgL-vM97";
const PAGES = "https://keithleung73.github.io/mkpkc-timetable-2026-2027/";

function testUnlockUrls() {
  const share = githubPagesUnlockUrl(PAGES, KEY);
  assert.equal(share, `${PAGES}?k=${encodeURIComponent(KEY)}`);
  assert.equal(share.includes("#k="), false);

  assert.equal(parseAccessCodeInput(KEY), KEY);
  assert.equal(parseAccessCodeInput(`  ${KEY}  `), KEY);
  assert.equal(parseAccessCodeInput(`${PAGES}?k=${KEY}`), KEY);
  assert.equal(parseAccessCodeInput(`${PAGES}#k=${KEY}`), KEY);
  assert.equal(parseAccessCodeInput(`${PAGES}?date=2026-11-02&k=${KEY}`), KEY);
  assert.equal(
    parseAccessCodeInput(`keithleung73.github.io/mkpkc-timetable-2026-2027/#k=${KEY}`),
    KEY,
  );
  assert.equal(parseAccessCodeInput(`https://keithleung73.github.io/mkpkc-timetable-2026-2027/`), "");
  assert.equal(parseAccessCodeInput(""), "");

  const fromQuery = captureAccessCodeFromLocation({
    hash: "",
    search: `?k=${KEY}`,
  } as Location);
  assert.equal(fromQuery, KEY);

  const fromHash = captureAccessCodeFromLocation({
    hash: `#k=${KEY}`,
    search: "",
  } as Location);
  assert.equal(fromHash, KEY);
}

async function main() {
  testUnlockUrls();

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
