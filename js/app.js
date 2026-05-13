(function () {
  const $ = (selector) => document.querySelector(selector);
  let memberList = [];
  let trendChart = null;
  let scoreChart = null;

  document.addEventListener('DOMContentLoaded', async () => {
    const input = $('#member-input');
    const preview = $('#member-preview');
    const lookupBtn = $('#lookup-btn');
    const loading = $('#login-loading');
    const error = $('#login-error');

    try {
      memberList = await BNIData.fetchMemberList();
      loading.classList.add('hidden');
    } catch (err) {
      loading.classList.add('hidden');
      error.textContent = err.message || '無法載入會員名單';
      error.classList.remove('hidden');
      return;
    }

    input.addEventListener('input', () => {
      const id = input.value.trim().padStart(3, '0');
      const member = memberList.find((item) => item.id === id);
      error.classList.add('hidden');

      if (member) {
        preview.textContent = member.display;
        preview.classList.remove('hidden');
        lookupBtn.disabled = false;
      } else {
        preview.classList.add('hidden');
        lookupBtn.disabled = true;
      }
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !lookupBtn.disabled) lookupBtn.click();
    });

    lookupBtn.addEventListener('click', () => handleLookup(input.value.trim()));
    $('#back-btn').addEventListener('click', () => {
      $('#dashboard-section').classList.add('hidden');
      $('#login-section').classList.remove('hidden');
      input.value = '';
      preview.classList.add('hidden');
      lookupBtn.disabled = true;
      input.focus();
    });
  });

  async function handleLookup(memberId) {
    const loginError = $('#login-error');
    const loading = $('#dashboard-loading');
    loginError.classList.add('hidden');
    $('#login-section').classList.add('hidden');
    $('#dashboard-section').classList.remove('hidden');
    loading.classList.remove('hidden');

    try {
      const data = await BNIData.getMemberDashboardData(memberId);
      $('#member-name').textContent = data.member.display;

      const notice = $('#data-notice');
      if (data.totalMonths > 6) {
        notice.textContent = `共 ${data.totalMonths} 個月資料，顯示最近 6 個月`;
        notice.classList.remove('hidden');
      } else if (data.monthCount < 6) {
        notice.textContent = `目前資料涵蓋 ${data.monthCount} 個月`;
        notice.classList.remove('hidden');
      } else {
        notice.classList.add('hidden');
      }

      renderTrafficLight(data.scores);
      renderMetricCards(data.scores, data.trends);
      renderTrendChart(data.monthlyData);
      renderScoreChart(data.monthlyData);
      renderActionPlan(data.actionPlan);
    } catch (err) {
      $('#dashboard-section').classList.add('hidden');
      $('#login-section').classList.remove('hidden');
      loginError.textContent = err.message || '查詢失敗';
      loginError.classList.remove('hidden');
    } finally {
      loading.classList.add('hidden');
    }
  }

  function renderTrafficLight(scores) {
    document.querySelectorAll('.light').forEach((el) => el.classList.remove('active'));
    const active = document.querySelector(`.light[data-level="${scores.light.level}"]`);
    if (active) active.classList.add('active');
    $('#total-score').textContent = scores.total;
    $('#total-score').style.color = scores.light.color;
    $('#score-label').textContent = scores.light.label;
    $('#score-label').style.color = scores.light.color;
  }

  function renderMetricCards(scores, trends) {
    const container = $('#metric-cards');
    const trendIcons = { up: '▲', down: '▼', stable: '—' };
    const trendClasses = { up: 'trend-up', down: 'trend-down', stable: 'trend-stable' };
    container.innerHTML = '';

    scores.items.forEach((item) => {
      const trend = trends ? trends[item.name] || 'stable' : 'stable';
      const card = document.createElement('div');
      card.className = 'metric-card';
      card.innerHTML = `
        <div>
          <div class="metric-name">${item.name}</div>
          <div class="metric-score">${item.score}<span class="metric-max"> / ${item.max}</span></div>
        </div>
        <div class="metric-trend ${trendClasses[trend]}">${trendIcons[trend]}</div>
      `;
      container.appendChild(card);
    });
  }

  function renderActionPlan(actionPlan) {
    const plan = $('#action-plan');
    const congrats = $('#green-congrats');

    if (actionPlan.isGreen) {
      congrats.classList.remove('hidden');
      $('#action-plan-title').textContent = '行動計劃 - 邁向滿分';
      $('#action-gap').textContent = `距離滿分還差 ${actionPlan.gap} 分。`;
    } else {
      congrats.classList.add('hidden');
      $('#action-plan-title').textContent = '行動計劃 - 邁向綠燈';
      $('#action-gap').textContent = `距離綠燈還差 ${actionPlan.gap} 分。`;
    }

    if (!actionPlan.actions.length) {
      plan.classList.add('hidden');
      return;
    }

    plan.classList.remove('hidden');
    $('#action-list').innerHTML = actionPlan.actions.map((action, index) => `
      <div class="action-item">
        <div>${index + 1}</div>
        <div>
          <div class="action-category">${action.category} <span>+${action.potential} 分</span></div>
          <div class="action-current">${action.current}</div>
          <div class="action-detail">${action.detail}</div>
        </div>
      </div>
    `).join('');
  }

  function renderTrendChart(monthlyData) {
    const ctx = $('#trend-chart').getContext('2d');
    if (trendChart) trendChart.destroy();
    const labels = monthlyData.map((item) => item.month.display);
    const items = [
      ['出席', '#3b82f6'],
      ['一對一', '#8b5cf6'],
      ['引薦', '#f59e0b'],
      ['來賓', '#10b981'],
      ['教育', '#ec4899'],
      ['金額', '#6366f1'],
    ];

    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: items.map(([key, color]) => ({
          label: key,
          data: monthlyData.map((item) => item.scores[key]),
          borderColor: color,
          backgroundColor: `${color}22`,
          tension: 0.3,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, max: 20 } },
      },
    });
  }

  function renderScoreChart(monthlyData) {
    const ctx = $('#score-chart').getContext('2d');
    if (scoreChart) scoreChart.destroy();
    const labels = monthlyData.map((item) => item.month.display);
    const items = [
      ['出席', '#3b82f6'],
      ['一對一', '#8b5cf6'],
      ['教育', '#ec4899'],
      ['引薦', '#f59e0b'],
      ['來賓', '#10b981'],
      ['金額', '#6366f1'],
    ];

    scoreChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: items.map(([key, color]) => ({
          label: key,
          data: monthlyData.map((item) => item.scores[key]),
          backgroundColor: color,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: true },
          y: { stacked: true, max: 100 },
        },
      },
    });
  }
}());
