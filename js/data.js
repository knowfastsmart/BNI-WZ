// Replace this URL with your published Google Sheet CSV URL.
// Google Sheets: File -> Share -> Publish to web -> CSV.
const DATA_URL = 'https://docs.google.com/spreadsheets/d/1hjhIFVAI4e_q9x0TYYm1GGzy7yrsjzxopq4QNk6g10M/export?format=csv&gid=0';

const COL = {
  MEMBER_ID: 2,
  MONTH: 3,
  DISPLAY_NAME: 4,
  SCORE_ATTENDANCE: 7,
  SCORE_REFERRAL: 9,
  SCORE_GUEST: 10,
  SCORE_ONE_ON_ONE: 11,
  SCORE_TRAINING: 12,
  SCORE_VALUE: 13,
  SCORE_TOTAL: 14,
  RAW_ATTENDANCE: 15,
  RAW_ABSENCE: 16,
  RAW_LATE: 17,
  RAW_SICK: 18,
  RAW_SUB: 19,
  RAW_REFERRAL: 20,
  RAW_REF_RECEIVED: 21,
  RAW_GUEST: 22,
  RAW_ONE_ON_ONE: 23,
  RAW_TRAINING: 24,
  RAW_VALUE: 25,
  RAW_ATTEND_RATE: 26,
};

let cachedData = null;

function parseCSV(text) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes && ch === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && ch === ',') {
      row.push(current.trim());
      current = '';
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseNum(value) {
  if (!value || value === '#N/A' || value.startsWith('#')) return 0;
  return Number.parseFloat(String(value).replace(/,/g, '')) || 0;
}

function parseMonth(raw) {
  const match = String(raw).match(/(\d{2})'-(\d{2})M/);
  if (!match) return null;
  const year = 2000 + Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  return {
    sort: `${year}-${String(month).padStart(2, '0')}`,
    display: `${year}/${month}月`,
  };
}

function getTrafficLight(total) {
  if (total >= 70) return { color: '#22c55e', label: '綠燈', level: 'green' };
  if (total >= 50) return { color: '#eab308', label: '黃燈', level: 'yellow' };
  if (total >= 30) return { color: '#ef4444', label: '紅燈', level: 'red' };
  return { color: '#374151', label: '黑燈', level: 'black' };
}

async function fetchAllData() {
  if (cachedData) return cachedData;

  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error('無法載入 Google Sheet 資料');

  const rows = parseCSV(await res.text());
  const records = [];
  const members = new Map();

  for (let i = 2; i < rows.length; i += 1) {
    const row = rows[i];
    const memberKey = (row[COL.MEMBER_ID] || '').trim();
    const month = parseMonth(row[COL.MONTH] || '');
    const match = memberKey.match(/^(\d+)_(.+)$/);
    if (!match || !month) continue;

    const id = match[1].padStart(3, '0');
    const name = match[2];
    const displayName = (row[COL.DISPLAY_NAME] || name).trim();

    if (!members.has(id)) {
      members.set(id, { id, name, displayName, display: `${id} ${name}` });
    }

    records.push({
      id,
      month,
      scores: {
        出席: parseNum(row[COL.SCORE_ATTENDANCE]),
        引薦: parseNum(row[COL.SCORE_REFERRAL]),
        來賓: parseNum(row[COL.SCORE_GUEST]),
        一對一: parseNum(row[COL.SCORE_ONE_ON_ONE]),
        教育: parseNum(row[COL.SCORE_TRAINING]),
        金額: parseNum(row[COL.SCORE_VALUE]),
        總分: parseNum(row[COL.SCORE_TOTAL]),
      },
      raw: {
        出席: parseNum(row[COL.RAW_ATTENDANCE]),
        缺席: parseNum(row[COL.RAW_ABSENCE]),
        遲到: parseNum(row[COL.RAW_LATE]),
        病假: parseNum(row[COL.RAW_SICK]),
        替代人: parseNum(row[COL.RAW_SUB]),
        提供引薦: parseNum(row[COL.RAW_REFERRAL]),
        收到引薦: parseNum(row[COL.RAW_REF_RECEIVED]),
        來賓: parseNum(row[COL.RAW_GUEST]),
        一對一會面: parseNum(row[COL.RAW_ONE_ON_ONE]),
        分會教育單位: parseNum(row[COL.RAW_TRAINING]),
        交易價值: parseNum(row[COL.RAW_VALUE]),
        出席率: parseNum(row[COL.RAW_ATTEND_RATE]),
      },
    });
  }

  cachedData = { records, members };
  return cachedData;
}

async function fetchMemberList() {
  const { members } = await fetchAllData();
  return Array.from(members.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function calculateTrends(monthlyData) {
  if (monthlyData.length < 2) return null;
  const prev = monthlyData[monthlyData.length - 2].scores;
  const curr = monthlyData[monthlyData.length - 1].scores;
  const result = {};
  ['出席', '一對一', '引薦', '來賓', '教育', '金額'].forEach((key) => {
    const diff = curr[key] - prev[key];
    result[key] = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
  });
  return result;
}

function generateActionPlan(latestScores, latestRaw) {
  const isGreen = latestScores.總分 >= 70;
  const target = isGreen ? 100 : 70;
  const actions = [];

  [
    ['一對一會面', '一對一', 15, `目前 6 個月累計 ${latestRaw.一對一會面} 次一對一`, '每週安排至少 2 次一對一會面'],
    ['業務引薦', '引薦', 20, `目前 6 個月累計提供 ${latestRaw.提供引薦} 筆引薦`, '每週至少提供 1.5 筆引薦'],
    ['教育培訓', '教育', 15, `目前 6 個月累計 ${latestRaw.分會教育單位} 分教育單位`, '每月至少參加 1 次教育訓練'],
    ['邀請來賓', '來賓', 15, `目前 6 個月累計邀請 ${latestRaw.來賓} 位來賓`, '每月至少邀請 2 位來賓'],
    ['引薦金額', '金額', 15, `目前 6 個月累計交易 ${(latestRaw.交易價值 / 10000).toFixed(1)} 萬`, '每週跟進引薦案件進度'],
    ['出席', '出席', 20, `目前 6 個月累計缺席 ${latestRaw.缺席} 次`, '維持出席，必要時提前安排替代人'],
  ].forEach(([category, key, max, current, detail]) => {
    const score = latestScores[key];
    if (score < max) {
      actions.push({
        category,
        current,
        detail,
        potential: max - score,
      });
    }
  });

  return {
    isGreen,
    gap: Math.max(0, target - latestScores.總分),
    actions,
  };
}

async function getMemberDashboardData(memberId) {
  const paddedId = memberId.padStart(3, '0');
  const { records, members } = await fetchAllData();
  const member = members.get(paddedId);
  if (!member) throw new Error(`找不到會員編號 ${paddedId}`);

  const memberRecords = records
    .filter((record) => record.id === paddedId)
    .sort((a, b) => a.month.sort.localeCompare(b.month.sort));

  if (!memberRecords.length) throw new Error('此會員尚無月度資料');

  const monthlyData = memberRecords.slice(-6);
  const latest = monthlyData[monthlyData.length - 1];
  const scoreItems = [
    { name: '出席', score: latest.scores.出席, max: 20 },
    { name: '一對一', score: latest.scores.一對一, max: 15 },
    { name: '教育', score: latest.scores.教育, max: 15 },
    { name: '引薦', score: latest.scores.引薦, max: 20 },
    { name: '來賓', score: latest.scores.來賓, max: 15 },
    { name: '金額', score: latest.scores.金額, max: 15 },
  ];

  return {
    member,
    monthlyData,
    scores: {
      items: scoreItems,
      total: latest.scores.總分,
      light: getTrafficLight(latest.scores.總分),
    },
    trends: calculateTrends(monthlyData),
    actionPlan: generateActionPlan(latest.scores, latest.raw),
    monthCount: monthlyData.length,
    totalMonths: memberRecords.length,
  };
}

window.BNIData = {
  fetchMemberList,
  getMemberDashboardData,
};
