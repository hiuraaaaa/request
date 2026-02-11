export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
    
    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, url, description, timestamp } = req.body;

        // Validate required fields
        if (!email || !description) {
            return res.status(400).json({ error: 'Email dan deskripsi harus diisi' });
        }

        // Get Telegram credentials from environment variables
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            console.error('Missing environment variables');
            console.error('BOT_TOKEN exists:', !!TELEGRAM_BOT_TOKEN);
            console.error('CHAT_ID exists:', !!TELEGRAM_CHAT_ID);
            return res.status(500).json({ 
                error: 'Environment variables tidak ditemukan. Periksa TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di Vercel Settings.' 
            });
        }

        // Escape HTML entities
        const escapeHtml = (text) => {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        };

        // Format message
        const message = `🔔 <b>REQUEST BARU - Scrape &amp; Fitur</b>

👤 <b>Email:</b>
<code>${escapeHtml(email)}</code>

🔗 <b>URL Target:</b>
${url !== '-' ? `<code>${escapeHtml(url)}</code>` : '<i>Tidak ada</i>'}

📝 <b>Deskripsi Request:</b>
${escapeHtml(description)}

⏰ <b>Waktu:</b>
${timestamp}

━━━━━━━━━━━━━━━━━━━━`;

        // Send to Telegram
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        
        const telegramResponse = await fetch(telegramUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            })
        });

        const telegramData = await telegramResponse.json();

        if (!telegramData.ok) {
            console.error('Telegram API error:', telegramData);
            
            let errorMessage = 'Gagal mengirim ke Telegram';
            if (telegramData.description) {
                if (telegramData.description.includes('chat not found')) {
                    errorMessage = 'Chat ID tidak valid. Pastikan bot sudah di-start dengan /start';
                } else if (telegramData.description.includes('bot was blocked')) {
                    errorMessage = 'Bot diblokir. Silakan unblock bot di Telegram.';
                } else if (telegramData.description.includes('Unauthorized')) {
                    errorMessage = 'Bot token tidak valid.';
                } else {
                    errorMessage = telegramData.description;
                }
            }
            
            return res.status(500).json({ 
                error: errorMessage,
                details: telegramData.description 
            });
        }

        // Success
        return res.status(200).json({ 
            success: true, 
            message: 'Request berhasil dikirim ke Telegram!' 
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Terjadi kesalahan',
            details: error.message 
        });
    }
}
