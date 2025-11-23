// auth-setup.js - One-time Terminal Authentication
// Run this once: node auth-setup.js
// Then use server.js normally

const { google } = require('googleapis')
const readline = require('readline')
const fs = require('fs')
const path = require('path')
const http = require('http')
const url = require('url')
require('dotenv').config()

// Use OOB flow for VPS/headless environments (no redirect server)
const redirectUri = 'urn:ietf:wg:oauth:2.0:oob'

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
)

const TOKEN_PATH = path.join(__dirname, 'token.json')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

// Start callback server to capture OAuth code
function startCallbackServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true)
            
            if (parsedUrl.pathname === '/oauth2callback') {
                const code = parsedUrl.query.code
                const error = parsedUrl.query.error
                
                if (error) {
                    res.writeHead(400, { 'Content-Type': 'text/html' })
                    res.end(`<h1>❌ Authentication Error</h1><p>${error}</p><p>Return to terminal.</p>`)
                    server.close()
                    resolve(null)
                } else if (code) {
                    res.writeHead(200, { 'Content-Type': 'text/html' })
                    res.end(`<h1>✅ Authentication Successful!</h1><p>You can close this window and return to the terminal.</p>`)
                    server.close()
                    resolve(code)
                }
            } else {
                res.writeHead(404)
                res.end('Not Found')
            }
        })
        
        server.listen(3001, () => {
            console.log('📡 Callback server listening on http://localhost:3001/oauth2callback\n')
        })
    })
}

async function authenticate() {
    console.log('\n' + '='.repeat(70))
    console.log('📧 Gmail Checker - One-Time Authentication Setup')
    console.log('='.repeat(70) + '\n')

    // Check if already authenticated
    if (fs.existsSync(TOKEN_PATH)) {
        const answer = await askQuestion(
            'Token file already exists. Re-authenticate? (y/n): '
        )
        if (answer.toLowerCase() !== 'y') {
            console.log(
                '✅ Using existing token. You can start the server now!'
            )
            rl.close()
            return
        }
    }

    // Start callback server if using redirect-based flow
    let code = null
    if (redirectUri.startsWith('http')) {
        console.log('🚀 Starting callback server...')
        const callbackPromise = startCallbackServer()

        // Generate auth URL
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.modify',
            ],
            redirect_uri: redirectUri,
        })

        console.log('🔐 Authentication Steps:')
        console.log('1. Opening browser... (or copy this URL manually):')
        console.log('\n' + authUrl + '\n')
        console.log('2. Login with your Gmail account')
        console.log('3. Click "Allow" to grant permissions')
        console.log('4. You will be redirected automatically\n')

        code = await callbackPromise
        if (!code) {
            console.error('❌ Failed to receive authorization code\n')
            rl.close()
            return
        }
    } else {
        // OOB flow - manual code entry
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.modify',
            ],
            redirect_uri: redirectUri,
        })

        console.log('🔐 Authentication Steps:')
        console.log('1. Copy this URL and paste it in your browser:')
        console.log('\n' + authUrl + '\n')
        console.log('2. Login with your Gmail account')
        console.log('3. Click "Allow" to grant permissions')
        console.log('4. Copy the authorization code from the browser')
        console.log('5. Paste it below\n')

        code = await askQuestion('Enter the authorization code: ')
    }

    try {
        const { tokens } = await oauth2Client.getToken(code)

        // Save token
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))

        console.log('\n✅ Authentication successful!')
        console.log('✅ Token saved to token.json')
        console.log('\n🚀 You can now run: node server.js')
        console.log('💡 You only need to do this once!\n')
    } catch (error) {
        console.error('\n❌ Authentication failed:', error.message)
        console.log('Please try again or check your credentials.\n')
    }

    rl.close()
}

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim())
        })
    })
}

// Run authentication
authenticate().catch(console.error)
