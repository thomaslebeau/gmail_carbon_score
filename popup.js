// popup.js - Script pour l'interface utilisateur de l'extension

document.addEventListener("DOMContentLoaded", () => {
  const analyzeBtn = document.getElementById("analyzeBtn");
  const resultsDiv = document.getElementById("results");
  const progressDiv = document.getElementById("progress");
  const errorDiv = document.getElementById("error");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const logoutBtn = document.getElementById("logoutBtn");

  // ⚠️ APPELER displayConnectedAccount() au démarrage
  displayConnectedAccount();

  // Charger les résultats existants au démarrage
  loadExistingResults();

  // Gérer le clic sur le bouton d'analyse
  analyzeBtn.addEventListener("click", () => {
    startAnalysis();
  });

  logoutBtn.addEventListener("click", () => {
    logout();
  });

  // ⚠️ FONCTION displayConnectedAccount (déplacée ici)
  async function displayConnectedAccount() {
    try {
      const token = await new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          // Ignorer l'erreur et juste retourner null si pas de token
          resolve(token || null);
        });
      });

      if (token) {
        // Récupérer l'email du compte connecté
        const response = await fetch(
          "https://www.googleapis.com/gmail/v1/users/me/profile",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const email = data.emailAddress;

          // Afficher l'email dans le popup
          document.getElementById("connectedEmail").textContent = email;
        } else {
          // Pas connecté
          document.getElementById("connectedEmail").textContent =
            "Non connecté";
        }
      } else {
        // Pas de token
        document.getElementById("connectedEmail").textContent = "Non connecté";
      }
    } catch (error) {
      console.error("Erreur récupération email:", error);
      document.getElementById("connectedEmail").textContent = "Erreur";
    }
  }

  async function logout() {
    if (!confirm("Voulez-vous vous déconnecter ?")) {
      return;
    }

    try {
      // 1. Récupérer le token
      const token = await new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (t) => {
          resolve(t || null);
        });
      });

      // 2. Supprimer le token du cache
      if (token) {
        await new Promise((resolve) => {
          chrome.identity.removeCachedAuthToken({ token: token }, resolve);
        });
      }

      // 3. Effacer toutes les données locales
      await chrome.storage.local.clear();

      // 4. Message
      alert("Déconnexion réussie !\n\nVous pourrez choisir un autre compte.");

      // 5. Fermer le popup
      window.close();
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur. Fermez l'extension et réessayez.");
    }
  }

  // Fonction pour démarrer l'analyse
  function startAnalysis() {
    // Désactiver le bouton et afficher la progression
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "⏳ Analyse en cours...";
    progressDiv.classList.add("show");
    resultsDiv.classList.remove("show");
    errorDiv.classList.remove("show");

    // Envoyer la demande d'analyse au background script
    chrome.runtime.sendMessage({ action: "analyze" }, (response) => {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "🔍 Analyser ma boîte mail";
      progressDiv.classList.remove("show");

      if (response.success) {
        displayResults(response.data);
        // ⚠️ Rafraîchir l'email après analyse (au cas où c'est la première connexion)
        displayConnectedAccount();
      } else {
        showError(response.error);
      }
    });
  }

  // Fonction pour charger les résultats existants
  function loadExistingResults() {
    chrome.runtime.sendMessage({ action: "getResults" }, (response) => {
      if (response.success && response.data) {
        displayResults(response.data);
      }
    });
  }

  // Fonction pour afficher les résultats
  function displayResults(data) {
    // Afficher la section des résultats
    resultsDiv.classList.add("show");

    // Remplir les valeurs
    document.getElementById("totalCO2Kg").textContent = data.totalCO2Kg;
    document.getElementById("totalCO2Grams").textContent =
      data.totalCO2Grams.toLocaleString("fr-FR");
    document.getElementById("totalEmails").textContent =
      data.totalEmails.toLocaleString("fr-FR");
    document.getElementById("avgCO2").textContent = data.averageCO2PerEmail;
    document.getElementById("emailsSimple").textContent =
      data.emailsSimple.toLocaleString("fr-FR");
    document.getElementById("emailsAttachments").textContent =
      data.emailsWithAttachments.toLocaleString("fr-FR");

    // Calculs de comparaison
    const totalCO2Kg = parseFloat(data.totalCO2Kg);
    const kmInCar = (totalCO2Kg / 0.21).toFixed(1); // 210g CO2 par km en voiture
    const meals = (totalCO2Kg / 2).toFixed(1); // 2kg CO2 par repas

    document.getElementById("comparisonKm").textContent = kmInCar;
    document.getElementById("comparisonMeals").textContent = meals;

    // Date de dernière analyse
    const date = new Date(data.analyzedDate);
    document.getElementById("lastUpdate").textContent =
      date.toLocaleDateString("fr-FR") +
      " à " +
      date.toLocaleTimeString("fr-FR");
  }

  // Fonction pour afficher une erreur
  function showError(message) {
    errorDiv.classList.add("show");
    document.getElementById("errorText").textContent = message;
  }

  // Écouter les mises à jour de progression
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "progress") {
      const percent = Math.round((request.processed / request.total) * 100);
      progressFill.style.width = percent + "%";
      progressFill.textContent = percent + "%";
      progressText.textContent = `Analyse en cours... ${request.processed}/${request.total} emails`;
    }
  });
});
