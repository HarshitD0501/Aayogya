import assert from "node:assert";
import {
  buildCacheKey,
  getCachedResource,
  setCachedResource,
  invalidateResource,
  clearResourceCache,
  fetchWithResourceCache,
  DEFAULT_TTL_MS,
} from "../lib/resourceCache.js";

console.log("Running resource cache and deduplication verification tests...");

// Test 1: Key generation with actor and patient scoping
{
  const key1 = buildCacheKey("/summary", "token-patient-1234567890", "p-shanti");
  const key2 = buildCacheKey("/summary", "token-patient-1234567890", "p-ramesh");
  const key3 = buildCacheKey("/summary", "token-caregiver-0987654321", "p-shanti");

  assert.notStrictEqual(key1, key2, "Different patients must have distinct cache keys");
  assert.notStrictEqual(key1, key3, "Different actors must have distinct cache keys");
  assert.strictEqual(
    key1,
    buildCacheKey("/summary", "token-patient-1234567890", "p-shanti"),
    "Identical actor, patient, and path must produce identical key"
  );
  console.log("PASS: Test 1 - Scoped cache keys enforce strict actor and patient isolation.");
}

// Test 2: In-flight promise deduplication
{
  clearResourceCache();
  let fetchCallCount = 0;
  const mockFetch = async () => {
    fetchCallCount++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { status: "ok", count: 42 };
  };

  const p1 = fetchWithResourceCache("/summary", mockFetch, { actorToken: "tok-1", patientId: "pid-1" });
  const p2 = fetchWithResourceCache("/summary", mockFetch, { actorToken: "tok-1", patientId: "pid-1" });
  const p3 = fetchWithResourceCache("/summary", mockFetch, { actorToken: "tok-1", patientId: "pid-1" });

  const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

  assert.strictEqual(fetchCallCount, 1, `Expected 1 network call, got ${fetchCallCount}`);
  assert.strictEqual(res1.count, 42);
  assert.strictEqual(res2.count, 42);
  assert.strictEqual(res3.count, 42);
  console.log("PASS: Test 2 - Concurrent in-flight requests deduplicated to a single execution.");
}

// Test 3: Cache hit within freshness TTL
{
  let fetchCallCount = 0;
  const mockFetch = async () => {
    fetchCallCount++;
    return { data: "fresh" };
  };

  const first = await fetchWithResourceCache("/medicines", mockFetch, { actorToken: "tok-1", patientId: "pid-1" });
  const second = await fetchWithResourceCache("/medicines", mockFetch, { actorToken: "tok-1", patientId: "pid-1" });

  assert.strictEqual(fetchCallCount, 1, "Second call within TTL should return cached data");
  assert.deepStrictEqual(first, second);
  console.log("PASS: Test 3 - Cache hit within TTL returns cached data without extra fetch.");
}

// Test 4: Invalidation flushes cached entry
{
  let fetchCallCount = 0;
  const mockFetch = async () => {
    fetchCallCount++;
    return { version: fetchCallCount };
  };

  const v1 = await fetchWithResourceCache("/reports", mockFetch, { actorToken: "tok-1", patientId: "pid-1" });
  assert.strictEqual(v1.version, 1);

  invalidateResource("/reports");

  const v2 = await fetchWithResourceCache("/reports", mockFetch, { actorToken: "tok-1", patientId: "pid-1" });
  assert.strictEqual(v2.version, 2, "After invalidation, fresh fetch must occur");
  console.log("PASS: Test 4 - Invalidation flushes matching resource keys.");
}

// Test 5: Full cache clear on session flush
{
  clearResourceCache();
  const key = buildCacheKey("/test", "tok-1", "pid-1");
  setCachedResource(key, { value: 123 });
  assert.deepStrictEqual(getCachedResource(key), { value: 123 });

  clearResourceCache();
  assert.strictEqual(getCachedResource(key), null, "Cache must be empty after clearResourceCache");
  console.log("PASS: Test 5 - clearResourceCache flushes all memory store keys.");
}

console.log("\nALL 5 RESOURCE CACHE & DEDUPLICATION TESTS PASSED SUCCESSFULLY!");
