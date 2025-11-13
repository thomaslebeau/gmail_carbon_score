// content.ts - Script injected into Gmail to display carbon score

(function() {
  'use strict';

  // Constants
  const GMAIL_CHECK_INTERVAL = 1000; // Interval to check if Gmail is loaded (ms)
  const GMAIL_LOAD_TIMEOUT = 30000; // Max time to wait for Gmail to load (ms)

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
  }

  /**
   * Creates the carbon score widget DOM element
   * @returns {HTMLElement} The widget element
   */
  function createCarbonWidget(): HTMLElement {
    const widget = document.createElement('div');
    widget.id = 'gmail-carbon-widget';
    widget.innerHTML = `
      <div class="carbon-widget-header">
        <span class="carbon-icon">🌱</span>
        <span class="carbon-title">Score Carbone</span>
      </div>
      <div class="carbon-widget-content">
        <div class="carbon-loading">
          Loading...
        </div>
        <div class="carbon-results" style="display: none;">
          <div class="carbon-main-score">
            <span class="carbon-value">0</span>
            <span class="carbon-unit">kg CO₂</span>
          </div>
          <div class="carbon-details">
            <span class="carbon-email-count">0 emails</span>
          </div>
          <button class="carbon-refresh-btn">🔄 Actualiser</button>
        </div>
      </div>
    `;

    return widget;
  }

  /**
   * Injects the carbon widget into the Gmail interface
   */
  function injectWidget(): void {
    // Wait for Gmail to be loaded
    const checkGmailLoaded = setInterval(() => {
      const gmailSidebar = document.querySelector('[role="navigation"]');

      if (gmailSidebar && !document.getElementById('gmail-carbon-widget')) {
        const widget = createCarbonWidget();
        gmailSidebar.parentElement?.insertBefore(widget, gmailSidebar.nextSibling);

        // Load the results
        loadCarbonScore();

        // Handle click on the refresh button
        const refreshBtn = widget.querySelector('.carbon-refresh-btn') as HTMLButtonElement;
        if (refreshBtn) {
          refreshBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'analyze' }, (response: MessageResponse) => {
              if (response.success && response.data) {
                updateWidget(response.data);
              }
            });
          });
        }

        clearInterval(checkGmailLoaded);
      }
    }, GMAIL_CHECK_INTERVAL);

    // Stop after timeout
    setTimeout(() => clearInterval(checkGmailLoaded), GMAIL_LOAD_TIMEOUT);
  }

  /**
   * Loads carbon score data from storage
   */
  function loadCarbonScore(): void {
    chrome.runtime.sendMessage({ action: 'getResults' }, (response: MessageResponse) => {
      if (response.success && response.data) {
        updateWidget(response.data);
      } else {
        const widget = document.getElementById('gmail-carbon-widget');
        if (widget) {
          const loading = widget.querySelector('.carbon-loading');
          if (loading) {
            loading.textContent = 'Click on the extension to analyze';
          }
        }
      }
    });
  }

  /**
   * Updates the widget with carbon score data
   * @param {Object} data - Carbon score analysis results
   */
  function updateWidget(data: AnalysisResults): void {
    const widget = document.getElementById('gmail-carbon-widget');
    if (!widget) return;

    const loading = widget.querySelector('.carbon-loading') as HTMLElement;
    const results = widget.querySelector('.carbon-results') as HTMLElement;
    const value = widget.querySelector('.carbon-value') as HTMLElement;
    const emailCount = widget.querySelector('.carbon-email-count') as HTMLElement;

    if (loading) loading.style.display = 'none';
    if (results) results.style.display = 'block';

    if (value) value.textContent = data.totalCO2Kg;
    if (emailCount) {
      emailCount.textContent = `${data.totalEmails.toLocaleString('en-US')} emails`;
    }
  }

  // Start the injection
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidget);
  } else {
    injectWidget();
  }

})();
