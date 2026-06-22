/**
 * content.js — Codeforces Daily Momentum Tracker
 * Injected directly into the Codeforces profile page.
 */

(function () {
  // ─── 1. Determine Handle & Injection Point ──────────────────────────────
  
  const pathParts = window.location.pathname.split('/');
  const handleIndex = pathParts.indexOf('profile');
  if (handleIndex === -1 || handleIndex === pathParts.length - 1) {
    return; // Not a valid profile page
  }
  const cfHandle = pathParts[handleIndex + 1];

  const userbox = document.querySelector('.userbox');
  if (!userbox) return;

  // ─── 2. Inject the UI ───────────────────────────────────────────────────

  const widget = document.createElement('div');
  widget.id = 'cf-momentum-widget';
  
  widget.innerHTML = `
    <div class="widget-header" style="justify-content: flex-end;">
      <div class="controls">
        <select id="cf-graph-select" style="display: none;">
          <option value="momentum">30-Day Momentum</option>
          <option value="volume">Volume & Trend</option>
          <option value="rating">Rating Progression</option>
        </select>
        <select id="cf-year-select" style="display: none;">
          <option value="all">All Time</option>
        </select>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat-card">
        <div class="value" id="cf-stat-total">—</div>
        <div class="label">Total Solved (Selected Period)</div>
      </div>
      <div class="stat-card">
        <div class="value" id="cf-stat-avg">—</div>
        <div class="label">Solved in Last 30 Days</div>
      </div>
      <div class="stat-card">
        <div class="value" id="cf-stat-best">—</div>
        <div class="label">Peak 30-Day Momentum</div>
      </div>
      <div class="stat-card">
        <div class="value" id="cf-stat-max-single">—</div>
        <div class="label">Max Solves (1 Day)</div>
      </div>
    </div>
    <div class="chart-wrapper">
      <div id="cf-loading-state" class="state-overlay">
        <div class="spinner"></div>
        <span>Fetching submissions...</span>
      </div>
      <div id="cf-error-state" class="state-overlay" style="display: none;"></div>
      <canvas id="cf-momentum-chart" style="display: none;"></canvas>
    </div>
  `;

  userbox.parentNode.appendChild(widget);

  // ─── 3. Data Processing & Chart Logic ───────────────────────────────────
  
  const API_URL = `https://codeforces.com/api/user.status?handle=${cfHandle}`;

  const statTotal = document.getElementById("cf-stat-total");
  const statAvg = document.getElementById("cf-stat-avg");
  const statBest = document.getElementById("cf-stat-best");
  const statMaxSingle = document.getElementById("cf-stat-max-single");
  const loadingState = document.getElementById("cf-loading-state");
  const errorState = document.getElementById("cf-error-state");
  const chartCanvas = document.getElementById("cf-momentum-chart");
  const yearSelect = document.getElementById("cf-year-select");
  const graphSelect = document.getElementById("cf-graph-select");

  let momentumChart = null;
  let fullHistoryData = { dates: [], rollingSums: [], dailySolves: [], movingAvg7d: [], ratings: [] };

  function timestampToDate(ts) {
    return new Date(ts * 1000).toISOString().slice(0, 10);
  }

  function getRatingColor(rating) {
    if (!rating || rating < 1200) return 'rgba(160, 160, 160, 0.7)'; // Gray
    if (rating < 1400) return 'rgba(0, 160, 0, 0.7)'; // Green
    if (rating < 1600) return 'rgba(3, 168, 158, 0.7)'; // Cyan
    if (rating < 1900) return 'rgba(0, 0, 255, 0.7)'; // Blue
    if (rating < 2100) return 'rgba(170, 0, 170, 0.7)'; // Purple
    if (rating < 2300) return 'rgba(255, 176, 80, 0.7)'; // Light Orange
    if (rating < 2400) return 'rgba(255, 140, 0, 0.7)';  // Orange
    if (rating < 3000) return 'rgba(255, 0, 0, 0.7)'; // Red
    return 'rgba(170, 0, 0, 0.7)'; // Dark Red
  }

  function getDatesBetween(startDateStr, endDateStr) {
    const dates = [];
    let d = new Date(startDateStr);
    const end = new Date(endDateStr);
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  const cfColors = {
    gray: '#a0a0a0',
    green: '#00a000',
    cyan: '#03a89e',
    blue: '#0000ff',
    purple: '#aa00aa',
    orange: '#ff8c00',
    red: '#ff0000',
    darkRed: '#aa0000'
  };

  function getStatColor(value, type) {
    if (type === 'total') {
      if (value < 150) return cfColors.gray;
      if (value < 400) return cfColors.green;
      if (value < 800) return cfColors.cyan;
      if (value < 1400) return cfColors.blue;
      if (value < 2000) return cfColors.purple;
      if (value < 3000) return cfColors.orange;
      if (value < 4000) return cfColors.red;
      return cfColors.darkRed;
    } else if (type === 'momentum') {
      if (value < 25) return cfColors.gray;
      if (value < 50) return cfColors.green;
      if (value < 80) return cfColors.cyan;
      if (value < 120) return cfColors.blue;
      if (value < 170) return cfColors.purple;
      if (value < 230) return cfColors.orange;
      if (value < 300) return cfColors.red;
      return cfColors.darkRed;
    } else if (type === 'daily') {
      if (value < 3) return cfColors.gray;
      if (value < 6) return cfColors.green;
      if (value < 9) return cfColors.cyan;
      if (value < 14) return cfColors.blue;
      if (value < 20) return cfColors.purple;
      if (value < 25) return cfColors.orange;
      if (value < 30) return cfColors.red;
      return cfColors.darkRed;
    }
  }

  function getDynamicGradient(ctx, chartArea, yScale, type, isFill) {
    if (!yScale || yScale.min === undefined || yScale.max === undefined) return 'transparent';
    const min = yScale.min;
    const max = yScale.max;
    const range = max - min;
    
    let thresholds = [];
    if (type === 'momentum') {
      thresholds = [
        { val: 0, r: 160, g: 160, b: 160 },
        { val: 25, r: 0, g: 160, b: 0 },
        { val: 50, r: 3, g: 168, b: 158 },
        { val: 80, r: 0, g: 0, b: 255 },
        { val: 120, r: 170, g: 0, b: 170 },
        { val: 170, r: 255, g: 140, b: 0 },
        { val: 230, r: 255, g: 0, b: 0 },
        { val: 300, r: 170, g: 0, b: 0 }
      ];
    } else {
      thresholds = [
        { val: 0, r: 160, g: 160, b: 160 },
        { val: 3, r: 0, g: 160, b: 0 },
        { val: 6, r: 3, g: 168, b: 158 },
        { val: 9, r: 0, g: 0, b: 255 },
        { val: 14, r: 170, g: 0, b: 170 },
        { val: 20, r: 255, g: 140, b: 0 },
        { val: 25, r: 255, g: 0, b: 0 },
        { val: 30, r: 170, g: 0, b: 0 }
      ];
    }

    function getColorStr(t, alpha) { return `rgba(${t.r}, ${t.g}, ${t.b}, ${alpha})`; }
    function getInterpolatedColor(value) {
      if (value <= thresholds[0].val) return thresholds[0];
      if (value >= thresholds[thresholds.length - 1].val) return thresholds[thresholds.length - 1];
      for (let i = 0; i < thresholds.length - 1; i++) {
        if (value >= thresholds[i].val && value <= thresholds[i+1].val) {
          let t1 = thresholds[i]; let t2 = thresholds[i+1];
          let ratio = (value - t1.val) / (t2.val - t1.val);
          return {
            r: Math.round(t1.r + (t2.r - t1.r) * ratio),
            g: Math.round(t1.g + (t2.g - t1.g) * ratio),
            b: Math.round(t1.b + (t2.b - t1.b) * ratio)
          };
        }
      }
      return thresholds[0];
    }

    if (range <= 0) {
       return getColorStr(getInterpolatedColor(min), isFill ? 0.4 : 1.0);
    }

    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    
    let bottomColor = getInterpolatedColor(min);
    gradient.addColorStop(0, getColorStr(bottomColor, isFill ? 0.0 : 1.0));

    for (let t of thresholds) {
      if (t.val > min && t.val < max) {
        let offset = (t.val - min) / range;
        gradient.addColorStop(offset, getColorStr(t, isFill ? 0.4 : 1.0));
      }
    }

    let topColor = getInterpolatedColor(max);
    gradient.addColorStop(1, getColorStr(topColor, isFill ? 0.6 : 1.0));

    return gradient;
  }

  function renderChartConfig(graphType, dates, rollingSums, dailySolves, movingAvg7d, ratingsData) {
    if (momentumChart) {
      momentumChart.destroy();
    }

    const ctx = chartCanvas.getContext("2d");
    let config = {};

    const commonTooltipStyles = {
      backgroundColor: 'rgba(0,0,0,0.8)',
      titleFont: { size: 14, family: 'inherit', weight: 'bold' },
      bodyFont: { size: 13, family: 'inherit' },
      padding: 12,
      cornerRadius: 8,
      displayColors: false,
    };

    const commonZoomPlugin = {
      zoom: {
        wheel: { enabled: true, speed: 0.1 },
        pinch: { enabled: true },
        mode: 'x',
      },
      pan: {
        enabled: true,
        mode: 'x',
      }
    };

    if (graphType === "momentum") {
      config = {
        type: "line",
        data: {
          labels: dates,
          datasets: [{
            label: "30-Day Momentum",
            data: rollingSums,
            borderColor: function(context) {
              const {ctx, chartArea, scales} = context.chart;
              if (!chartArea) return null;
              return getDynamicGradient(ctx, chartArea, scales.y, 'momentum', false);
            },
            backgroundColor: function(context) {
              const {ctx, chartArea, scales} = context.chart;
              if (!chartArea) return null;
              return getDynamicGradient(ctx, chartArea, scales.y, 'momentum', true);
            },
            fill: true,
            tension: 0.4,
            pointRadius: dates.length > 365 ? 0 : 2,
            pointHoverRadius: 6,
            pointBackgroundColor: function(context) {
              const {ctx, chartArea, scales} = context.chart;
              if (!chartArea) return null;
              return getDynamicGradient(ctx, chartArea, scales.y, 'momentum', false);
            },
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { 
            legend: { display: false },
            zoom: commonZoomPlugin,
            tooltip: {
              ...commonTooltipStyles,
              callbacks: {
                title: (items) => `Date: ${items[0].label}`,
                label: (item) => `30-Day Momentum: ${item.raw} solves`,
              },
            }
          },
          scales: {
            x: { title: { display: true, text: "Date", color: "#666" }, ticks: { maxTicksLimit: 12 } },
            y: { beginAtZero: true, title: { display: true, text: "Solves in prior 30 days", color: "#666" } },
          },
        }
      };
    } else if (graphType === "volume") {
      config = {
        type: "bar",
        data: {
          labels: dates,
          datasets: [
            {
              type: 'line',
              label: '7-Day Trend',
              data: movingAvg7d,
              borderColor: function(context) {
                const {ctx, chartArea, scales} = context.chart;
                if (!chartArea) return null;
                return getDynamicGradient(ctx, chartArea, scales.y, 'daily', false);
              },
              backgroundColor: 'transparent',
              tension: 0.4,
              pointRadius: 0,
              pointHoverRadius: 4,
              borderWidth: 2,
              order: 0
            },
            {
              type: 'bar',
              label: 'Daily Solves',
              data: dailySolves,
              backgroundColor: function(context) {
                const {ctx, chartArea, scales} = context.chart;
                if (!chartArea) return null;
                return getDynamicGradient(ctx, chartArea, scales.y, 'daily', true);
              },
              borderRadius: 4,
              order: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            zoom: commonZoomPlugin,
            tooltip: commonTooltipStyles
          },
          scales: {
            x: { title: { display: true, text: "Date", color: "#666" }, ticks: { maxTicksLimit: 12 } },
            y: { beginAtZero: true, title: { display: true, text: "Questions Solved", color: "#666" } },
          },
        }
      };
    } else if (graphType === "rating") {
      const bubbleData = ratingsData.map(d => ({
        x: d.date,
        y: d.rating,
        r: Math.max(4, d.count * 4)
      }));
      const bubbleColors = ratingsData.map(d => d.color);

      config = {
        type: "bubble",
        data: {
          datasets: [{
            label: 'Problems by Rating',
            data: bubbleData,
            backgroundColor: bubbleColors,
            borderColor: bubbleColors.map(c => c.replace('0.7', '1')),
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            zoom: commonZoomPlugin,
            tooltip: {
              ...commonTooltipStyles,
              displayColors: true,
              callbacks: {
                title: function(context) {
                  return context[0].raw.x;
                },
                label: function(context) {
                  const data = context.raw;
                  const count = data.r / 4;
                  return `Rating: ${data.y} | Solved: ${count}`;
                }
              }
            }
          },
          scales: {
            x: {
              type: 'category',
              labels: dates, // Provide dates so category scale maps correctly
              title: { display: true, text: "Date", color: "#666" },
              ticks: { maxTicksLimit: 12 }
            },
            y: {
              title: { display: true, text: "Problem Rating", color: "#666" },
              suggestedMin: 800,
              suggestedMax: 2400
            }
          }
        }
      };
    }

    momentumChart = new Chart(chartCanvas, config);
  }

  function updateChart() {
    const selectedYear = yearSelect.value;
    const graphType = graphSelect.value;
    
    let filteredDates = [];
    let filteredSums = [];
    let filteredDailySolves = [];
    let filteredMovingAvg = [];
    let filteredRatings = [];

    if (selectedYear === "all") {
      filteredDates = fullHistoryData.dates;
      filteredSums = fullHistoryData.rollingSums;
      filteredDailySolves = fullHistoryData.dailySolves;
      filteredMovingAvg = fullHistoryData.movingAvg7d;
      filteredRatings = fullHistoryData.ratings;
    } else {
      for (let i = 0; i < fullHistoryData.dates.length; i++) {
        if (fullHistoryData.dates[i].startsWith(selectedYear)) {
          filteredDates.push(fullHistoryData.dates[i]);
          filteredSums.push(fullHistoryData.rollingSums[i]);
          filteredDailySolves.push(fullHistoryData.dailySolves[i]);
          filteredMovingAvg.push(fullHistoryData.movingAvg7d[i]);
        }
      }
      filteredRatings = fullHistoryData.ratings.filter(r => r.date.startsWith(selectedYear));
    }

    const totalPeriodSolves = filteredDailySolves.reduce((a, b) => a + b, 0);
    const bestMomentum = Math.max(0, ...filteredSums);
    const maxSingleDay = Math.max(0, ...filteredDailySolves);

    statTotal.textContent = totalPeriodSolves;
    statTotal.style.color = getStatColor(totalPeriodSolves, 'total');
    statBest.textContent = bestMomentum;
    statBest.style.color = getStatColor(bestMomentum, 'momentum');
    statMaxSingle.textContent = maxSingleDay;
    statMaxSingle.style.color = getStatColor(maxSingleDay, 'daily');

    loadingState.style.display = "none";
    chartCanvas.style.display = "block";
    yearSelect.style.display = "block";
    graphSelect.style.display = "block";

    if (typeof Chart === 'undefined') {
      throw new Error("Chart.js did not load properly.");
    }

    renderChartConfig(graphType, filteredDates, filteredSums, filteredDailySolves, filteredMovingAvg, filteredRatings);
  }

  function processSubmissions(accepted) {
    if (accepted.length === 0) {
      throw new Error("No accepted submissions found.");
    }

    // ── Build Daily Counts Map & Ratings Map ──
    const dailyCounts = {};
    const ratingCounts = {};
    const seen = new Set();
    let firstDateStr = null;

    const acceptedAsc = [...accepted].reverse();
    acceptedAsc.forEach((sub) => {
      const day = timestampToDate(sub.creationTimeSeconds);
      if (!firstDateStr) firstDateStr = day;

      const problemKey = `${sub.problem.contestId}-${sub.problem.index}`;
      if (!seen.has(problemKey)) {
        seen.add(problemKey);
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        
        if (sub.problem.rating) {
          if (!ratingCounts[day]) ratingCounts[day] = {};
          const r = sub.problem.rating;
          ratingCounts[day][r] = (ratingCounts[day][r] || 0) + 1;
        }
      }
    });

    // ── Generate All Dates ──
    const todayStr = new Date().toISOString().slice(0, 10);
    const allDates = getDatesBetween(firstDateStr, todayStr);
    
    // ── Calculate Series ──
    const rollingSums = [];
    const mappedDailySolves = [];
    const movingAvg7d = [];
    const ratingsData = [];
    const years = new Set();

    for (let i = 0; i < allDates.length; i++) {
      const dStr = allDates[i];
      years.add(dStr.slice(0, 4));
      const solvesToday = dailyCounts[dStr] || 0;
      mappedDailySolves.push(solvesToday);
      
      let sum30 = 0;
      const startIdx30 = Math.max(0, i - 29);
      for (let j = startIdx30; j <= i; j++) {
        sum30 += (dailyCounts[allDates[j]] || 0);
      }
      rollingSums.push(sum30);

      let sum7 = 0;
      let count7 = 0;
      const startIdx7 = Math.max(0, i - 6);
      for (let j = startIdx7; j <= i; j++) {
        sum7 += (dailyCounts[allDates[j]] || 0);
        count7++;
      }
      movingAvg7d.push(+(sum7 / count7).toFixed(2));

      if (ratingCounts[dStr]) {
        for (const [ratingStr, count] of Object.entries(ratingCounts[dStr])) {
          ratingsData.push({
            date: dStr,
            rating: parseInt(ratingStr, 10),
            count: count,
            color: getRatingColor(parseInt(ratingStr, 10))
          });
        }
      }
    }

    fullHistoryData = { dates: allDates, rollingSums, dailySolves: mappedDailySolves, movingAvg7d, ratings: ratingsData };

    // ── Populate Year Dropdown ──
    const currentYear = yearSelect.value;
    yearSelect.innerHTML = "";
    
    const optionAll = document.createElement("option");
    optionAll.value = "all";
    optionAll.textContent = "All Time";
    yearSelect.appendChild(optionAll);

    const sortedYears = Array.from(years).sort().reverse();
    sortedYears.forEach(year => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    });

    if (sortedYears.includes(currentYear) || currentYear === "all") {
      yearSelect.value = currentYear;
    } else {
      yearSelect.value = sortedYears.length > 0 ? sortedYears[0] : "all";
    }

    // ── Compute Current 30-Day Sum ──
    const current30DaySum = fullHistoryData.rollingSums[fullHistoryData.rollingSums.length - 1] || 0;
    statAvg.textContent = current30DaySum;
    statAvg.style.color = getStatColor(current30DaySum, 'momentum');

    // ── Render Chart ──
    updateChart();
  }

  async function fetchAndMergeDelta(cachedAccepted) {
    try {
      const cacheKey = `cfData_${cfHandle}`;
      const response = await fetch(`${API_URL}&from=1&count=200`);
      if (!response.ok) return;
      const json = await response.json();
      if (json.status !== "OK") return;

      const recentAccepted = json.result.filter(sub => sub.verdict === "OK");
      if (recentAccepted.length === 0) return;

      const newestCachedId = cachedAccepted[0].id;
      const newSubmissions = [];

      let foundOverlap = false;
      for (const sub of recentAccepted) {
        if (sub.id === newestCachedId) {
          foundOverlap = true;
          break;
        }
        newSubmissions.push(sub);
      }

      if (newSubmissions.length > 0) {
        let mergedAccepted;
        if (foundOverlap) {
          mergedAccepted = [...newSubmissions, ...cachedAccepted];
        } else {
          // Fallback: >200 new submissions since last visit
          const fullRes = await fetch(API_URL);
          const fullJson = await fullRes.json();
          mergedAccepted = fullJson.result.filter(s => s.verdict === "OK");
        }

        await chrome.storage.local.set({ [cacheKey]: mergedAccepted });
        processSubmissions(mergedAccepted);
      }
    } catch (err) {
      console.warn("CF Momentum: Background update failed", err);
    }
  }

  let boundListeners = false;

  async function init() {
    if (!boundListeners) {
      yearSelect.addEventListener("change", updateChart);
      graphSelect.addEventListener("change", updateChart);
      boundListeners = true;
    }

    try {
      const cacheKey = `cfData_${cfHandle}`;
      const cache = await chrome.storage.local.get(cacheKey);
      const cachedAccepted = cache[cacheKey];

      if (cachedAccepted && Array.isArray(cachedAccepted) && cachedAccepted.length > 0) {
        // Cache Hit! Render instantly.
        loadingState.style.display = "none";
        processSubmissions(cachedAccepted);
        // Background Revalidation
        fetchAndMergeDelta(cachedAccepted);
      } else {
        // Cache Miss! Fetch from scratch.
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
        
        const json = await response.json();
        if (json.status !== "OK") throw new Error(json.comment || "API Error");

        const accepted = json.result.filter((sub) => sub.verdict === "OK");

        await chrome.storage.local.set({ [cacheKey]: accepted });
        
        loadingState.style.display = "none";
        processSubmissions(accepted);
      }
    } catch (err) {
      console.error("CF Momentum Error:", err);
      loadingState.style.display = "none";
      errorState.style.display = "flex";
      errorState.innerHTML = `<span class="error-text">⚠️ Failed to load data: ${err.message}</span>`;
    }
  }

  init();
})();
