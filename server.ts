import express from 'express';
import { createServer as createViteServer } from 'vite';
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';
import path from 'path';

const app = express();
const PORT = 3000;

app.use(cookieParser());
app.use(express.json());

const getOAuth2Client = (req: express.Request) => {
  // Use the host header to construct the redirect URI dynamically
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const appUrl = `${protocol}://${host}`;
  const redirectUri = `${appUrl}/auth/callback`;
  
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

app.get('/api/auth/google/url', (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Google Client ID or Secret is missing in environment variables.' });
    }
    const oauth2Client = getOAuth2Client(req);
    const scopes = ['https://www.googleapis.com/auth/gmail.readonly'];
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
    res.json({ url });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code);
    
    // Store tokens in a secure cookie
    res.cookie('gmail_tokens', JSON.stringify(tokens), {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autenticação concluída com sucesso. Esta janela será fechada automaticamente.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/gmail/messages', async (req, res) => {
  try {
    const tokensCookie = req.cookies.gmail_tokens;
    if (!tokensCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const tokens = JSON.parse(tokensCookie);
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Fetch latest 10 emails
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
    });

    const messages = response.data.messages || [];
    const emails = [];

    for (const msg of messages) {
      if (msg.id) {
        const msgData = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full'
        });
        
        const payload = msgData.data.payload;
        const headers = payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || 'Sem Assunto';
        const from = headers.find(h => h.name === 'From')?.value || 'Desconhecido';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        
        const snippet = msgData.data.snippet || '';
        
        emails.push({ id: msg.id, subject, from, date, snippet });
      }
    }

    res.json({ emails });
  } catch (error) {
    console.error('Error fetching emails', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
