export default async function handler(req, res) {
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
            console.error('Missing Telegram credentials');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Format message with HTML
        const message = `
🔔 <b>REQUEST BARU - Scrape & Fitur</b>

👤 <b>Email:</b>
<code>${email}</code>

🔗 <b>URL Target:</b>
${url !== '-' ? `<code>${url}</code>` : '<i>Tidak ada</i>'}

📝 <b>Deskripsi Request:</b>
${description}

⏰ <b>Waktu:</b>
${timestamp}

━━━━━━━━━━━━━━━━━━━━
`;

        // Send to Telegram
        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
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
            }
        );

        const telegramData = await telegramResponse.json();

        if (!telegramData.ok) {
            console.error('Telegram API error:', telegramData);
            return res.status(500).json({ 
                error: 'Gagal mengirim ke Telegram',
                details: telegramData.description 
            });
        }

        // Success response
        return res.status(200).json({ 
            success: true, 
            message: 'Request berhasil dikirim ke Telegram' 
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
}
