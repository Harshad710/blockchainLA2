// TablePulse Developer Console Client App

let currentReport = null;
let sampleDatasets = [];

// DOM Elements
const editor = document.getElementById('data-input');
const charCountEl = document.getElementById('char-count');
const byteCountEl = document.getElementById('byte-count');
const lineCountEl = document.getElementById('line-count');
const nameInput = document.getElementById('dataset-name-input');
const formatSelect = document.getElementById('format-select');
const btnPreflight = document.getElementById('btn-preflight');
const btnProfile = document.getElementById('btn-profile');
const profileBtnText = document.getElementById('profile-btn-text');
const preflightBanner = document.getElementById('preflight-banner');
const preflightTitle = document.getElementById('preflight-status-title');
const preflightStats = document.getElementById('preflight-stats');
const preflightDetails = document.getElementById('preflight-details');
const resultsWorkspace = document.getElementById('results-workspace');
const sampleChipsContainer = document.getElementById('sample-chips-container');

// Update input metadata (characters, bytes, lines)
function updateEditorMeta() {
  const text = editor.value;
  const chars = text.length;
  const bytes = new Blob([text]).size;
  const lines = text ? text.split('\n').length : 0;

  charCountEl.textContent = `${chars.toLocaleString()} chars`;
  byteCountEl.textContent = bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
  lineCountEl.textContent = `${lines.toLocaleString()} lines`;
}

editor.addEventListener('input', updateEditorMeta);

// Tab Navigation
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));

    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    const pane = document.getElementById(tabId);
    if (pane) pane.classList.add('active');
  });
});

// Fetch Server Status & Pricing
async function loadServerHealth() {
  try {
    const res = await fetch('/health');
    if (!res.ok) return;
    const data = await res.json();
    const statusEl = document.getElementById('nav-server-status');
    const paymentEl = document.getElementById('nav-payment-badge');

    statusEl.textContent = `${data.service} Online`;
    if (data.payments && data.payments.enabled) {
      paymentEl.innerHTML = `<span>💰 $${data.payments.profilePriceUsd} / profile</span>`;
      profileBtnText.textContent = `🚀 Run Full Profile ($${data.payments.profilePriceUsd})`;
    } else {
      paymentEl.innerHTML = `<span>⚡ Dev Mode (Free)</span>`;
      profileBtnText.textContent = `🚀 Run Full Profile (Free)`;
    }
  } catch (err) {
    console.warn('Could not load health endpoint:', err);
  }
}

// Fetch Sample Datasets
async function loadSampleDatasets() {
  try {
    const res = await fetch('/api/v1/sample-datasets');
    if (!res.ok) return;
    const data = await res.json();
    sampleDatasets = data.datasets || [];

    sampleChipsContainer.innerHTML = '';
    sampleDatasets.forEach((sample, idx) => {
      const chip = document.createElement('button');
      chip.className = `chip ${idx === 0 ? 'active' : ''}`;
      chip.innerHTML = `
        <span class="chip-tag tag-${sample.category}">${sample.category.toUpperCase()}</span>
        <span>${sample.name}</span>
        <span style="color: var(--text-dim); font-size: 0.75rem;">[Grade ${sample.expectedGrade}]</span>
      `;

      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        selectSample(sample);
      });

      sampleChipsContainer.appendChild(chip);
    });

    if (sampleDatasets.length > 0) {
      selectSample(sampleDatasets[0]);
    }
  } catch (err) {
    console.error('Error fetching sample datasets:', err);
  }
}

function selectSample(sample) {
  editor.value = sample.content;
  nameInput.value = sample.name;
  formatSelect.value = sample.format;
  updateEditorMeta();
  preflightBanner.classList.remove('active');
}

// Run Preflight Check
btnPreflight.addEventListener('click', async () => {
  const content = editor.value.trim();
  if (!content) {
    alert('Please enter or paste tabular data first.');
    return;
  }

  btnPreflight.disabled = true;
  btnPreflight.innerHTML = '<span>⏳ Checking...</span>';

  try {
    const format = formatSelect.value === 'auto' ? undefined : formatSelect.value;
    const res = await fetch('/api/v1/preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datasetName: nameInput.value || 'dataset',
        format,
        content,
      }),
    });

    const preflight = await res.json();
    renderPreflightBanner(preflight);
  } catch (err) {
    alert(`Preflight failed: ${err.message}`);
  } finally {
    btnPreflight.disabled = false;
    btnPreflight.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
      <span>⚡ Preflight Check (Free)</span>
    `;
  }
});

function renderPreflightBanner(preflight) {
  preflightBanner.className = `preflight-banner active ${preflight.valid ? 'valid' : 'invalid'}`;

  if (preflight.valid) {
    preflightTitle.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
      <span style="color: var(--emerald-success);">Preflight Passed — Ready for Profiling</span>
    `;
    preflightStats.innerHTML = `
      <span>Format: ${preflight.format.toUpperCase()}</span>
      <span>•</span>
      <span>${preflight.estimatedRows} Rows</span>
      <span>•</span>
      <span>${preflight.estimatedColumns} Columns</span>
      <span>•</span>
      <span>${(preflight.sizeBytes / 1024).toFixed(2)} KB</span>
    `;
    preflightDetails.textContent = `Detected Columns: ${preflight.columnNames.join(', ')}`;
  } else {
    preflightTitle.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--rose-danger)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
      <span style="color: var(--rose-danger);">Preflight Failed — Syntax or Limit Violations</span>
    `;
    preflightStats.innerHTML = '';
    preflightDetails.innerHTML = preflight.issues.map((i) => `<div>• ${i}</div>`).join('');
  }
}

// Run Full Profile
btnProfile.addEventListener('click', async () => {
  const content = editor.value.trim();
  if (!content) {
    alert('Please enter or paste tabular data first.');
    return;
  }

  btnProfile.disabled = true;
  profileBtnText.textContent = 'Profiling Data...';

  try {
    const format = formatSelect.value === 'auto' ? undefined : formatSelect.value;
    const res = await fetch('/api/v1/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datasetName: nameInput.value || 'dataset',
        format,
        content,
        topNValues: 8,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Request failed with code ${res.status}`);
    }

    const report = await res.json();
    currentReport = report;
    renderProfileReport(report);

    // Scroll to results
    resultsWorkspace.classList.add('active');
    resultsWorkspace.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert(`Profiling error: ${err.message}`);
  } finally {
    btnProfile.disabled = false;
    profileBtnText.textContent = '🚀 Run Full Profile ($0.001)';
  }
});

function renderProfileReport(report) {
  const sum = report.summary;

  // Grade circle & colors
  const gradeCircle = document.getElementById('grade-circle');
  const gradeLetter = document.getElementById('grade-letter');
  const gradeScore = document.getElementById('grade-score');
  const gradeLabel = document.getElementById('grade-label');

  gradeLetter.textContent = sum.qualityGrade;
  gradeScore.textContent = `Score: ${sum.qualityScore}/100`;

  let gradeColor = 'var(--cyan-accent)';
  if (sum.qualityGrade === 'A') gradeColor = 'var(--emerald-success)';
  else if (sum.qualityGrade === 'B') gradeColor = '#60a5fa';
  else if (sum.qualityGrade === 'C') gradeColor = 'var(--amber-warning)';
  else if (sum.qualityGrade === 'D') gradeColor = '#f97316';
  else gradeColor = 'var(--rose-danger)';

  gradeCircle.style.borderColor = gradeColor;
  gradeCircle.style.boxShadow = `0 0 25px ${gradeColor}44`;
  gradeLetter.style.color = gradeColor;
  gradeLabel.textContent = `Grade ${sum.qualityGrade} Quality Health`;

  // Stats tiles
  document.getElementById('stat-rows').textContent = sum.rowCount.toLocaleString();
  document.getElementById('stat-empty-rows').textContent = `${sum.emptyRowCount} blank rows`;
  document.getElementById('stat-cols').textContent = sum.columnCount;

  const typeEntries = Object.entries(sum.typeCounts).filter(([, count]) => count > 0);
  document.getElementById('stat-col-types').textContent = `${typeEntries.length} unique types`;

  document.getElementById('stat-duplicates').textContent = sum.duplicateRowCount;
  document.getElementById('stat-duplicate-pct').textContent = `${sum.duplicateRowPercentage}% duplicates`;

  document.getElementById('stat-memory').textContent = `${(sum.memoryBytes / 1024).toFixed(1)} KB`;
  document.getElementById('stat-format').textContent = sum.format.toUpperCase();

  document.getElementById('stat-duration').textContent = `${report.durationMs} ms`;
  document.getElementById('stat-alerts-count').textContent = report.alerts.length;
  document.getElementById('stat-alerts-breakdown').textContent = `${sum.totalAlerts.critical} crit, ${sum.totalAlerts.warning} warn`;

  // Badges on tabs
  document.getElementById('badge-columns-count').textContent = report.columns.length;
  document.getElementById('badge-alerts-count').textContent = report.alerts.length;

  // Render Column Inspector
  renderColumns(report.columns);

  // Render Alerts & Remediations
  renderAlerts(report.alerts, report.remediations);

  // Render Raw JSON
  const jsonView = document.getElementById('json-code-view');
  jsonView.textContent = JSON.stringify(report, null, 2);
}

function renderColumns(columns) {
  const container = document.getElementById('column-grid-container');
  container.innerHTML = '';

  columns.forEach((col) => {
    const card = document.createElement('div');
    card.className = 'col-card glass';

    const nullPct = col.nullPercentage;
    const validPct = Math.max(0, 100 - nullPct);

    // Mini histogram for numbers
    let histogramHtml = '';
    if (col.numericStats && col.numericStats.histogram) {
      const maxCount = Math.max(...col.numericStats.histogram.map((b) => b.count), 1);
      const bars = col.numericStats.histogram
        .map((b) => {
          const heightPct = Math.round((b.count / maxCount) * 100);
          return `<div class="hist-bar" style="height: ${heightPct}%;" title="Range: [${b.bucketMin} - ${b.bucketMax}] | Count: ${b.count}"></div>`;
        })
        .join('');
      histogramHtml = `
        <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 8px;">DISTRIBUTION HISTOGRAM:</div>
        <div class="mini-histogram">${bars}</div>
      `;
    }

    // Metrics list
    let metricsHtml = '';
    if (col.numericStats) {
      metricsHtml = `
        <tr><td>Min / Max</td><td>${col.numericStats.min} / ${col.numericStats.max}</td></tr>
        <tr><td>Mean / Median</td><td>${col.numericStats.mean} / ${col.numericStats.median}</td></tr>
        <tr><td>Std Dev / IQR</td><td>${col.numericStats.stdDev} / ${col.numericStats.iqr}</td></tr>
        ${col.numericStats.outliersCount > 0 ? `<tr style="color: var(--amber-warning);"><td>Outliers</td><td>${col.numericStats.outliersCount} (${col.numericStats.outliersPercentage}%)</td></tr>` : ''}
      `;
    } else if (col.stringStats) {
      metricsHtml = `
        <tr><td>Length (Min / Max)</td><td>${col.stringStats.minLength} / ${col.stringStats.maxLength} chars</td></tr>
        <tr><td>Avg Length</td><td>${col.stringStats.avgLength} chars</td></tr>
        ${col.stringStats.emptyStringsCount > 0 ? `<tr><td>Empty Strings</td><td>${col.stringStats.emptyStringsCount}</td></tr>` : ''}
      `;
    }

    // Top Values tags
    const topValuesHtml = col.topValues
      .slice(0, 5)
      .map((t) => `<div class="top-val-tag"><span>${escapeHtml(t.value)}</span><span class="top-val-pct">${t.percentage}%</span></div>`)
      .join('');

    card.innerHTML = `
      <div class="col-header">
        <span class="col-name">${escapeHtml(col.name)}</span>
        <span class="col-type-badge type-${col.inferredType}">${col.inferredType}</span>
      </div>

      <div class="col-bar-wrap">
        <div class="col-bar-labels">
          <span>Valid (${validPct.toFixed(1)}%)</span>
          <span>${col.nullCount > 0 ? `Null (${nullPct.toFixed(1)}%)` : 'No Nulls'}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill-valid" style="width: ${validPct}%;"></div>
          <div class="progress-fill-null" style="width: ${nullPct}%;"></div>
        </div>
      </div>

      <table class="col-metrics-table">
        <tbody>
          <tr><td>Total Rows</td><td>${col.totalCount.toLocaleString()}</td></tr>
          <tr><td>Distinct Values</td><td>${col.distinctCount.toLocaleString()} (${(col.uniquenessRatio * 100).toFixed(1)}%)</td></tr>
          ${metricsHtml}
        </tbody>
      </table>

      ${histogramHtml}

      <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 6px;">TOP FREQUENT VALUES:</div>
      <div class="top-values-list">${topValuesHtml || '<span style="color: var(--text-dim); font-size: 0.75rem;">None</span>'}</div>
    `;

    container.appendChild(card);
  });
}

function renderAlerts(alerts, remediations) {
  const container = document.getElementById('alerts-list-container');
  container.innerHTML = '';

  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="alert-card glass info" style="text-align: center; padding: 32px;">
        <span style="font-size: 1.5rem;">🎉</span>
        <h3 style="margin-top: 8px;">No Quality Violations Detected!</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 4px;">This dataset passed all strict quality rules, missingness checks, and boundary tests.</p>
      </div>
    `;
    return;
  }

  // Render Alerts
  alerts.forEach((alert) => {
    const card = document.createElement('div');
    card.className = `alert-card glass ${alert.severity}`;

    card.innerHTML = `
      <div class="alert-card-header">
        <span class="alert-badge badge-${alert.severity}">${alert.severity}</span>
        <span class="alert-rule">${alert.rule}</span>
      </div>
      <div class="alert-msg">${escapeHtml(alert.message)}</div>
      <div class="alert-rec">💡 <strong>Action:</strong> ${escapeHtml(alert.recommendation)}</div>
    `;

    container.appendChild(card);
  });

  // Render Actionable Remediation Code Blocks
  if (remediations && remediations.length > 0) {
    const remHeader = document.createElement('h3');
    remHeader.style.cssText = 'font-size: 1.15rem; margin-top: 24px; margin-bottom: 8px; color: #ffffff;';
    remHeader.textContent = '🛠️ Recommended Code & Query Fixes';
    container.appendChild(remHeader);

    remediations.forEach((rem, idx) => {
      const block = document.createElement('div');
      block.className = 'glass';
      block.style.padding = '20px';

      let sqlCode = '';
      if (rem.sqlSnippet) {
        sqlCode = `
          <div class="remediation-block">
            <div class="code-title">
              <span>SQL Query Remediation</span>
              <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('sql-code-${idx}').innerText)">Copy</button>
            </div>
            <pre class="code-view" id="sql-code-${idx}">${escapeHtml(rem.sqlSnippet)}</pre>
          </div>
        `;
      }

      let pyCode = '';
      if (rem.pythonSnippet) {
        pyCode = `
          <div class="remediation-block">
            <div class="code-title">
              <span>Python / Pandas Remediation</span>
              <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('py-code-${idx}').innerText)">Copy</button>
            </div>
            <pre class="code-view" id="py-code-${idx}">${escapeHtml(rem.pythonSnippet)}</pre>
          </div>
        `;
      }

      block.innerHTML = `
        <h4 style="font-size: 1rem; color: #ffffff; margin-bottom: 4px;">${escapeHtml(rem.title)}</h4>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">${escapeHtml(rem.description)}</p>
        ${sqlCode}
        ${pyCode}
      `;

      container.appendChild(block);
    });
  }
}

// Copy & Download JSON Handlers
document.getElementById('btn-copy-json').addEventListener('click', () => {
  if (!currentReport) return;
  navigator.clipboard.writeText(JSON.stringify(currentReport, null, 2));
  alert('Report JSON copied to clipboard!');
});

document.getElementById('btn-download-json').addEventListener('click', () => {
  if (!currentReport) return;
  const blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentReport.summary.name}_profile_report.json`;
  a.click();
  URL.revokeObjectURL(url);
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initial Boot
loadServerHealth();
loadSampleDatasets();
