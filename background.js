// background.js - Service Worker for the Gmail Carbon Score extension

// Constants for carbon footprint calculation (based on ADEME data)
const CO2_PER_EMAIL_SIMPLE = 4; // grams of CO2
const CO2_PER_EMAIL_WITH_ATTACHMENT = 35; // grams of CO2
const ATTACHMENT_SIZE_THRESHOLD = 100000; // 100KB - threshold to consider a significant attachment
const NUMBER_OF_MAILS_TO_ANALYSE = null;
const BATCH_SIZE = 100; // Batch size for Gmail API (max 100)
const PARALLEL_BATCHES = 1; // Number of batches executed in parallel
console.log("test");

// ============================================
// AUTHENTICATION
// ============================================

async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

// ============================================
// RETRIEVING MESSAGE LIST
// ============================================

async function getAllMessages(token, maxResults = null) {
  const messages = [];
  let pageToken = null;
  let pageCount = 0;

  try {
    // If maxResults is null, we fetch ALL messages
    const fetchAll = maxResults === null;

    console.log(
      fetchAll
        ? "🔍 Retrieving ALL messages..."
        : `🔍 Retrieving up to ${maxResults} messages...`
    );

    do {
      const url = new URL(
        "https://www.googleapis.com/gmail/v1/users/me/messages"
      );

      // Calculate how many messages remain to be retrieved
      const remaining = fetchAll ? 500 : maxResults - messages.length;
      const pageSize = Math.min(500, remaining);

      url.searchParams.append("maxResults", pageSize.toString());
      if (pageToken) {
        url.searchParams.append("pageToken", pageToken);
      }

      pageCount++;
      console.log(
        `📄 Page ${pageCount} (${messages.length} messages so far)...`
      );

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.messages) {
        messages.push(...data.messages);
        console.log(`   ✅ ${messages.length} messages retrieved`);
      }

      pageToken = data.nextPageToken;

      // Stop if:
      // - Limited mode AND we've reached the max
      // - No more pages available
      if ((!fetchAll && messages.length >= maxResults) || !pageToken) {
        break;
      }

      // Short pause between pages to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (true);

    console.log(`🎯 Total: ${messages.length} messages retrieved`);

    return fetchAll ? messages : messages.slice(0, maxResults);
  } catch (error) {
    console.error("❌ Error retrieving messages:", error);
    throw error;
  }
}

// ============================================
// BATCH API - FAST RETRIEVAL OF DETAILS
// ============================================

async function executeBatchRequest(token, messageIds) {
  const boundary = "batch_boundary_" + Date.now();

  let batchBody = "";

  messageIds.forEach((id, index) => {
    batchBody += `--${boundary}\r\n`;
    batchBody += `Content-Type: application/http\r\n`;
    batchBody += `Content-ID: <item${index}>\r\n\r\n`;
    batchBody += `GET /gmail/v1/users/me/messages/${id}?format=metadata\r\n\r\n`;
  });

  batchBody += `--${boundary}--`;

  try {
    console.log(`   🔧 Sending batch of ${messageIds.length} messages...`);

    const response = await fetch(
      "https://gmail.googleapis.com/batch/gmail/v1",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/mixed; boundary=${boundary}`,
        },
        body: batchBody,
      }
    );

    console.log(`   📡 Response status: ${response.status}`);
    console.log(`   📡 Response headers:`, [...response.headers.entries()]);

    if (!response.ok) {
      if (response.status === 429) {
        console.log("⚠️ Rate limit, waiting 2s...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return executeBatchRequest(token, messageIds);
      }

      const errorText = await response.text();
      console.error("❌ Response error body:", errorText);
      throw new Error(`Batch failed: ${response.status}`);
    }

    const responseText = await response.text();

    // ⚠️ CRITICAL DEBUG
    console.log(`   📊 Response length: ${responseText.length} chars`);
    console.log(`   📄 First 500 chars:`, responseText.substring(0, 500));
    console.log(
      `   📄 Last 500 chars:`,
      responseText.substring(responseText.length - 500)
    );

    // Check if response is empty
    if (!responseText || responseText.trim().length === 0) {
      console.error("❌ EMPTY RESPONSE!");
      return [];
    }

    return parseBatchResponse(responseText);
  } catch (error) {
    console.error("❌ Batch error:", error);
    throw error;
  }
}

function parseBatchResponse(responseText) {
  const results = [];

  try {
    // ⚠️ FIX: Gmail returns "response-item" not "item"
    const parts = responseText.split(/Content-ID: <response-item\d+>/);

    console.log(`   📦 ${parts.length - 1} parts detected`);

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];

      try {
        // Ignore 429 errors
        if (part.includes("429 Too Many Requests")) {
          console.warn("   ⚠️ Part with 429 error ignored");
          continue;
        }

        // Search for JSON with sizeEstimate
        const jsonMatch = part.match(/\{[\s\S]*?"sizeEstimate"[\s\S]*?\}/);

        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);

          if (data.id && typeof data.sizeEstimate === "number") {
            results.push(data);
          }
        }
      } catch (e) {
        // Continue silently
        continue;
      }
    }
  } catch (e) {
    console.error("❌ Global parsing error:", e);
  }

  console.log(`   ✅ ${results.length} messages parsed`);

  return results;
}

async function getTotalEmailCount(token) {
  try {
    const response = await fetch(
      "https://www.googleapis.com/gmail/v1/users/me/profile",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.messagesTotal || 0;
  } catch (error) {
    console.error("❌ Error retrieving total:", error);
    return null;
  }
}

// ============================================
// BATCH PROCESSING WITH PARALLELIZATION
// ============================================

async function getMessageDetailsBatch(token, messageIds) {
  // Split into batches of BATCH_SIZE (100)
  const batches = [];
  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    batches.push(messageIds.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `📦 ${messageIds.length} messages to analyze in ${batches.length} batches`
  );

  const allDetails = [];
  let processedMessages = 0;

  // Process batches in parallel groups of PARALLEL_BATCHES
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);

    console.log(
      `🔄 Processing group ${
        Math.floor(i / PARALLEL_BATCHES) + 1
      }/${Math.ceil(batches.length / PARALLEL_BATCHES)}`
    );

    const messagesInGroup = parallelBatches.reduce(
      (sum, batch) => sum + batch.length,
      0
    );

    // Execute PARALLEL_BATCHES at the same time
    const batchPromises = parallelBatches.map((batch) =>
      executeBatchRequest(token, batch)
    );

    const results = await Promise.all(batchPromises);

    // Flatten the results
    results.forEach((batchResult) => {
      allDetails.push(...batchResult);
    });

    processedMessages += messagesInGroup;

    // Notify progress
    chrome.runtime.sendMessage({
      type: "progress",
      processed: processedMessages, // ⚠️ Use processedMessages instead of allDetails.length
      total: messageIds.length,
      percentage: Math.round((processedMessages / messageIds.length) * 100),
    });

    // Short pause between each group of parallel batches (avoid 429)
    if (i + PARALLEL_BATCHES < batches.length) {
      const pause = batches.length > 50 ? 2000 : 1500;
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }

  console.log(
    `✅ ${allDetails.length} messages analyzed out of ${messageIds.length} requested`
  );

  return allDetails;
}

// ============================================
// CARBON FOOTPRINT CALCULATION
// ============================================

function calculateCarbonFootprint(messageSize) {
  if (messageSize > ATTACHMENT_SIZE_THRESHOLD) {
    return CO2_PER_EMAIL_WITH_ATTACHMENT;
  }
  return CO2_PER_EMAIL_SIMPLE;
}

// ============================================
// MAIN ANALYSIS
// ============================================

async function analyzeMailbox() {
  try {
    const token = await getAuthToken();

    // 1️⃣ Retrieve total number of emails
    console.log("📬 Retrieving total number of emails...");
    const totalInMailbox = await getTotalEmailCount(token);
    console.log(`✅ ${totalInMailbox} emails total in mailbox`);

    // 2️⃣ Decide how many to analyze
    const analyzeAll =
      NUMBER_OF_MAILS_TO_ANALYSE === null ||
      NUMBER_OF_MAILS_TO_ANALYSE >= totalInMailbox;

    if (analyzeAll) {
      console.log("📧 Analyzing ALL emails...");
    } else {
      console.log(
        `📧 Analyzing the last ${NUMBER_OF_MAILS_TO_ANALYSE} emails...`
      );
    }

    // 3️⃣ Retrieve messages
    const messages = await getAllMessages(
      token,
      analyzeAll ? null : NUMBER_OF_MAILS_TO_ANALYSE
    );

    console.log(`🔍 Detailed analysis of ${messages.length} messages...`);

    // 4️⃣ Analyze with Batch API
    const messageIds = messages.map((m) => m.id);
    const details = await getMessageDetailsBatch(token, messageIds);

    // 5️⃣ Calculate statistics
    let totalCO2 = 0;
    let emailsWithAttachments = 0;
    let emailsSimple = 0;
    let skippedMessages = 0;

    details.forEach((detail) => {
      if (detail && typeof detail.sizeEstimate === "number") {
        const co2 = calculateCarbonFootprint(detail.sizeEstimate);
        totalCO2 += co2;

        if (detail.sizeEstimate > ATTACHMENT_SIZE_THRESHOLD) {
          emailsWithAttachments++;
        } else {
          emailsSimple++;
        }
      } else {
        skippedMessages++;
      }
    });

    console.log(
      skippedMessages > 0
        ? `⚠️ ${skippedMessages} messages skipped`
        : "✅ All messages analyzed"
    );

    const results = {
      totalEmailsInMailbox: totalInMailbox,
      totalEmails: messages.length,
      analyzedEmails: details.length,
      skippedEmails: skippedMessages,
      analyzedPercentage: totalInMailbox
        ? ((details.length / totalInMailbox) * 100).toFixed(1)
        : 100,
      totalCO2Grams: Math.round(totalCO2),
      totalCO2Kg: (totalCO2 / 1000).toFixed(2),
      emailsWithAttachments,
      emailsSimple,
      averageCO2PerEmail:
        details.length > 0 ? (totalCO2 / details.length).toFixed(2) : 0,
      analyzedDate: new Date().toISOString(),
      carEquivalentKm: Math.round(totalCO2 / 200),
    };

    console.log("📊 Results:", results);

    await chrome.storage.local.set({ carbonResults: results });

    chrome.runtime.sendMessage({
      type: "complete",
      data: results,
    });

    return results;
  } catch (error) {
    console.error("❌ Analysis error:", error);
    throw error;
  }
}

// ============================================
// MESSAGE LISTENERS
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyze") {
    analyzeMailbox()
      .then((results) => sendResponse({ success: true, data: results }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Indicates that we will respond asynchronously
  }

  if (request.action === "getResults") {
    chrome.storage.local.get(["carbonResults"], (result) => {
      sendResponse({ success: true, data: result.carbonResults });
    });
    return true;
  }
});

console.log("🌱 Gmail Carbon Score extension loaded");
