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

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight (OPTIONS request)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Health check endpoint
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "ai-proxy" }), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // Only allow POST requests for AI completions
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    try {
      // Validate OpenAI API Key presence in environment
      if (!env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY secret in environment configuration.");
      }

      // Parse and validate incoming JSON body
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

      // Initialize OpenAI client with optional Cloudflare AI Gateway URL
      const clientConfig = {
        apiKey: env.OPENAI_API_KEY
      };

      if (env.AI_GATEWAY_URL) {
        clientConfig.baseURL = env.AI_GATEWAY_URL;
      }

      const openai = new OpenAI(clientConfig);

      // Perform Chat Completion call to OpenAI
      const completion = await openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens
      });

      // Return AI response to client
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
      // Robust error handling without exposing internal stack traces or secrets
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
};
