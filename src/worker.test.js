import worker, { corsHeaders, handleStockDataFetch } from "./worker.js";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

console.log("=================================================");
console.log("   FULL-STACK DEPLOYMENT 02 - TEST SUITE         ");
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
  // 1. CORS Preflight
  await recordTest("1. CORS Preflight: OPTIONS request returns 204 with full headers", async () => {
    const req = new Request("https://ai-proxy.workers.dev", { method: "OPTIONS" });
    const res = await worker.fetch(req, {});
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.ok(res.headers.get("Access-Control-Allow-Methods").includes("GET"));
    assert.ok(res.headers.get("Access-Control-Allow-Methods").includes("POST"));
  });

  // 2. Health check
  await recordTest("2. Health Check: GET /health returns 200 operational", async () => {
    const req = new Request("https://ai-proxy.workers.dev/health", { method: "GET" });
    const res = await worker.fetch(req, {});
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, "ok");
  });

  // 3. Polygon Proxy: missing ticker param
  await recordTest("3. Polygon Proxy: Missing 'ticker' parameter returns 400", async () => {
    const req = new Request("https://ai-proxy.workers.dev/api/stock", { method: "GET" });
    const res = await worker.fetch(req, { POLYGON_API_KEY: "mock_key" });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("parameter 'ticker' is required"));
  });

  // 4. Polygon Proxy: missing POLYGON_API_KEY secret
  await recordTest("4. Polygon Proxy: Missing POLYGON_API_KEY returns 500 without crashing", async () => {
    const req = new Request("https://ai-proxy.workers.dev/api/stock?ticker=AAPL", { method: "GET" });
    const res = await worker.fetch(req, {}); // no env
    assert.strictEqual(res.status, 500);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.ok(json.error.includes("Missing POLYGON_API_KEY"));
  });

  // 5. Polygon Proxy: invalid ticker symbol validation
  await recordTest("5. Polygon Proxy: Invalid ticker characters are rejected", async () => {
    await assert.rejects(async () => {
      await handleStockDataFetch("<script>alert(1)</script>", { POLYGON_API_KEY: "test" });
    }, /Invalid ticker symbol format/);
  });

  // 6. OpenAI Proxy: missing OPENAI_API_KEY
  await recordTest("6. OpenAI Proxy: Missing OPENAI_API_KEY returns 500", async () => {
    const req = new Request("https://ai-proxy.workers.dev/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] })
    });
    const res = await worker.fetch(req, {});
    assert.strictEqual(res.status, 500);
    const json = await res.json();
    assert.ok(json.error.includes("Missing OPENAI_API_KEY"));
  });

  // 7. OpenAI Proxy: invalid JSON body
  await recordTest("7. OpenAI Proxy: Malformed JSON body returns 400", async () => {
    const req = new Request("https://ai-proxy.workers.dev/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "broken_json{"
    });
    const res = await worker.fetch(req, { OPENAI_API_KEY: "mock" });
    assert.strictEqual(res.status, 400);
  });

  // 8. Static Security Audit: No Hardcoded Secrets (OpenAI or Polygon)
  await recordTest("8. Static Security Audit: No exposed secrets in code or configs", async () => {
    const filesToAudit = [
      path.join(projectRoot, "src", "worker.js"),
      path.join(projectRoot, "public", "index.html"),
      path.join(projectRoot, "public", "index.js"),
      path.join(projectRoot, "public", "index.css"),
      path.join(projectRoot, "wrangler.toml"),
      path.join(projectRoot, "package.json")
    ];

    const secretPattern = /(sk-[a-zA-Z0-9_-]{20,}|polygon_[a-zA-Z0-9_]{10,})/i;

    for (const filePath of filesToAudit) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        assert.ok(!secretPattern.test(content), `Found potential hardcoded secret in ${path.basename(filePath)}`);
      }
    }
  });

  // 9. Full-Stack Contract: Frontend points to worker proxy endpoints (/api/stock and /api/chat)
  await recordTest("9. Full-Stack Contract: Client handles both /api/stock and /api/chat", async () => {
    const indexJs = fs.readFileSync(path.join(projectRoot, "public", "index.js"), "utf-8");
    assert.ok(indexJs.includes("/api/stock"), "Client must query /api/stock");
    assert.ok(indexJs.includes("/api/chat"), "Client must query /api/chat");
    assert.ok(!indexJs.includes("from 'openai'"), "Client must not import openai");
  });

  // 10. Cloudflare Pages & Deployment Config
  await recordTest("10. Deployment Config: wrangler.toml is valid for edge deployment", async () => {
    const wrangler = fs.readFileSync(path.join(projectRoot, "wrangler.toml"), "utf-8");
    assert.ok(wrangler.includes('main = "src/worker.js"'));
    assert.ok(wrangler.includes("compatibility_date"));
  });

  console.log("\n=================================================");
  const passed = results.filter(r => r.status === "PASS").length;
  console.log(`Full-Stack Verification Complete: ${passed} / ${results.length} PASSED`);
  console.log("=================================================");

  if (passed !== results.length) {
    process.exit(1);
  }
}

runAllVerifications();
