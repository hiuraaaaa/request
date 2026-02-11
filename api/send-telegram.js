// api/send-telegram.js
// Rate limiting dengan IP blocking untuk Vercel

// In-memory store untuk rate limiting (untuk production gunakan Redis/Vercel KV)
const rateLimit = new Map();

// Konfigurasi
const RATE_LIMIT = {
  MAX_REQUESTS: 3,        // Maksimal 3 request
  WINDOW_MS: 3600000,     // Per 1 jam (dalam milliseconds)
  BLOCK_DURATION: 3600000 // Block selama 1 jam jika melebihi
};

function getClientIP(req) {
  // Dapatkan IP dari Vercel headers
  const forwarded = req.headers['x-forwarded-for'];
  const realIP = req.headers['x-real-ip'];
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  return req.connection?.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  
  // Cek apakah IP ada dalam tracking
  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, {
      count: 1,
      firstRequest: now,
      blockedUntil: null
    });
    return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS - 1 };
  }
  
  const record = rateLimit.get(ip);
  
  // Cek apakah IP sedang di-block
  if (record.blockedUntil && now < record.blockedUntil) {
    const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
    return { 
      allowed: false, 
      retryAfter,
      reason: 'IP blocked due to excessive requests'
    };
  }
  
  // Reset jika window sudah lewat
  if (now - record.firstRequest > RATE_LIMIT.WINDOW_MS) {
    record.count = 1;
    record.firstRequest = now;
    record.blockedUntil = null;
    return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS - 1 };
  }
  
  // Increment counter
  record.count++;
  
  // Cek apakah melebihi limit
  if (record.count > RATE_LIMIT.MAX_REQUESTS) {
    record.blockedUntil = now + RATE_LIMIT.BLOCK_DURATION;
    const retryAfter = Math.ceil(RATE_LIMIT.BLOCK_DURATION / 1000);
    return { 
      allowed: false, 
      retryAfter,
      reason: `Too many requests. Maximum ${RATE_LIMIT.MAX_REQUESTS} requests per hour.`
    };
  }
  
  return { 
    allowed: true, 
    remaining: RATE_LIMIT.MAX_REQUESTS - record.count 
  };
}

// Cleanup old entries setiap 10 menit
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimit.entries()) {
    if (now - record.firstRequest > RATE_LIMIT.WINDOW_MS * 2) {
      rateLimit.delete(ip);
    }
  }
}, 600000);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  // Get client IP
  const clientIP = getClientIP(req);
  console.log('Request from IP:', clientIP);

  // Check rate limit
  const rateLimitResult = checkRateLimit(clientIP);
  
  if (!rateLimitResult.allowed) {
    console.log(`Rate limit exceeded for IP: ${clientIP}`);
    return res.status(429).json({
      success: false,
      error: rateLimitResult.reason,
      retryAfter: rateLimitResult.retryAfter,
      ip: clientIP // untuk debugging, hapus di production
    });
  }

  // Process request
  try {
    const { email, url, description, timestamp } = req.body;

    // Validasi input
    if (!email || !description) {
      return res.status(400).json({
        success: false,
        error: 'Email dan deskripsi wajib diisi'
      });
    }

    // Telegram Bot Token dan Chat ID (ganti dengan milik Anda)
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Telegram credentials not configured');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
    }

    // Format pesan untuk Telegram
    const message = `
🆕 "Request Baru!"

📧 "Email": ${email}
🔗 "URL": ${url}
📝 "Deskripsi":
${description}

🕐 "Waktu": ${timestamp}
🌐 "IP": ${clientIP}
    `.trim();

    // Kirim ke Telegram
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message
        })
      }
    );

    const telegramData = await telegramResponse.json();

    if (!telegramData.ok) {
      console.error('Telegram API error:', telegramData);
      return res.status(500).json({
        success: false,
        error: 'Failed to send message to Telegram',
        details: telegramData.description
      });
    }

    // Log successful request
    console.log(`Request sent successfully from IP: ${clientIP}, Remaining: ${rateLimitResult.remaining}`);

    return res.status(200).json({
      success: true,
      message: 'Request berhasil dikirim',
      remaining: rateLimitResult.remaining
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
