const fs = require('node:fs');
const path = require('node:path');
const { getUserDataPath } = require('../utils/paths.cjs');

const MAX_RECENT_RECORDS = 200;

function createEmptyStats() {
  return { version: 1, updated_at: null, totals: { requests: 0, prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 }, daily: {}, hourly: {}, five_minute: {}, recent: [] };
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function normalizeUsage(usage = {}) {
  const promptTokens = normalizeNumber(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = normalizeNumber(usage.completion_tokens ?? usage.output_tokens);
  const reasoningTokens = normalizeNumber(usage.reasoning_tokens ?? usage.reasoning_tokens_details?.reasoning_tokens);
  const totalTokens = normalizeNumber(usage.total_tokens) || promptTokens + completionTokens;
  return { prompt_tokens: promptTokens, completion_tokens: completionTokens, reasoning_tokens: reasoningTokens, total_tokens: totalTokens };
}

function createUsageStatsStore(app) {
  const filePath = path.join(getUserDataPath(app), 'workspace', 'usage_stats.json');

  function load() {
    if (!fs.existsSync(filePath)) return createEmptyStats();
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const empty = createEmptyStats();
      return {
        ...empty,
        ...parsed,
        totals: { ...empty.totals, ...(parsed?.totals || {}) },
        daily: parsed?.daily && typeof parsed.daily === 'object' ? parsed.daily : {},
        hourly: parsed?.hourly && typeof parsed.hourly === 'object' ? parsed.hourly : {},
        five_minute: parsed?.five_minute && typeof parsed.five_minute === 'object' ? parsed.five_minute : {},
        recent: Array.isArray(parsed?.recent) ? parsed.recent.slice(-MAX_RECENT_RECORDS) : [],
      };
    } catch {
      return createEmptyStats();
    }
  }

  function save(stats) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tempPath, `${JSON.stringify(stats, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      if (['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error?.code)) {
        fs.copyFileSync(tempPath, filePath);
        fs.rmSync(tempPath, { force: true });
      } else {
        if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
        throw error;
      }
    }
  }

  return {
    getSummary(range = '14d') {
      const stats = load();
      const byModel = {};
      for (const record of stats.recent) {
        const key = `${record.provider || 'unknown'} / ${record.model || 'unknown'}`;
        const current = byModel[key] || { provider: record.provider || 'unknown', model: record.model || 'unknown', requests: 0, total_tokens: 0 };
        current.requests += 1;
        current.total_tokens += normalizeNumber(record.usage?.total_tokens);
        byModel[key] = current;
      }
      const daily = Object.entries(stats.daily || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([date, values]) => ({ date, ...values }));
      const now = Date.now();
      const rangeConfig = {
        '1h': { duration: 60 * 60 * 1000, step: 5 * 60 * 1000, source: stats.five_minute },
        '6h': { duration: 6 * 60 * 60 * 1000, step: 60 * 60 * 1000, source: stats.hourly },
        '1d': { duration: 24 * 60 * 60 * 1000, step: 60 * 60 * 1000, source: stats.hourly },
        '7d': { duration: 7 * 24 * 60 * 60 * 1000, step: 24 * 60 * 60 * 1000, source: stats.daily },
        '14d': { duration: 14 * 24 * 60 * 60 * 1000, step: 24 * 60 * 60 * 1000, source: stats.daily },
      }[range] || { duration: 14 * 24 * 60 * 60 * 1000, step: 24 * 60 * 60 * 1000, source: stats.daily };
      const start = now - rangeConfig.duration;
      const trend = [];
      for (let timestamp = start; timestamp <= now; timestamp += rangeConfig.step) {
        const date = new Date(timestamp);
        const key = rangeConfig.step < 60 * 60 * 1000
          ? new Date(Math.floor(timestamp / (5 * 60 * 1000)) * (5 * 60 * 1000)).toISOString().slice(0, 16)
          : rangeConfig.step < 24 * 60 * 60 * 1000
            ? date.toISOString().slice(0, 13)
            : date.toISOString().slice(0, 10);
        trend.push({ date: key, requests: 0, prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0, ...(rangeConfig.source[key] || {}) });
      }
      return { ...stats, daily, trend, range, by_model: Object.values(byModel).sort((a, b) => b.total_tokens - a.total_tokens) };
    },
    record({ provider, model, usage, request_id, created_at } = {}) {
      const stats = load();
      const normalizedUsage = normalizeUsage(usage);
      const record = {
        request_id: String(request_id || ''),
        provider: String(provider || 'unknown'),
        model: String(model || 'unknown'),
        usage: normalizedUsage,
        created_at: created_at || new Date().toISOString(),
      };
      for (const key of Object.keys(stats.totals)) stats.totals[key] += normalizedUsage[key] || 0;
      stats.totals.requests += 1;
      const day = String(record.created_at).slice(0, 10);
      const daily = stats.daily[day] || { requests: 0, prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 };
      daily.requests += 1;
      for (const key of ['prompt_tokens', 'completion_tokens', 'reasoning_tokens', 'total_tokens']) daily[key] += normalizedUsage[key] || 0;
      stats.daily[day] = daily;
      const hour = String(record.created_at).slice(0, 13);
      const hourly = stats.hourly[hour] || { requests: 0, prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 };
      hourly.requests += 1;
      for (const key of ['prompt_tokens', 'completion_tokens', 'reasoning_tokens', 'total_tokens']) hourly[key] += normalizedUsage[key] || 0;
      stats.hourly[hour] = hourly;
      const minuteTimestamp = new Date(Math.floor(new Date(record.created_at).getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000));
      const minute = minuteTimestamp.toISOString().slice(0, 16);
      const fiveMinute = stats.five_minute[minute] || { requests: 0, prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 };
      fiveMinute.requests += 1;
      for (const key of ['prompt_tokens', 'completion_tokens', 'reasoning_tokens', 'total_tokens']) fiveMinute[key] += normalizedUsage[key] || 0;
      stats.five_minute[minute] = fiveMinute;
      stats.recent = [...stats.recent, record].slice(-MAX_RECENT_RECORDS);
      stats.updated_at = new Date().toISOString();
      save(stats);
      return record;
    },
    clear() {
      save(createEmptyStats());
      return { success: true };
    },
  };
}

module.exports = { createUsageStatsStore };
