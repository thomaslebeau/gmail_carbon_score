// content.js - Script injected into Gmail to display carbon score

(function() {
  'use strict';

  // Constants
  const GMAIL_CHECK_INTERVAL = 1000; // Interval to check if Gmail is loaded (ms)
  const GMAIL_LOAD_TIMEOUT = 30000; // Max time to wait for Gmail to load (ms)

  /**
   * Creates the carbon score widget DOM element
   * @returns {HTMLElement} The widget element
   */
  function createCarbonWidget() {
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
  function injectWidget() {
    // Wait for Gmail to be loaded
    const checkGmailLoaded = setInterval(() => {
      const gmailSidebar = document.querySelector('[role="navigation"]');
      
      if (gmailSidebar && !document.getElementById('gmail-carbon-widget')) {
        const widget = createCarbonWidget();
        gmailSidebar.parentElement.insertBefore(widget, gmailSidebar.nextSibling);

        // Load the results
        loadCarbonScore();

        // Handle click on the refresh button
        const refreshBtn = widget.querySelector('.carbon-refresh-btn');
        refreshBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: 'analyze' }, (response) => {
            if (response.success) {
              updateWidget(response.data);
            }
          });
        });
        
        clearInterval(checkGmailLoaded);
      }
    }, GMAIL_CHECK_INTERVAL);

    // Stop after timeout
    setTimeout(() => clearInterval(checkGmailLoaded), GMAIL_LOAD_TIMEOUT);
  }

  /**
   * Loads carbon score data from storage
   */
  function loadCarbonScore() {
    chrome.runtime.sendMessage({ action: 'getResults' }, (response) => {
      if (response.success && response.data) {
        updateWidget(response.data);
      } else {
        const widget = document.getElementById('gmail-carbon-widget');
        if (widget) {
          const loading = widget.querySelector('.carbon-loading');
          loading.textContent = 'Click on the extension to analyze';
        }
      }
    });
  }

  /**
   * Updates the widget with carbon score data
   * @param {Object} data - Carbon score analysis results
   */
  function updateWidget(data) {
    const widget = document.getElementById('gmail-carbon-widget');
    if (!widget) return;
    
    const loading = widget.querySelector('.carbon-loading');
    const results = widget.querySelector('.carbon-results');
    const value = widget.querySelector('.carbon-value');
    const emailCount = widget.querySelector('.carbon-email-count');
    
    loading.style.display = 'none';
    results.style.display = 'block';
    
    value.textContent = data.totalCO2Kg;
    emailCount.textContent = `${data.totalEmails.toLocaleString('en-US')} emails`;
  }

  // Start the injection
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidget);
  } else {
    injectWidget();
  }
  
})();
