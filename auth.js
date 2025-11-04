// auth-setup.js - One-time Terminal Authentication
// Run this once: node auth-setup.js
// Then use server.js normally

const { google } = require('googleapis')
const readline = require('readline')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob' // For terminal/console apps
)

const TOKEN_PATH = path.join(__dirname, 'token.json')

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

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

    // Generate auth URL
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify',
        ],
    })

    console.log('🔐 Authentication Steps:')
    console.log('1. Copy this URL and paste it in your browser:')
    console.log('\n' + authUrl + '\n')
    console.log('2. Login with your Gmail account')
    console.log('3. Click "Allow" to grant permissions')
    console.log('4. Copy the authorization code from the browser')
    console.log('5. Paste it below\n')

    const code = await askQuestion('Enter the authorization code: ')

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
