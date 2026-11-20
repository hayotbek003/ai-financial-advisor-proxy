// Worker Proxy Endpoint (Can be localhost for wrangler dev or production workers.dev URL)
const WORKER_PROXY_URL = "http://localhost:8787"; // Default wrangler dev port

const stockInput = document.getElementById("stockInput");
const askBtn = document.getElementById("askBtn");
const loader = document.getElementById("loader");
const resultContent = document.getElementById("resultContent");

askBtn.addEventListener("click", async () => {
  const query = stockInput.value.trim();
  if (!query) {
    alert("Please enter a stock ticker or query.");
    return;
  }

  // Set UI Loading State
  askBtn.disabled = true;
  loader.classList.remove("hidden");
  resultContent.textContent = "Connecting to Cloudflare Edge Worker...";

  try {
    /**
     * Updated Client-Side Fetch:
     * Instead of importing OpenAI SDK and exposing OPENAI_API_KEY directly in the browser,
     * the client now dispatches a standard HTTPS POST request to our secure worker proxy.
     */
    const response = await fetch(WORKER_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are an expert financial analyst. Provide a structured, concise assessment with market sentiment and key risks."
          },
          {
            role: "user",
            content: `Analyze the stock/market topic: ${query}`
          }
        ],
        model: "gpt-4",
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();
    resultContent.textContent = result.data.content;

  } catch (error) {
    console.error("Worker Proxy Error:", error);
    resultContent.textContent = `❌ Error: ${error.message}\n\nMake sure the worker proxy is running (e.g., 'npm run dev' or configured with valid OPENAI_API_KEY secret).`;
  } finally {
    askBtn.disabled = false;
    loader.classList.add("hidden");
  }
});
