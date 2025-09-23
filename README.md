# WhatsApp QR Scanner & Message Sender

A powerful WhatsApp automation tool that allows you to scan QR codes, establish WhatsApp sessions, and send messages (including media) to individual contacts or broadcast to multiple contacts.

## Features

- 🔗 **QR Code Scanning**: Scan QR code to connect your WhatsApp account
- 💬 **Message Sending**: Send text messages to individual contacts
- 📎 **Media Support**: Send images, videos, audio files, and documents
- 📢 **Broadcast Messages**: Send messages to multiple contacts at once
- 🌐 **Web Interface**: Beautiful, responsive web interface
- 🔄 **Session Management**: Persistent sessions with automatic reconnection
- 📱 **Real-time Status**: Live connection status updates

## Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- A WhatsApp account
- Chrome/Chromium browser (for Puppeteer)

## Installation

1. **Clone or download this repository**
   ```bash
   git clone <repository-url>
   cd whatsapp-qr
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

## Usage

### 1. Connect WhatsApp

1. Open the web interface in your browser
2. A QR code will appear on the screen
3. Open WhatsApp on your phone
4. Go to Settings > Linked Devices > Link a Device
5. Scan the QR code displayed on the web interface
6. Wait for the "WhatsApp connected successfully!" message

### 2. Send Individual Messages

1. Enter the phone number (with country code, e.g., 1234567890)
2. Type your message
3. Optionally attach media files
4. Click "Send Message"

### 3. Send Broadcast Messages

1. Enter multiple phone numbers (one per line) in the broadcast section
2. Type your message
3. Optionally attach media files
4. Click "Send Broadcast"

## Phone Number Format

- Use international format without the '+' sign
- Example: `1234567890` for US number
- Example: `919876543210` for Indian number
- The system will automatically format it correctly

## Supported Media Types

- Images: JPG, PNG, GIF, WebP
- Videos: MP4, AVI, MOV, etc.
- Audio: MP3, WAV, OGG, etc.
- Documents: PDF, DOC, DOCX, etc.

## API Endpoints

**Note**: All API endpoints (except `/api/generate-key`) require authentication using an API key in the `x-api-key` header.

### Authentication
Include your API key in the request header:
```
x-api-key: your_api_key_here
```

### GET `/api/config`
Get server configuration (no authentication required).

**Response:**
```json
{
  "baseUrl": "http://localhost:3000",
  "corsOrigin": "*"
}
```

### POST `/api/generate-key`
Generate a new API key (no authentication required).

**Request Body:**
```json
{
  "masterKey": "your_master_key_here"
}
```

**Response:**
```json
{
  "success": true,
  "apiKey": "wk_abc123def_xyz789",
  "message": "API key generated successfully"
}
```

### GET `/api/status`
Get current connection status and QR code.

**Headers:**
```
x-api-key: your_api_key_here
```

**Response:**
```json
{
  "ready": true,
  "qr": "qr_code_string",
  "qrPng": "data:image/png;base64,..."
}
```

### POST `/api/send-message`
Send a message to a single contact.

**Headers:**
```
x-api-key: your_api_key_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "number": "1234567890",
  "message": "Hello World!",
  "media": {
    "data": "base64_encoded_data",
    "mimetype": "image/jpeg",
    "filename": "image.jpg"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message sent successfully"
}
```

### POST `/api/send-broadcast`
Send a message to multiple contacts.

**Headers:**
```
x-api-key: your_api_key_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "numbers": ["1234567890", "0987654321"],
  "message": "Hello Everyone!",
  "media": {
    "data": "base64_encoded_data",
    "mimetype": "image/jpeg",
    "filename": "image.jpg"
  }
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {"number": "1234567890", "status": "success"},
    {"number": "0987654321", "status": "success"}
  ]
}
```

### GET `/api/contacts`
Get all WhatsApp contacts.

**Headers:**
```
x-api-key: your_api_key_here
```

**Response:**
```json
[
  {
    "id": "1234567890@c.us",
    "name": "Contact Name",
    "number": "1234567890"
  }
]
```

### GET `/api/groups`
Get all WhatsApp groups.

**Headers:**
```
x-api-key: your_api_key_here
```

**Response:**
```json
[
  {
    "id": "group_id@g.us",
    "name": "Group Name",
    "subject": "Group Subject",
    "isGroup": true,
    "participants": 5,
    "unreadCount": 0
  }
]
```

### POST `/api/send-group-message`
Send a message to a WhatsApp group.

**Headers:**
```
x-api-key: your_api_key_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "groupId": "group_id@g.us",
  "message": "Hello Group!",
  "media": {
    "data": "base64_encoded_data",
    "mimetype": "image/jpeg",
    "filename": "image.jpg"
  }
}
```

### GET `/api/client-info`
Get WhatsApp client information.

**Headers:**
```
x-api-key: your_api_key_here
```

**Response:**
```json
{
  "wid": "1234567890",
  "fullWid": "1234567890@c.us",
  "pushname": "Your Name",
  "platform": "android",
  "profilePicture": "https://...",
  "connected": true
}
```

### Webhook Management

#### POST `/api/webhook`
Set webhook URL.

**Headers:**
```
x-api-key: your_api_key_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "url": "https://your-webhook-url.com/webhook"
}
```

#### GET `/api/webhook`
Get current webhook URL.

**Headers:**
```
x-api-key: your_api_key_here
```

#### DELETE `/api/webhook`
Remove webhook URL.

**Headers:**
```
x-api-key: your_api_key_here
```

### POST `/api/logout`
Logout and disconnect WhatsApp client.

**Headers:**
```
x-api-key: your_api_key_here
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully. QR code will appear shortly."
}
```

## Configuration

The application uses environment variables for configuration. Create a `.env` file in the root directory:

```env
# WhatsApp QR Scanner Configuration
PORT=3000

# Base URL for the application (change this for production!)
BASE_URL=http://localhost:3000

# Master key for generating new API keys (change this in production!)
MASTER_KEY=admin123

# CORS Configuration
CORS_ORIGIN=*

# WhatsApp Client Configuration
WHATSAPP_CLIENT_ID=whatsapp-qr-scanner
```

### Environment Variables:

- **PORT**: Server port (default: 3000)
- **BASE_URL**: Base URL for the application (default: http://localhost:3000)
- **MASTER_KEY**: Master key for generating API keys (default: admin123)
- **CORS_ORIGIN**: CORS origin (default: *)
- **WHATSAPP_CLIENT_ID**: WhatsApp client ID (default: whatsapp-qr-scanner)

### Production Configuration:

For production, update these variables:
```env
BASE_URL=https://yourdomain.com
MASTER_KEY=your_secure_master_key_here
CORS_ORIGIN=https://yourdomain.com
```

### Default Configuration:
- **Session Storage**: Local file system (`.wwebjs_auth` folder)
- **Puppeteer**: Headless Chrome with optimized settings

## Troubleshooting

### Common Issues

1. **QR Code not appearing**
   - Check if the server is running
   - Refresh the browser page
   - Check console for errors

2. **Authentication failed**
   - Make sure you're scanning the QR code with the correct WhatsApp account
   - Try deleting the `.wwebjs_auth` folder and restarting

3. **Messages not sending**
   - Ensure the phone number is in correct format
   - Check if the contact exists in your WhatsApp
   - Verify the WhatsApp session is active

4. **Media upload issues**
   - Check file size (WhatsApp has limits)
   - Ensure file format is supported
   - Try with smaller files first

### Development Mode

To run in development mode with auto-restart:

```bash
npm run dev
```

## Security Notes

- This application stores your WhatsApp session locally
- Never share your session files
- Use this tool responsibly and in compliance with WhatsApp's Terms of Service
- Be mindful of rate limits and spam prevention

## License

MIT License - feel free to use and modify as needed.

## Support

If you encounter any issues:

1. Check the console logs for error messages
2. Ensure all dependencies are properly installed
3. Verify your Node.js version is compatible
4. Check if Chrome/Chromium is installed on your system

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.
