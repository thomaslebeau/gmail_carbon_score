// popup.js - Script for the extension's user interface

document.addEventListener("DOMContentLoaded", () => {
  const analyzeBtn = document.getElementById("analyzeBtn");
  const resultsDiv = document.getElementById("results");
  const progressDiv = document.getElementById("progress");
  const errorDiv = document.getElementById("error");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const logoutBtn = document.getElementById("logoutBtn");

  // ⚠️ CALL displayConnectedAccount() on startup
  displayConnectedAccount();

  // Load existing results on startup
  loadExistingResults();

  // Handle click on the analyze button
  analyzeBtn.addEventListener("click", () => {
    startAnalysis();
  });

  logoutBtn.addEventListener("click", () => {
    logout();
  });

  // ⚠️ FUNCTION displayConnectedAccount (moved here)
  async function displayConnectedAccount() {
    try {
      const token = await new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          // Ignore error and just return null if no token
          resolve(token || null);
        });
      });

      if (token) {
        // Retrieve the email of the connected account
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

          // Display the email in the popup
          document.getElementById("connectedEmail").textContent = email;
        } else {
          // Not connected
          document.getElementById("connectedEmail").textContent =
            "Not connected";
        }
      } else {
        // No token
        document.getElementById("connectedEmail").textContent = "Not connected";
      }
    } catch (error) {
      console.error("Error retrieving email:", error);
      document.getElementById("connectedEmail").textContent = "Error";
    }
  }

  async function logout() {
    if (!confirm("Do you want to log out?")) {
      return;
    }

    try {
      // 1. Retrieve the token
      const token = await new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (t) => {
          resolve(t || null);
        });
      });

      // 2. Remove the token from cache
      if (token) {
        await new Promise((resolve) => {
          chrome.identity.removeCachedAuthToken({ token: token }, resolve);
        });
      }

      // 3. Clear all local data
      await chrome.storage.local.clear();

      // 4. Message
      alert("Logout successful!\n\nYou can choose another account.");

      // 5. Close the popup
      window.close();
    } catch (error) {
      console.error("Error:", error);
      alert("Error. Close the extension and try again.");
    }
  }

  // Function to start the analysis
  function startAnalysis() {
    // Disable the button and show progress
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "⏳ Analysis in progress...";
    progressDiv.classList.add("show");
    resultsDiv.classList.remove("show");
    errorDiv.classList.remove("show");

    // Send the analysis request to the background script
    chrome.runtime.sendMessage({ action: "analyze" }, (response) => {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "🔍 Analyze my mailbox";
      progressDiv.classList.remove("show");

      if (response.success) {
        displayResults(response.data);
        // ⚠️ Refresh email after analysis (in case it's the first connection)
        displayConnectedAccount();
      } else {
        showError(response.error);
      }
    });
  }

  // Function to load existing results
  function loadExistingResults() {
    chrome.runtime.sendMessage({ action: "getResults" }, (response) => {
      if (response.success && response.data) {
        displayResults(response.data);
      }
    });
  }

  // Function to display results
  function displayResults(data) {
    // Display the results section
    resultsDiv.classList.add("show");

    // Fill in the values
    document.getElementById("totalCO2Kg").textContent = data.totalCO2Kg;
    document.getElementById("totalCO2Grams").textContent =
      data.totalCO2Grams.toLocaleString("en-US");
    document.getElementById("totalEmails").textContent =
      data.totalEmails.toLocaleString("en-US");
    document.getElementById("avgCO2").textContent = data.averageCO2PerEmail;
    document.getElementById("emailsSimple").textContent =
      data.emailsSimple.toLocaleString("en-US");
    document.getElementById("emailsAttachments").textContent =
      data.emailsWithAttachments.toLocaleString("en-US");

    // Comparison calculations
    const totalCO2Kg = parseFloat(data.totalCO2Kg);
    const kmInCar = (totalCO2Kg / 0.21).toFixed(1); // 210g CO2 per km by car
    const meals = (totalCO2Kg / 2).toFixed(1); // 2kg CO2 per meal

    document.getElementById("comparisonKm").textContent = kmInCar;
    document.getElementById("comparisonMeals").textContent = meals;

    // Last analysis date
    const date = new Date(data.analyzedDate);
    document.getElementById("lastUpdate").textContent =
      date.toLocaleDateString("en-US") +
      " at " +
      date.toLocaleTimeString("en-US");
  }

  // Function to display an error
  function showError(message) {
    errorDiv.classList.add("show");
    document.getElementById("errorText").textContent = message;
  }

  // Listen for progress updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "progress") {
      const percent = Math.round((request.processed / request.total) * 100);
      progressFill.style.width = percent + "%";
      progressFill.textContent = percent + "%";
      progressText.textContent = `Analysis in progress... ${request.processed}/${request.total} emails`;
    }
  });
});
