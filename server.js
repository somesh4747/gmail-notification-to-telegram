import express, { json } from 'express'
import { google } from 'googleapis'
import cors from 'cors'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
// const notifier = require('node-notifier')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(json())

// OAuth2 Configuration
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
)

const TOKEN_PATH = join(__dirname, 'token.json')
let checkInterval = null
let lastEmailIds = new Set()
let isAuthenticated = false

// notification on telegram
const notificationTelegram = async (msg = 'test') => {
    const res = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=5413143833&text=${msg}`
    )
    // console.log(res)
}

// Load saved token
function loadToken() {
    try {
        if (existsSync(TOKEN_PATH)) {
            const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'))
            oauth2Client.setCredentials(token)
            isAuthenticated = true
            return true
        }
    } catch (error) {
        console.error('Error loading token:', error)
    }
    return false
}

// Send desktop notification
async function sendNotification(email) {
    const fromName = email.from + ' \n' + email.subject
    // email.from.split('<')[0].trim().replace(/"/g, '') || email.from
    console.log(email)

    let a = await notificationTelegram(fromName)
    console.log(`📧 NEW: ${email.subject} (from: ${fromName})`)
}

// Get unread emails
async function getUnreadEmails() {
    try {
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

        const response = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
            maxResults: 5,
        })

        const messages = response.data.messages || []

        if (messages.length === 0) {
            return { emails: [], count: 0 }
        }

        const emailPromises = messages.map(async (message) => {
            const msg = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date'],
            })

            const headers = msg.data.payload.headers
            const from =
                headers.find((h) => h.name === 'From')?.value || 'Unknown'
            const subject =
                headers.find((h) => h.name === 'Subject')?.value ||
                '(No subject)'
            const date = headers.find((h) => h.name === 'Date')?.value || ''

            return {
                id: message.id,
                from,
                subject,
                snippet: msg.data.snippet,
                date,
                threadId: msg.data.threadId,
            }
        })

        const emails = await Promise.all(emailPromises)
        return { emails, count: emails.length }
    } catch (error) {
        if (error.code === 401) {
            console.error('---- Token expired. Please run: node auth-setup.js')
            isAuthenticated = false
        }
        throw error
    }
}

// Auto-check for new emails
async function autoCheckEmails() {
    try {
        const { emails } = await getUnreadEmails()

        // Find new emails not seen before
        const newEmails = emails.filter((email) => !lastEmailIds.has(email.id))

        if (newEmails.length > 0) {
            console.log(`\n📬 Found ${newEmails.length} new email(s)!`)

            // Send notification for each new email
            newEmails.forEach((email) => {
                sendNotification(email)
            })
        }

        // Update tracked email IDs
        lastEmailIds = new Set(emails.map((e) => e.id))
    } catch (error) {
        console.error('Error checking emails:', error.message)
    }
}

// Start auto-checking
function startAutoCheck(intervalSec = 10) {
    if (checkInterval) {
        clearInterval(checkInterval)
    }

    console.log(`\n🔄 Monitoring Gmail every ${intervalSec} sec...`)

    // Initial check
    autoCheckEmails()

    // Set interval
    checkInterval = setInterval(autoCheckEmails, intervalSec * 1000)
}

// === API ENDPOINTS ===

// Check authentication status
app.get('/status', (req, res) => {
    res.json({
        authenticated: isAuthenticated,
        monitoring: !!checkInterval,
    })
})

// Get unread emails
app.get('/emails', async (req, res) => {
    if (!isAuthenticated) {
        return res.status(401).json({
            error: 'Not authenticated. Run: node auth-setup.js',
        })
    }

    try {
        const result = await getUnreadEmails()
        res.json(result)
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch emails',
            message: error.message,
        })
    }
})

// Manual check
app.post('/check-now', async (req, res) => {
    if (!isAuthenticated) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    try {
        await autoCheckEmails()
        res.json({ success: true, message: 'Checked for new emails' })
    } catch (error) {
        res.status(500).json({ error: 'Failed to check emails' })
    }
})

// Change check interval
app.post('/set-interval', (req, res) => {
    const { minutes } = req.body
    if (!minutes || minutes < 1) {
        return res.status(400).json({ error: 'Invalid interval' })
    }

    startAutoCheck(minutes)
    res.json({
        success: true,
        message: `Interval set to ${minutes} sec(s)`,
    })
})

// Test notification
app.post('/test', async (req, res) => {
    // notifier.notify({
    //     title: '📧 Gmail Checker',
    //     message: 'Test notification - Working perfectly!',
    //     sound: true,
    // })
    await notificationTelegram('testing the api')

    res.json({ success: true })
})

// Start server
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(70))
    console.log('📬 Gmail Checker - Automatic Email Monitor')
    console.log('='.repeat(70))
    console.log(`\n✅ Server running on http://localhost:${PORT}`)

    // Check if already authenticated
    if (loadToken()) {
        console.log('✅ Authenticated successfully!')
        startAutoCheck(1)
    } else {
        console.log('\n⚠️  NOT AUTHENTICATED')
        console.log('   Run this command first: node auth-setup.js')
        console.log('   (One-time setup only)\n')
    }

    console.log('\n📋 Available endpoints:')
    console.log(`   GET  /status - Check authentication status`)
    console.log(`   GET  /emails - Get unread emails`)
    console.log(`   POST /check-now - Check immediately`)
    console.log(`   POST /test - Test notification`)
    console.log('\n' + '='.repeat(70) + '\n')
})

process.on('SIGINT', () => {
    if (checkInterval) clearInterval(checkInterval)
    console.log('\n👋 Gmail Checker stopped')
    process.exit()
})
