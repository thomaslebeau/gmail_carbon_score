// background.js - Service Worker pour l'extension Gmail Carbon Score

// Constantes pour le calcul de l'empreinte carbone (basées sur les données ADEME)
const CO2_PER_EMAIL_SIMPLE = 4; // grammes de CO2
const CO2_PER_EMAIL_WITH_ATTACHMENT = 35; // grammes de CO2
const ATTACHMENT_SIZE_THRESHOLD = 100000; // 100KB - seuil pour considérer qu'il y a une pièce jointe significative
const NUMBER_OF_MAILS_TO_ANALYSE = null;
const BATCH_SIZE = 100; // Taille d'un batch pour l'API Gmail (max 100)
const PARALLEL_BATCHES = 1; // Nombre de batchs exécutés en parallèle
console.log("test");

// ============================================
// AUTHENTIFICATION
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
// RÉCUPÉRATION DE LA LISTE DES MESSAGES
// ============================================

async function getAllMessages(token, maxResults = null) {
  const messages = [];
  let pageToken = null;
  let pageCount = 0;

  try {
    // Si maxResults est null, on récupère TOUT
    const fetchAll = maxResults === null;

    console.log(
      fetchAll
        ? "🔍 Récupération de TOUS les messages..."
        : `🔍 Récupération jusqu'à ${maxResults} messages...`
    );

    do {
      const url = new URL(
        "https://www.googleapis.com/gmail/v1/users/me/messages"
      );

      // Calculer combien de messages il reste à récupérer
      const remaining = fetchAll ? 500 : maxResults - messages.length;
      const pageSize = Math.min(500, remaining);

      url.searchParams.append("maxResults", pageSize.toString());
      if (pageToken) {
        url.searchParams.append("pageToken", pageToken);
      }

      pageCount++;
      console.log(
        `📄 Page ${pageCount} (${messages.length} messages jusqu'ici)...`
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
        console.log(`   ✅ ${messages.length} messages récupérés`);
      }

      pageToken = data.nextPageToken;

      // Arrêter si :
      // - Mode limité ET on a atteint le max
      // - Plus de pages disponibles
      if ((!fetchAll && messages.length >= maxResults) || !pageToken) {
        break;
      }

      // Petite pause entre les pages pour éviter les rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (true);

    console.log(`🎯 Total: ${messages.length} messages récupérés`);

    return fetchAll ? messages : messages.slice(0, maxResults);
  } catch (error) {
    console.error("❌ Erreur récupération messages:", error);
    throw error;
  }
}

// ============================================
// BATCH API - RÉCUPÉRATION RAPIDE DES DÉTAILS
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
    console.log(`   🔧 Envoi batch de ${messageIds.length} messages...`);

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
        console.log("⚠️ Rate limit, attente 2s...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return executeBatchRequest(token, messageIds);
      }

      const errorText = await response.text();
      console.error("❌ Response error body:", errorText);
      throw new Error(`Batch failed: ${response.status}`);
    }

    const responseText = await response.text();

    // ⚠️ DEBUG CRITIQUE
    console.log(`   📊 Response length: ${responseText.length} chars`);
    console.log(`   📄 First 500 chars:`, responseText.substring(0, 500));
    console.log(
      `   📄 Last 500 chars:`,
      responseText.substring(responseText.length - 500)
    );

    // Vérifier si la réponse est vide
    if (!responseText || responseText.trim().length === 0) {
      console.error("❌ RÉPONSE VIDE !");
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
    // ⚠️ FIX : Gmail renvoie "response-item" pas "item"
    const parts = responseText.split(/Content-ID: <response-item\d+>/);

    console.log(`   📦 ${parts.length - 1} parties détectées`);

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];

      try {
        // Ignorer les erreurs 429
        if (part.includes("429 Too Many Requests")) {
          console.warn("   ⚠️ Partie avec erreur 429 ignorée");
          continue;
        }

        // Chercher le JSON avec sizeEstimate
        const jsonMatch = part.match(/\{[\s\S]*?"sizeEstimate"[\s\S]*?\}/);

        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);

          if (data.id && typeof data.sizeEstimate === "number") {
            results.push(data);
          }
        }
      } catch (e) {
        // Continuer silencieusement
        continue;
      }
    }
  } catch (e) {
    console.error("❌ Erreur parsing global:", e);
  }

  console.log(`   ✅ ${results.length} messages parsés`);

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
    console.error("❌ Erreur récupération du total:", error);
    return null;
  }
}

// ============================================
// TRAITEMENT PAR BATCH AVEC PARALLÉLISATION
// ============================================

async function getMessageDetailsBatch(token, messageIds) {
  // Découper en batchs de BATCH_SIZE (100)
  const batches = [];
  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    batches.push(messageIds.slice(i, i + BATCH_SIZE));
  }

  console.log(
    `📦 ${messageIds.length} messages à analyser en ${batches.length} batchs`
  );

  const allDetails = [];
  let processedMessages = 0;

  // Traiter les batchs par groupes parallèles de PARALLEL_BATCHES
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);

    console.log(
      `🔄 Traitement du groupe ${
        Math.floor(i / PARALLEL_BATCHES) + 1
      }/${Math.ceil(batches.length / PARALLEL_BATCHES)}`
    );

    const messagesInGroup = parallelBatches.reduce(
      (sum, batch) => sum + batch.length,
      0
    );

    // Exécuter PARALLEL_BATCHES en même temps
    const batchPromises = parallelBatches.map((batch) =>
      executeBatchRequest(token, batch)
    );

    const results = await Promise.all(batchPromises);

    // Aplatir les résultats
    results.forEach((batchResult) => {
      allDetails.push(...batchResult);
    });

    processedMessages += messagesInGroup;

    // Notifier la progression
    chrome.runtime.sendMessage({
      type: "progress",
      processed: processedMessages, // ⚠️ Utiliser processedMessages au lieu de allDetails.length
      total: messageIds.length,
      percentage: Math.round((processedMessages / messageIds.length) * 100),
    });

    // Petite pause entre chaque groupe de batchs parallèles (éviter 429)
    if (i + PARALLEL_BATCHES < batches.length) {
      const pause = batches.length > 50 ? 2000 : 1500;
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }

  console.log(
    `✅ ${allDetails.length} messages analysés sur ${messageIds.length} demandés`
  );

  return allDetails;
}

// ============================================
// CALCUL DE L'EMPREINTE CARBONE
// ============================================

function calculateCarbonFootprint(messageSize) {
  if (messageSize > ATTACHMENT_SIZE_THRESHOLD) {
    return CO2_PER_EMAIL_WITH_ATTACHMENT;
  }
  return CO2_PER_EMAIL_SIMPLE;
}

// ============================================
// ANALYSE PRINCIPALE
// ============================================

async function analyzeMailbox() {
  try {
    const token = await getAuthToken();

    // 1️⃣ Récupérer le nombre total d'emails
    console.log("📬 Récupération du nombre total d'emails...");
    const totalInMailbox = await getTotalEmailCount(token);
    console.log(`✅ ${totalInMailbox} emails au total dans la boîte mail`);

    // 2️⃣ Décider combien analyser
    const analyzeAll =
      NUMBER_OF_MAILS_TO_ANALYSE === null ||
      NUMBER_OF_MAILS_TO_ANALYSE >= totalInMailbox;

    if (analyzeAll) {
      console.log("📧 Analyse de TOUS les emails...");
    } else {
      console.log(
        `📧 Analyse des ${NUMBER_OF_MAILS_TO_ANALYSE} derniers emails...`
      );
    }

    // 3️⃣ Récupérer les messages
    const messages = await getAllMessages(
      token,
      analyzeAll ? null : NUMBER_OF_MAILS_TO_ANALYSE
    );

    console.log(`🔍 Analyse détaillée de ${messages.length} messages...`);

    // 4️⃣ Analyser avec Batch API
    const messageIds = messages.map((m) => m.id);
    const details = await getMessageDetailsBatch(token, messageIds);

    // 5️⃣ Calculer les statistiques
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
        ? `⚠️ ${skippedMessages} messages ignorés`
        : "✅ Tous les messages analysés"
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

    console.log("📊 Résultats:", results);

    await chrome.storage.local.set({ carbonResults: results });

    chrome.runtime.sendMessage({
      type: "complete",
      data: results,
    });

    return results;
  } catch (error) {
    console.error("❌ Erreur analyse:", error);
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
    return true; // Indique qu'on va répondre de manière asynchrone
  }

  if (request.action === "getResults") {
    chrome.storage.local.get(["carbonResults"], (result) => {
      sendResponse({ success: true, data: result.carbonResults });
    });
    return true;
  }
});

console.log("🌱 Gmail Carbon Score extension loaded");
