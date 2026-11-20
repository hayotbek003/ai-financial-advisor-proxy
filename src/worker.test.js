import worker, { corsHeaders } from "./worker.js";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

console.log("=================================================");
console.log("   AI FINANCIAL ADVISOR PROXY - VERIFICATION     ");
console.log("=================================================\n");

const results = [];

async function recordTest(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
    console.log(`[PASS] ${name}`);
  } catch (error) {
    results.push({ name, status: "FAIL", error: error.message });
    console.log(`[FAIL] ${name}: ${error.message}`);
  }
}

async function runAllVerifications() {
  // Test 1: CORS Preflight (OPTIONS)
  await recordTest("1. CORS Preflight: OPTIONS request returns 204 with full headers", async () => {
    const req = new Request("https://ai-proxy.workers.dev", { method: "OPTIONS" });
    const res = await worker.fetch(req, {});
    assert.strictEqual(res.status, 204, "Expected status 204");
    assert.strictEqual(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.ok(res.headers.get("Access-Control-Allow-Methods").includes("OPTIONS"));
    assert.ok(res.headers.get("Access-Control-Allow-Methods").includes("POST"));
    assert.ok(res.headers.get("Access-Control-Allow-Headers").includes("Content-Type"));
  });

  // Test 2: Health Check Endpoint
  await recordTest("2. Health Check: GET /health returns 200 and operational status", async () => {
    const req = new Request("https://ai-proxy.workers.dev/health", { method: "GET" });
    const res = await worker.fetch(req, {});
    assert.strictEqual(res.status, 200, "Expected status 200");
    const json = await res.json();
    assert.strictEqual(json.status, "ok");
    assert.strictEqual(json.service, "ai-proxy");
  });

  // Test 3: Disallowed Method Handling (PUT & DELETE)
  await recordTest("3. Method Security: PUT and DELETE are rejected with 405 Method Not Allowed", async () => {
    const putReq = new Request("https://ai-proxy.workers.dev", { method: "PUT" });
    const putRes = await worker.fetch(putReq, {});
    assert.strictEqual(putRes.status, 405, "PUT must return 405");

    const delReq = new Request("https://ai-proxy.workers.dev", { method: "DELETE" });
    const delRes = await worker.fetch(delReq, {});
    assert.strictEqual(delRes.status, 405, "DELETE must return 405");
  });

  // Test 4: Root GET Request Rejection
  await recordTest("4. Method Security: GET on root endpoint returns 405", async () => {
    const req = new Request("https://ai-proxy.workers.dev/", { method: "GET" });
    const res = await worker.fetch(req, {});
    assert.strictEqual(res.status, 405, "Root GET must return 405");
  });

  // Test 5: Error Handling: Missing OPENAI_API_KEY
  await recordTest("5. Security & Error Handling: Missing OPENAI_API_KEY returns 500 without crashing", async () => {
    const req = new Request("https://ai-proxy.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Analyze stock" }] })
    });
    const res = await worker.fetch(req, {}); // Empty env, no secrets
    assert.strictEqual(res.status, 500);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.ok(json.error.includes("Missing OPENAI_API_KEY"));
  });

  // Test 6: Error Handling: Malformed JSON payload
  await recordTest("6. Request Validation: Malformed JSON payload returns 400 Bad Request", async () => {
    const req = new Request("https://ai-proxy.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ unquoted_broken_json: true "
    });
    const res = await worker.fetch(req, { OPENAI_API_KEY: "mock_test_key" });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.error, "Invalid JSON payload.");
  });

  // Test 7: Request Validation: Missing or empty messages array
  await recordTest("7. Schema Validation: Missing or non-array 'messages' returns 400", async () => {
    const req1 = new Request("https://ai-proxy.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const res1 = await worker.fetch(req1, { OPENAI_API_KEY: "mock_test_key" });
    assert.strictEqual(res1.status, 400);

    const req2 = new Request("https://ai-proxy.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] })
    });
    const res2 = await worker.fetch(req2, { OPENAI_API_KEY: "mock_test_key" });
    assert.strictEqual(res2.status, 400);
  });

  // Test 8: Security Audit: No Hardcoded Secrets in Source Files
  await recordTest("8. Static Security Audit: No hardcoded API keys in repository files", async () => {
    const filesToAudit = [
      path.join(projectRoot, "src", "worker.js"),
      path.join(projectRoot, "public", "index.html"),
      path.join(projectRoot, "public", "index.js"),
      path.join(projectRoot, "public", "index.css"),
      path.join(projectRoot, "wrangler.toml"),
      path.join(projectRoot, "package.json")
    ];

    const secretPattern = /sk-[a-zA-Z0-9_-]{20,}/;

    for (const filePath of filesToAudit) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        assert.ok(!secretPattern.test(content), `Found potential hardcoded secret in ${path.basename(filePath)}`);
      }
    }
  });

  // Test 9: Frontend Contract Verification: index.js targets worker proxy and does not import OpenAI directly
  await recordTest("9. Frontend Contract: index.js targets worker proxy without client OpenAI dependency", async () => {
    const indexPath = path.join(projectRoot, "public", "index.js");
    assert.ok(fs.existsSync(indexPath), "public/index.js must exist");
    const content = fs.readFileSync(indexPath, "utf-8");
    assert.ok(!content.includes("from 'openai'"), "Frontend must not import openai");
    assert.ok(!content.includes('from "openai"'), "Frontend must not import openai");
    assert.ok(content.includes("WORKER_PROXY_URL"), "Frontend must define WORKER_PROXY_URL");
    assert.ok(content.includes("fetch("), "Frontend must use native fetch to call worker");
  });

  // Test 10: Configuration Verification: wrangler.toml is valid
  await recordTest("10. Deployment Config: wrangler.toml specifies worker entrypoint and compatibility date", async () => {
    const wranglerPath = path.join(projectRoot, "wrangler.toml");
    assert.ok(fs.existsSync(wranglerPath), "wrangler.toml must exist");
    const content = fs.readFileSync(wranglerPath, "utf-8");
    assert.ok(content.includes('main = "src/worker.js"'), "Must define main entrypoint");
    assert.ok(content.includes("compatibility_date"), "Must define compatibility_date");
  });

  console.log("\n=================================================");
  const passed = results.filter(r => r.status === "PASS").length;
  console.log(`Verification Complete: ${passed} / ${results.length} PASSED`);
  console.log("=================================================");

  if (passed !== results.length) {
    process.exit(1);
  }
}

runAllVerifications();
