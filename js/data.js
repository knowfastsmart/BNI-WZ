const DATA_URL = 'https://docs.google.com/spreadsheets/d/1hjhIFVAI4e_q9x0TYYm1GGzy7yrsjzxopq4QNk6g10M/export?format=csv&gid=0';
const MEMBER_DATA_URL = 'https://docs.google.com/spreadsheets/d/1hjhIFVAI4e_q9x0TYYm1GGzy7yrsjzxopq4QNk6g10M/export?format=csv&gid=1514116026';

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

const MEMBER_COL = {
  NAME: 1,
  ID: 6,
};

const LABEL = {
  attendance: '\u51fa\u5e2d',
  absence: '\u7f3a\u5e2d',
  late: '\u9072\u5230',
  sick: '\u75c5\u5047',
  substitute: '\u66ff\u4ee3\u4eba',
  referral: '\u5f15\u85a6',
  referralGiven: '\u63d0\u4f9b\u5f15\u85a6',
  referralReceived: '\u6536\u5230\u5f15\u85a6',
  guest: '\u4f86\u8cd3',
  oneOnOne: '\u4e00\u5c0d\u4e00',
  oneOnOneMeetings: '\u4e00\u5c0d\u4e00\u6703\u9762',
  training: '\u6559\u80b2',
  trainingUnits: '\u5206\u6703\u6559\u80b2\u55ae\u4f4d',
  value: '\u91d1\u984d',
  transactionValue: '\u4ea4\u6613\u50f9\u503c',
  attendanceRate: '\u51fa\u5e2d\u7387',
  total: '\u7e3d\u5206',
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
  if (!value || value === '#N/A' || String(value).startsWith('#')) return 0;
  return Number.parseFloat(String(value).replace(/,/g, '')) || 0;
}

function normalizeMemberId(value) {
  const match = String(value || '').match(/\d+/);
  return match ? match[0].padStart(3, '0') : null;
}

function normalizeName(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function getMemberNameKeys(name) {
  return String(name || '')
    .split(/[\/|｜、,，]/)
    .map((part) => normalizeName(part))
    .filter((part) => part.length >= 2);
}

function findMemberByScoreName(scoreName, nameIndex) {
  const normalized = normalizeName(scoreName);
  if (!normalized) return null;

  const direct = nameIndex.get(normalized);
  if (direct) return direct;

  for (const [nameKey, member] of nameIndex.entries()) {
    if (normalized.includes(nameKey)) return member;
  }

  return null;
}

function parseMonth(raw) {
  const match = String(raw).match(/(\d{2})'-(\d{2})M/);
  if (!match) return null;
  const year = 2000 + Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  return {
    sort: `${year}-${String(month).padStart(2, '0')}`,
    display: `${year}/${month}\u6708`,
  };
}

function getTrafficLight(total) {
  if (total >= 70) return { color: '#22c55e', label: '\u7da0\u71c8', level: 'green' };
  if (total >= 50) return { color: '#eab308', label: '\u9ec3\u71c8', level: 'yellow' };
  if (total >= 30) return { color: '#ef4444', label: '\u7d05\u71c8', level: 'red' };
  return { color: '#374151', label: '\u9ed1\u71c8', level: 'black' };
}

async function fetchCSVRows(url, errorMessage) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(errorMessage);
  return parseCSV(await res.text());
}

async function fetchMemberDirectory() {
  const rows = await fetchCSVRows(
    MEMBER_DATA_URL,
    '\u7121\u6cd5\u8f09\u5165\u6703\u54e1\u7de8\u865f\u8868\uff0c\u8acb\u78ba\u8a8d Google Sheet \u6b0a\u9650'
  );
  const members = new Map();
  const nameIndex = new Map();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const id = normalizeMemberId(row[MEMBER_COL.ID]);
    const name = (row[MEMBER_COL.NAME] || '').trim();
    if (!id || !name) continue;

    members.set(id, {
      id,
      name,
      displayName: name,
      display: `${id} ${name}`,
    });
    getMemberNameKeys(name).forEach((nameKey) => {
      if (!nameIndex.has(nameKey)) nameIndex.set(nameKey, members.get(id));
    });
  }

  return { members, nameIndex };
}

async function fetchAllData() {
  if (cachedData) return cachedData;

  const [scoreRows, memberDirectory] = await Promise.all([
    fetchCSVRows(DATA_URL, '\u7121\u6cd5\u8f09\u5165 Google Sheet \u8cc7\u6599'),
    fetchMemberDirectory(),
  ]);
  const records = [];

  for (let i = 2; i < scoreRows.length; i += 1) {
    const row = scoreRows[i];
    const memberKey = (row[COL.MEMBER_ID] || '').trim();
    const scoreName = (row[COL.DISPLAY_NAME] || '').trim();
    const month = parseMonth(row[COL.MONTH] || '');
    const memberId = normalizeMemberId(memberKey);
    const directoryMember = memberDirectory.members.get(memberId) || findMemberByScoreName(scoreName, memberDirectory.nameIndex);
    if (!directoryMember || !month) continue;

    const id = directoryMember.id;

    records.push({
      id,
      month,
      scores: {
        [LABEL.attendance]: parseNum(row[COL.SCORE_ATTENDANCE]),
        [LABEL.referral]: parseNum(row[COL.SCORE_REFERRAL]),
        [LABEL.guest]: parseNum(row[COL.SCORE_GUEST]),
        [LABEL.oneOnOne]: parseNum(row[COL.SCORE_ONE_ON_ONE]),
        [LABEL.training]: parseNum(row[COL.SCORE_TRAINING]),
        [LABEL.value]: parseNum(row[COL.SCORE_VALUE]),
        [LABEL.total]: parseNum(row[COL.SCORE_TOTAL]),
      },
      raw: {
        [LABEL.attendance]: parseNum(row[COL.RAW_ATTENDANCE]),
        [LABEL.absence]: parseNum(row[COL.RAW_ABSENCE]),
        [LABEL.late]: parseNum(row[COL.RAW_LATE]),
        [LABEL.sick]: parseNum(row[COL.RAW_SICK]),
        [LABEL.substitute]: parseNum(row[COL.RAW_SUB]),
        [LABEL.referralGiven]: parseNum(row[COL.RAW_REFERRAL]),
        [LABEL.referralReceived]: parseNum(row[COL.RAW_REF_RECEIVED]),
        [LABEL.guest]: parseNum(row[COL.RAW_GUEST]),
        [LABEL.oneOnOneMeetings]: parseNum(row[COL.RAW_ONE_ON_ONE]),
        [LABEL.trainingUnits]: parseNum(row[COL.RAW_TRAINING]),
        [LABEL.transactionValue]: parseNum(row[COL.RAW_VALUE]),
        [LABEL.attendanceRate]: parseNum(row[COL.RAW_ATTEND_RATE]),
      },
    });
  }

  cachedData = { records, members: memberDirectory.members };
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

  [
    LABEL.attendance,
    LABEL.oneOnOne,
    LABEL.referral,
    LABEL.guest,
    LABEL.training,
    LABEL.value,
  ].forEach((key) => {
    const diff = curr[key] - prev[key];
    result[key] = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable';
  });

  return result;
}

function generateActionPlan(latestScores, latestRaw) {
  const isGreen = latestScores[LABEL.total] >= 70;
  const target = isGreen ? 100 : 70;
  const actions = [];
  const valueWan = (latestRaw[LABEL.transactionValue] / 10000).toFixed(1);

  [
    [
      '\u4e00\u5c0d\u4e00\u6703\u9762',
      LABEL.oneOnOne,
      15,
      `\u76ee\u524d 6 \u500b\u6708\u7d2f\u8a08 ${latestRaw[LABEL.oneOnOneMeetings]} \u6b21\u4e00\u5c0d\u4e00`,
      '\u6bcf\u9031\u5b89\u6392\u81f3\u5c11 2 \u6b21\u4e00\u5c0d\u4e00\u6703\u9762',
    ],
    [
      '\u696d\u52d9\u5f15\u85a6',
      LABEL.referral,
      20,
      `\u76ee\u524d 6 \u500b\u6708\u7d2f\u8a08\u63d0\u4f9b ${latestRaw[LABEL.referralGiven]} \u7b46\u5f15\u85a6`,
      '\u6bcf\u9031\u81f3\u5c11\u63d0\u4f9b 1.5 \u7b46\u5f15\u85a6',
    ],
    [
      '\u6559\u80b2\u57f9\u8a13',
      LABEL.training,
      15,
      `\u76ee\u524d 6 \u500b\u6708\u7d2f\u8a08 ${latestRaw[LABEL.trainingUnits]} \u5206\u6559\u80b2\u55ae\u4f4d`,
      '\u6bcf\u6708\u81f3\u5c11\u53c3\u52a0 1 \u6b21\u6559\u80b2\u8a13\u7df4',
    ],
    [
      '\u9080\u8acb\u4f86\u8cd3',
      LABEL.guest,
      15,
      `\u76ee\u524d 6 \u500b\u6708\u7d2f\u8a08\u9080\u8acb ${latestRaw[LABEL.guest]} \u4f4d\u4f86\u8cd3`,
      '\u6bcf\u6708\u81f3\u5c11\u9080\u8acb 2 \u4f4d\u4f86\u8cd3',
    ],
    [
      '\u5f15\u85a6\u91d1\u984d',
      LABEL.value,
      15,
      `\u76ee\u524d 6 \u500b\u6708\u7d2f\u8a08\u4ea4\u6613 ${valueWan} \u842c`,
      '\u6bcf\u9031\u8ddf\u9032\u5f15\u85a6\u6848\u4ef6\u9032\u5ea6',
    ],
    [
      LABEL.attendance,
      LABEL.attendance,
      20,
      `\u76ee\u524d 6 \u500b\u6708\u7d2f\u8a08\u7f3a\u5e2d ${latestRaw[LABEL.absence]} \u6b21`,
      '\u7dad\u6301\u51fa\u5e2d\uff0c\u5fc5\u8981\u6642\u63d0\u524d\u5b89\u6392\u66ff\u4ee3\u4eba',
    ],
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
    gap: Math.max(0, target - latestScores[LABEL.total]),
    actions,
  };
}

async function getMemberDashboardData(memberId) {
  const paddedId = memberId.padStart(3, '0');
  const { records, members } = await fetchAllData();
  const member = members.get(paddedId);
  if (!member) throw new Error(`\u627e\u4e0d\u5230\u6703\u54e1\u7de8\u865f ${paddedId}`);

  const memberRecords = records
    .filter((record) => record.id === paddedId)
    .sort((a, b) => a.month.sort.localeCompare(b.month.sort));

  if (!memberRecords.length) throw new Error('\u6b64\u6703\u54e1\u5c1a\u7121\u6708\u5ea6\u8cc7\u6599');

  const monthlyData = memberRecords.slice(-6);
  const latest = monthlyData[monthlyData.length - 1];
  const scoreItems = [
    { name: LABEL.attendance, score: latest.scores[LABEL.attendance], max: 20 },
    { name: LABEL.oneOnOne, score: latest.scores[LABEL.oneOnOne], max: 15 },
    { name: LABEL.training, score: latest.scores[LABEL.training], max: 15 },
    { name: LABEL.referral, score: latest.scores[LABEL.referral], max: 20 },
    { name: LABEL.guest, score: latest.scores[LABEL.guest], max: 15 },
    { name: LABEL.value, score: latest.scores[LABEL.value], max: 15 },
  ];

  return {
    member,
    monthlyData,
    scores: {
      items: scoreItems,
      total: latest.scores[LABEL.total],
      light: getTrafficLight(latest.scores[LABEL.total]),
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
