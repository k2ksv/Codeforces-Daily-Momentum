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
    if (!rating || rating < 1200) return 'rgba(204, 204, 204, 0.7)'; // Gray
    if (rating < 1400) return 'rgba(119, 255, 119, 0.7)'; // Green
    if (rating < 1600) return 'rgba(119, 221, 187, 0.7)'; // Cyan
    if (rating < 1900) return 'rgba(170, 170, 255, 0.7)'; // Blue
    if (rating < 2100) return 'rgba(255, 136, 255, 0.7)'; // Purple
    if (rating < 2300) return 'rgba(255, 204, 136, 0.7)'; // Light Orange
    if (rating < 2400) return 'rgba(255, 187, 85, 0.7)';  // Orange
    if (rating < 3000) return 'rgba(255, 119, 119, 0.7)'; // Red
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

  function renderChartConfig(graphType, dates, rollingSums, dailySolves, movingAvg7d, ratingsData) {
    if (momentumChart) {
      momentumChart.destroy();
    }

    let config = {};

    if (graphType === "momentum") {
      config = {
        type: "line",
        data: {
          labels: dates,
          datasets: [{
            label: "30-Day Momentum",
            data: rollingSums,
            borderColor: "#4bc0c0",
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            fill: true,
            tension: 0.3,
            pointRadius: dates.length > 365 ? 0 : 2,
            pointHoverRadius: 6,
            pointBackgroundColor: "#4bc0c0",
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { display: false } },
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
              borderColor: '#ff9800',
              backgroundColor: 'transparent',
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 4,
              borderWidth: 2,
              order: 0
            },
            {
              type: 'bar',
              label: 'Daily Solves',
              data: dailySolves,
              backgroundColor: 'rgba(75, 192, 192, 0.4)',
              order: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: true, position: 'top' },
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
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const data = context.raw;
                  const count = data.r / 4;
                  return `Date: ${data.x} | Rating: ${data.y} | Solved: ${count}`;
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
    statBest.textContent = bestMomentum;
    statMaxSingle.textContent = maxSingleDay;

    loadingState.style.display = "none";
    chartCanvas.style.display = "block";
    yearSelect.style.display = "block";
    graphSelect.style.display = "block";

    if (typeof Chart === 'undefined') {
      throw new Error("Chart.js did not load properly.");
    }

    renderChartConfig(graphType, filteredDates, filteredSums, filteredDailySolves, filteredMovingAvg, filteredRatings);
  }

  async function init() {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
      
      const json = await response.json();
      if (json.status !== "OK") throw new Error(json.comment || "API Error");

      const submissions = json.result;
      const accepted = submissions.filter((sub) => sub.verdict === "OK");

      if (accepted.length === 0) {
        throw new Error("No accepted submissions found.");
      }

      // ── Build Daily Counts Map & Ratings Map ──
      const dailyCounts = {};
      const ratingCounts = {}; // { "YYYY-MM-DD": { "800": 1, "1200": 2 } }
      const seen = new Set();
      let firstDateStr = null;

      const acceptedAsc = [...accepted].reverse();
      
      acceptedAsc.forEach((sub) => {
        const day = timestampToDate(sub.creationTimeSeconds);
        if (!firstDateStr) firstDateStr = day;
        
        const problemKey = `${sub.problem.contestId}-${sub.problem.index}`;
        const uniqueKey = `${day}-${problemKey}`;
        
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
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
        
        // 30-Day Rolling Sum
        let sum30 = 0;
        const startIdx30 = Math.max(0, i - 29);
        for (let j = startIdx30; j <= i; j++) {
          sum30 += (dailyCounts[allDates[j]] || 0);
        }
        rollingSums.push(sum30);

        // 7-Day Moving Avg
        let sum7 = 0;
        let count7 = 0;
        const startIdx7 = Math.max(0, i - 6);
        for (let j = startIdx7; j <= i; j++) {
          sum7 += (dailyCounts[allDates[j]] || 0);
          count7++;
        }
        movingAvg7d.push(+(sum7 / count7).toFixed(2));

        // Ratings Data
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
      const sortedYears = Array.from(years).sort().reverse();
      sortedYears.forEach(year => {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
      });

      const defaultYear = sortedYears.length > 0 ? sortedYears[0] : "all";
      yearSelect.value = defaultYear;

      // ── Compute Current 30-Day Sum ──
      const current30DaySum = fullHistoryData.rollingSums[fullHistoryData.rollingSums.length - 1] || 0;
      statAvg.textContent = current30DaySum;

      // ── Render Chart ──
      updateChart();

      // ── Bind Dropdowns ──
      yearSelect.addEventListener("change", updateChart);
      graphSelect.addEventListener("change", updateChart);

    } catch (err) {
      console.error("CF Momentum Error:", err);
      loadingState.style.display = "none";
      errorState.style.display = "block";
      errorState.innerHTML = `<span class="error-text">⚠️ Failed to load data: ${err.message}</span>`;
    }
  }

  init();
})();
