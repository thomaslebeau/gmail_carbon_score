// popup.ts - Script for the extension's user interface

// Constants for CO2 comparisons
const CO2_PER_KM_CAR = 0.21; // kg CO2 per km by car
const CO2_PER_MEAL = 2; // kg CO2 per meal

// ============================================
// TYPES
// ============================================

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

interface MessageResponse {
  success: boolean;
  data?: AnalysisResults;
  error?: string;
}

interface ProgressMessage {
  type: string;
  processed: number;
  total: number;
  percentage: number;
}

document.addEventListener("DOMContentLoaded", () => {
  const analyzeBtn = document.getElementById("analyzeBtn") as HTMLButtonElement;
  const resultsDiv = document.getElementById("results") as HTMLElement;
  const progressDiv = document.getElementById("progress") as HTMLElement;
  const errorDiv = document.getElementById("error") as HTMLElement;
  const progressFill = document.getElementById("progressFill") as HTMLElement;
  const progressText = document.getElementById("progressText") as HTMLElement;
  const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;

  // Initialize on startup
  displayConnectedAccount();
  loadExistingResults();

  // Event listeners
  analyzeBtn.addEventListener("click", () => {
    startAnalysis();
  });

  logoutBtn.addEventListener("click", () => {
    logout();
  });

  /**
   * Displays the connected Gmail account email
   */
  async function displayConnectedAccount(): Promise<void> {
    try {
      const token = await new Promise<string | null>((resolve) => {
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
          const connectedEmailElement = document.getElementById("connectedEmail");
          if (connectedEmailElement) {
            connectedEmailElement.textContent = email;
          }
        } else {
          // Not connected
          const connectedEmailElement = document.getElementById("connectedEmail");
          if (connectedEmailElement) {
            connectedEmailElement.textContent = "Not connected";
          }
        }
      } else {
        // No token
        const connectedEmailElement = document.getElementById("connectedEmail");
        if (connectedEmailElement) {
          connectedEmailElement.textContent = "Not connected";
        }
      }
    } catch (error) {
      console.error("Error retrieving email:", error);
      const connectedEmailElement = document.getElementById("connectedEmail");
      if (connectedEmailElement) {
        connectedEmailElement.textContent = "Error";
      }
    }
  }

  /**
   * Logs out the user and clears stored data
   */
  async function logout(): Promise<void> {
    if (!confirm("Do you want to log out?")) {
      return;
    }

    try {
      // 1. Retrieve the token
      const token = await new Promise<string | null>((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (t) => {
          resolve(t || null);
        });
      });

      // 2. Remove the token from cache
      if (token) {
        await new Promise<void>((resolve) => {
          chrome.identity.removeCachedAuthToken({ token: token }, () => resolve());
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

  /**
   * Starts the mailbox analysis
   */
  function startAnalysis(): void {
    // Disable the button and show progress
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "⏳ Analysis in progress...";
    progressDiv.classList.add("show");
    resultsDiv.classList.remove("show");
    errorDiv.classList.remove("show");

    // Send the analysis request to the background script
    chrome.runtime.sendMessage({ action: "analyze" }, (response: MessageResponse) => {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "🔍 Analyze my mailbox";
      progressDiv.classList.remove("show");

      if (response.success && response.data) {
        displayResults(response.data);
        // ⚠️ Refresh email after analysis (in case it's the first connection)
        displayConnectedAccount();
      } else {
        showError(response.error || "Unknown error");
      }
    });
  }

  /**
   * Loads and displays existing analysis results from storage
   */
  function loadExistingResults(): void {
    chrome.runtime.sendMessage({ action: "getResults" }, (response: MessageResponse) => {
      if (response.success && response.data) {
        displayResults(response.data);
      }
    });
  }

  /**
   * Displays analysis results in the UI
   * @param {Object} data - Analysis results data
   */
  function displayResults(data: AnalysisResults): void {
    // Display the results section
    resultsDiv.classList.add("show");

    // Fill in the values
    const totalCO2KgElement = document.getElementById("totalCO2Kg");
    if (totalCO2KgElement) totalCO2KgElement.textContent = data.totalCO2Kg;

    const totalCO2GramsElement = document.getElementById("totalCO2Grams");
    if (totalCO2GramsElement) {
      totalCO2GramsElement.textContent = data.totalCO2Grams.toLocaleString("en-US");
    }

    const totalEmailsElement = document.getElementById("totalEmails");
    if (totalEmailsElement) {
      totalEmailsElement.textContent = data.totalEmails.toLocaleString("en-US");
    }

    const avgCO2Element = document.getElementById("avgCO2");
    if (avgCO2Element) avgCO2Element.textContent = data.averageCO2PerEmail;

    const emailsSimpleElement = document.getElementById("emailsSimple");
    if (emailsSimpleElement) {
      emailsSimpleElement.textContent = data.emailsSimple.toLocaleString("en-US");
    }

    const emailsAttachmentsElement = document.getElementById("emailsAttachments");
    if (emailsAttachmentsElement) {
      emailsAttachmentsElement.textContent = data.emailsWithAttachments.toLocaleString("en-US");
    }

    // Comparison calculations
    const totalCO2Kg = parseFloat(data.totalCO2Kg);
    const kmInCar = (totalCO2Kg / CO2_PER_KM_CAR).toFixed(1);
    const meals = (totalCO2Kg / CO2_PER_MEAL).toFixed(1);

    const comparisonKmElement = document.getElementById("comparisonKm");
    if (comparisonKmElement) comparisonKmElement.textContent = kmInCar;

    const comparisonMealsElement = document.getElementById("comparisonMeals");
    if (comparisonMealsElement) comparisonMealsElement.textContent = meals;

    // Last analysis date
    const date = new Date(data.analyzedDate);
    const lastUpdateElement = document.getElementById("lastUpdate");
    if (lastUpdateElement) {
      lastUpdateElement.textContent =
        date.toLocaleDateString("en-US") +
        " at " +
        date.toLocaleTimeString("en-US");
    }
  }

  /**
   * Displays an error message to the user
   * @param {string} message - Error message to display
   */
  function showError(message: string): void {
    errorDiv.classList.add("show");
    const errorTextElement = document.getElementById("errorText");
    if (errorTextElement) {
      errorTextElement.textContent = message;
    }
  }

  // Listen for progress updates
  chrome.runtime.onMessage.addListener((request: ProgressMessage) => {
    if (request.type === "progress") {
      const percent = Math.round((request.processed / request.total) * 100);
      progressFill.style.width = percent + "%";
      progressFill.textContent = percent + "%";
      progressText.textContent = `Analysis in progress... ${request.processed}/${request.total} emails`;
    }
  });
});
