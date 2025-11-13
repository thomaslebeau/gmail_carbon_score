// background.ts - Service Worker for the Gmail Carbon Score extension

// Constants for carbon footprint calculation (based on ADEME data)
const CO2_PER_EMAIL_SIMPLE = 4; // grams of CO2
const CO2_PER_EMAIL_WITH_ATTACHMENT = 35; // grams of CO2
const ATTACHMENT_SIZE_THRESHOLD = 100000; // 100KB - threshold to consider a significant attachment
const NUMBER_OF_MAILS_TO_ANALYSE: number | null = null;

// API Configuration
const BATCH_SIZE = 100; // Batch size for Gmail API (max 100)
const PARALLEL_BATCHES = 1; // Number of batches executed in parallel
const MAX_RESULTS_PER_PAGE = 500; // Maximum results per page from Gmail API
const API_REQUEST_DELAY = 100; // Delay between API requests in milliseconds
const RATE_LIMIT_RETRY_DELAY = 2000; // Delay when rate limited in milliseconds
const BATCH_GROUP_DELAY_HIGH = 2000; // Delay for large batches in milliseconds
const BATCH_GROUP_DELAY_LOW = 1500; // Delay for small batches in milliseconds
const BATCH_COUNT_THRESHOLD = 50; // Threshold to determine batch delay

// ============================================
// TYPES
// ============================================

interface GmailMessage {
  id: string;
  threadId?: string;
}

interface GmailMessageDetail {
  id: string;
  sizeEstimate: number;
}

interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

interface AnalysisResults {
  totalEmailsInMailbox: number | null;
  totalEmails: number;
  analyzedEmails: number;
  skippedEmails: number;
  analyzedPercentage: string;
  totalCO2Grams: number;
  totalCO2Kg: string;
  emailsWithAttachments: number;
  emailsSimple: number;
  averageCO2PerEmail: string;
  analyzedDate: string;
  carEquivalentKm: number;
}

interface Statistics {
  totalCO2: number;
  emailsWithAttachments: number;
  emailsSimple: number;
  skippedMessages: number;
}

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Retrieves an authentication token for Gmail API access
 * @returns {Promise<string>} The authentication token
 * @throws {Error} If authentication fails
 */
async function getAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else if (token) {
        resolve(token);
      } else {
        reject(new Error('No token received'));
      }
    });
  });
}

// ============================================
// RETRIEVING MESSAGE LIST
// ============================================

/**
 * Retrieves all messages from Gmail
 * @param {string} token - Authentication token
 * @param {number|null} maxResults - Maximum number of messages to retrieve (null for all)
 * @returns {Promise<Array>} Array of message objects with IDs
 * @throws {Error} If API request fails
 */
async function getAllMessages(token: string, maxResults: number | null = null): Promise<GmailMessage[]> {
  const messages: GmailMessage[] = [];
  let pageToken: string | null = null;
  let pageCount = 0;

  try {
    // If maxResults is null, we fetch ALL messages
    const fetchAll = maxResults === null;

    do {
      const url = new URL(
        "https://www.googleapis.com/gmail/v1/users/me/messages"
      );

      // Calculate how many messages remain to be retrieved
      const remaining = fetchAll ? MAX_RESULTS_PER_PAGE : maxResults - messages.length;
      const pageSize = Math.min(MAX_RESULTS_PER_PAGE, remaining);

      url.searchParams.append("maxResults", pageSize.toString());
      if (pageToken) {
        url.searchParams.append("pageToken", pageToken);
      }

      pageCount++;

      const response = await fetch(url.toString(), {
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
      }

      pageToken = data.nextPageToken || null;

      // Stop if:
      // - Limited mode AND we've reached the max
      // - No more pages available
      if ((!fetchAll && messages.length >= maxResults) || !pageToken) {
        break;
      }

      // Short pause between pages to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, API_REQUEST_DELAY));
    } while (true);

    return fetchAll ? messages : messages.slice(0, maxResults);
  } catch (error) {
    console.error("❌ Error retrieving messages:", error);
    throw error;
  }
}

// ============================================
// BATCH API - FAST RETRIEVAL OF DETAILS
// ============================================

/**
 * Executes a batch request to retrieve message details
 * @param {string} token - Authentication token
 * @param {Array<string>} messageIds - Array of message IDs to fetch
 * @returns {Promise<Array>} Array of message details with size estimates
 * @throws {Error} If batch request fails
 */
async function executeBatchRequest(token: string, messageIds: string[]): Promise<GmailMessageDetail[]> {
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

    if (!response.ok) {
      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY));
        return executeBatchRequest(token, messageIds);
      }

      const errorText = await response.text();
      throw new Error(`Batch failed: ${response.status} - ${errorText}`);
    }

    const responseText = await response.text();

    // Check if response is empty
    if (!responseText || responseText.trim().length === 0) {
      throw new Error("Empty response from Gmail API");
    }

    return parseBatchResponse(responseText);
  } catch (error) {
    console.error("❌ Batch error:", error);
    throw error;
  }
}

/**
 * Parses a batch API response to extract message details
 * @param {string} responseText - Raw response text from batch API
 * @returns {Array} Array of parsed message objects
 */
function parseBatchResponse(responseText: string): GmailMessageDetail[] {
  const results: GmailMessageDetail[] = [];

  try {
    // Gmail returns "response-item" not "item"
    const parts = responseText.split(/Content-ID: <response-item\d+>/);

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];

      try {
        // Ignore 429 errors
        if (part.includes("429 Too Many Requests")) {
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

  return results;
}

/**
 * Retrieves the total number of emails in the mailbox
 * @param {string} token - Authentication token
 * @returns {Promise<number>} Total number of emails
 */
async function getTotalEmailCount(token: string): Promise<number | null> {
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

    const data: GmailProfile = await response.json();
    return data.messagesTotal || 0;
  } catch (error) {
    console.error("❌ Error retrieving total:", error);
    return null;
  }
}

// ============================================
// BATCH PROCESSING WITH PARALLELIZATION
// ============================================

/**
 * Retrieves message details in batches with parallel processing
 * @param {string} token - Authentication token
 * @param {Array<string>} messageIds - Array of message IDs
 * @returns {Promise<Array>} Array of message details
 */
async function getMessageDetailsBatch(token: string, messageIds: string[]): Promise<GmailMessageDetail[]> {
  // Split into batches of BATCH_SIZE (100)
  const batches: string[][] = [];
  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    batches.push(messageIds.slice(i, i + BATCH_SIZE));
  }

  const allDetails: GmailMessageDetail[] = [];
  let processedMessages = 0;

  // Process batches in parallel groups of PARALLEL_BATCHES
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);

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

    // Notify progress - only count successfully processed messages
    chrome.runtime.sendMessage({
      type: "progress",
      processed: allDetails.length, // Use allDetails.length to only count successful 200 responses
      total: messageIds.length,
      percentage: Math.round((allDetails.length / messageIds.length) * 100),
    });

    // Short pause between each group of parallel batches (avoid 429)
    if (i + PARALLEL_BATCHES < batches.length) {
      const pause = batches.length > BATCH_COUNT_THRESHOLD ? BATCH_GROUP_DELAY_HIGH : BATCH_GROUP_DELAY_LOW;
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }

  return allDetails;
}

// ============================================
// CARBON FOOTPRINT CALCULATION
// ============================================

/**
 * Calculates the carbon footprint of an email based on its size
 * @param {number} messageSize - Size of the message in bytes
 * @returns {number} CO2 emissions in grams
 */
function calculateCarbonFootprint(messageSize: number): number {
  if (messageSize > ATTACHMENT_SIZE_THRESHOLD) {
    return CO2_PER_EMAIL_WITH_ATTACHMENT;
  }
  return CO2_PER_EMAIL_SIMPLE;
}

/**
 * Calculates statistics from message details
 * @param {Array} details - Array of message details with size estimates
 * @returns {Object} Statistics including CO2 totals and email counts
 */
function calculateStatistics(details: GmailMessageDetail[]): Statistics {
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

  return {
    totalCO2,
    emailsWithAttachments,
    emailsSimple,
    skippedMessages
  };
}

// ============================================
// MAIN ANALYSIS
// ============================================

/**
 * Analyzes the mailbox and calculates total carbon footprint
 * @returns {Promise<Object>} Analysis results including CO2 totals and statistics
 * @throws {Error} If analysis fails
 */
async function analyzeMailbox(): Promise<AnalysisResults> {
  try {
    const token = await getAuthToken();

    // 1️⃣ Retrieve total number of emails
    const totalInMailbox = await getTotalEmailCount(token);

    // 2️⃣ Decide how many to analyze
    const analyzeAll =
      NUMBER_OF_MAILS_TO_ANALYSE === null ||
      (totalInMailbox !== null && NUMBER_OF_MAILS_TO_ANALYSE >= totalInMailbox);

    // 3️⃣ Retrieve messages
    const messages = await getAllMessages(
      token,
      analyzeAll ? null : NUMBER_OF_MAILS_TO_ANALYSE
    );

    // 4️⃣ Analyze with Batch API
    const messageIds = messages.map((m) => m.id);
    const details = await getMessageDetailsBatch(token, messageIds);

    // 5️⃣ Calculate statistics
    const { totalCO2, emailsWithAttachments, emailsSimple, skippedMessages } =
      calculateStatistics(details);

    const results: AnalysisResults = {
      totalEmailsInMailbox: totalInMailbox,
      totalEmails: messages.length,
      analyzedEmails: details.length,
      skippedEmails: skippedMessages,
      analyzedPercentage: totalInMailbox
        ? ((details.length / totalInMailbox) * 100).toFixed(1)
        : "100",
      totalCO2Grams: Math.round(totalCO2),
      totalCO2Kg: (totalCO2 / 1000).toFixed(2),
      emailsWithAttachments,
      emailsSimple,
      averageCO2PerEmail:
        details.length > 0 ? (totalCO2 / details.length).toFixed(2) : "0",
      analyzedDate: new Date().toISOString(),
      carEquivalentKm: Math.round(totalCO2 / 200),
    };

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
      .catch((error) => sendResponse({ success: false, error: (error as Error).message }));
    return true; // Indicates that we will respond asynchronously
  }

  if (request.action === "getResults") {
    chrome.storage.local.get(["carbonResults"], (result) => {
      sendResponse({ success: true, data: result.carbonResults });
    });
    return true;
  }
});
