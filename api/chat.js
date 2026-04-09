const DAILY_LIMIT = 5; // 하루 무료 사용 횟수

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // IP 기반 사용 횟수 제한
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rateLimitKey = `rate_${ip}_${today}`.replace(/[^a-zA-Z0-9_]/g, '_');

  // Vercel Edge Config 대신 간단한 메모리 기반 (재시작마다 초기화)
  // 실제 서비스는 Redis/KV 사용 권장
  if (!global.rateLimit) global.rateLimit = {};
  const count = global.rateLimit[rateLimitKey] || 0;

  if (count >= DAILY_LIMIT) {
    return res.status(429).json({
      error: 'daily_limit_exceeded',
      message: '오늘의 무료 사용 횟수(5회)를 모두 사용했어요. 내일 다시 시도해주세요.',
      remaining: 0
    });
  }

  global.rateLimit[rateLimitKey] = count + 1;
  const remaining = DAILY_LIMIT - (count + 1);

  try {
    const body = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: body.system,
        messages: body.messages,
      }),
    });

    const data = await response.json();

    return res.status(response.status).json({
      ...data,
      _remaining: remaining
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
