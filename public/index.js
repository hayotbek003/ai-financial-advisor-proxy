const WORKER_PROXY_URL = "https://ai-financial-advisor-proxy.dostbekovhayotbek20.workers.dev";

const stockInput = document.getElementById("stockInput");
const askBtn = document.getElementById("askBtn");
const loader = document.getElementById("loader");
const resultContent = document.getElementById("resultContent");

const stockCard = document.getElementById("stockCard");
const tickerDisplay = document.getElementById("tickerDisplay");
const closePrice = document.getElementById("closePrice");
const openPrice = document.getElementById("openPrice");
const dayChange = document.getElementById("dayChange");
const tradeVolume = document.getElementById("tradeVolume");

askBtn.addEventListener("click", async () => {
  const ticker = stockInput.value.trim().toUpperCase();
  if (!ticker) {
    alert("Please enter a valid stock ticker symbol (e.g. AAPL, TSLA).");
    return;
  }

  askBtn.disabled = true;
  loader.classList.remove("hidden");
  stockCard.classList.add("hidden");
  resultContent.textContent = "Step 1: Requesting market data from Polygon proxy...";

  try {
    // 1. Fetch market data from Polygon Worker proxy
    let stockData = null;
    try {
      const stockRes = await fetch(`${WORKER_PROXY_URL}/api/stock?ticker=${encodeURIComponent(ticker)}`);
      if (stockRes.ok) {
        const stockJson = await stockRes.json();
        if (stockJson.success && stockJson.data.found) {
          stockData = stockJson.data;
          tickerDisplay.textContent = stockData.ticker;
          closePrice.textContent = `$${stockData.closePrice}`;
          openPrice.textContent = `$${stockData.openPrice}`;
          dayChange.textContent = `${stockData.changePercent}%`;
          dayChange.style.color = parseFloat(stockData.changePercent) >= 0 ? "#4ade80" : "#f87171";
          tradeVolume.textContent = Number(stockData.volume).toLocaleString();
          stockCard.classList.remove("hidden");
        }
      }
    } catch (err) {
      console.warn("Could not fetch stock data via Polygon proxy:", err);
    }

    resultContent.textContent = "Step 2: Generating AI financial analysis via Cloudflare Worker proxy...";

    // 2. Fetch AI analysis from OpenAI Worker proxy
    const contextPrompt = stockData
      ? `Stock ${stockData.ticker} market snapshot: Close: $${stockData.closePrice}, Open: $${stockData.openPrice}, Change: ${stockData.changePercent}%, Volume: ${stockData.volume}. Provide technical and fundamental outlook.`
      : `Provide market outlook and investment analysis for ticker ${ticker}.`;

    const aiRes = await fetch(`${WORKER_PROXY_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are a licensed financial analyst. Deliver concise, actionable market sentiment and risk analysis."
          },
          {
            role: "user",
            content: contextPrompt
          }
        ],
        model: "gpt-4",
        temperature: 0.2
      })
    });

    if (!aiRes.ok) {
      const errJson = await aiRes.json();
      throw new Error(errJson.error || `HTTP error! Status: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    resultContent.textContent = aiData.data.content;

  } catch (error) {
    console.error("Full-Stack Execution Error:", error);
    resultContent.textContent = `❌ Error: ${error.message}\n\nMake sure the Cloudflare Worker is running (e.g. 'npm run dev' or deployed on workers.dev with secrets configured).`;
  } finally {
    askBtn.disabled = false;
    loader.classList.add("hidden");
  }
});
