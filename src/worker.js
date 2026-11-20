import OpenAI from "openai";

/**
 * Standard CORS headers allowing client-side applications
 * to safely communicate with this edge proxy.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

/**
 * Helper to fetch and aggregate stock market data from Polygon.io
 * securely on the server without exposing POLYGON_API_KEY to the browser.
 */
export async function handleStockDataFetch(ticker, env) {
  if (!env.POLYGON_API_KEY) {
    throw new Error("Missing POLYGON_API_KEY secret in environment configuration.");
  }

  const cleanTicker = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,10}$/.test(cleanTicker)) {
    throw new Error("Invalid ticker symbol format.");
  }

  // Fetch previous day's close and aggregate statistics
  const polygonUrl = `https://api.polygon.io/v2/aggs/ticker/${cleanTicker}/prev?adjusted=true&apiKey=${env.POLYGON_API_KEY}`;
  
  let response;
  try {
    response = await fetch(polygonUrl);
  } catch (err) {
    throw new Error(`Failed to connect to Polygon.io: ${err.message}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polygon API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    return {
      ticker: cleanTicker,
      message: "No trading results found for this ticker.",
      found: false
    };
  }

  const result = data.results[0];
  return {
    ticker: cleanTicker,
    found: true,
    closePrice: result.c,
    openPrice: result.o,
    highPrice: result.h,
    lowPrice: result.l,
    volume: result.v,
    timestamp: result.t,
    changePercent: (((result.c - result.o) / result.o) * 100).toFixed(2)
  };
}

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight (OPTIONS request)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);

    // 2. Health check endpoint
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "ai-proxy" }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // 3. Polygon Stock Market Data Proxy (GET /api/stock?ticker=AAPL)
    if (request.method === "GET" && url.pathname === "/api/stock") {
      const ticker = url.searchParams.get("ticker");
      if (!ticker) {
        return new Response(JSON.stringify({ error: "Query parameter 'ticker' is required." }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      try {
        const stockData = await handleStockDataFetch(ticker, env);
        return new Response(JSON.stringify({ success: true, data: stockData }), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    }

    // 4. OpenAI Chat Completions Proxy (POST / or POST /api/chat)
    if (request.method === "POST" && (url.pathname === "/" || url.pathname === "/api/chat")) {
      try {
        if (!env.OPENAI_API_KEY) {
          throw new Error("Missing OPENAI_API_KEY secret in environment configuration.");
        }

        let body;
        try {
          body = await request.json();
        } catch (err) {
          return new Response(JSON.stringify({ error: "Invalid JSON payload." }), {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }

        const { messages, model = "gpt-4", temperature = 0.2, max_tokens = 500 } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
          return new Response(JSON.stringify({ error: "Field 'messages' must be a non-empty array." }), {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json"
            }
          });
        }

        const clientConfig = { apiKey: env.OPENAI_API_KEY };
        if (env.AI_GATEWAY_URL) {
          clientConfig.baseURL = env.AI_GATEWAY_URL;
        }

        const openai = new OpenAI(clientConfig);

        const completion = await openai.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens
        });

        return new Response(JSON.stringify({
          success: true,
          data: completion.choices[0].message,
          usage: completion.usage
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message || "An unexpected error occurred while processing the AI request."
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
    }

    // Default 405 for unrecognized paths/methods
    return new Response(JSON.stringify({ error: "Endpoint or method not allowed." }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
};
