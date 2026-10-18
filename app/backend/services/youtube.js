const { google } = require('googleapis');
const fs = require('fs');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || process.env.YOUTUBE_REDIRECT_URI;

function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

function authUrl(state) {
  if (!isConfigured()) {
    throw new Error('Google OAuth non configuré (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI)');
  }

  const oauth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  return oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
  });
}

async function exchangeCode(code) {
  if (!isConfigured()) {
    throw new Error('Google OAuth non configuré (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI)');
  }

  const oauth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const { tokens } = await oauth.getToken(code);
  return tokens;
}

async function getUserInfo(accessToken) {
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  const people = google.oauth2({ version: 'v2', auth: oauth });
  const { data } = await people.userinfo.get();
  return data;
}

async function publish({ token, refreshToken, title, description, filePath, tags = [], privacy = 'private' }) {
  if (!isConfigured()) {
    throw new Error('Google YouTube OAuth non configuré (.env)');
  }
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Fichier vidéo YouTube introuvable');
  }

  const oauth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  oauth.setCredentials({
    access_token: token,
    refresh_token: refreshToken || undefined,
  });

  const youtube = google.youtube({ version: 'v3', auth: oauth });
  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    notifySubscribers: false,
    requestBody: {
      snippet: {
        title: title || 'OPTINET video',
        description: description || '',
        tags: Array.isArray(tags) ? tags.slice(0, 50).map(t => String(t).replace(/^#/, '')) : [],
      },
      status: {
        privacyStatus: privacy,
      },
    },
    media: {
      mimeType: 'video/*',
      body: fs.createReadStream(filePath),
    },
  });

  const videoId = response.data.id;
  return {
    id: videoId,
    permalink: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
  };
}

module.exports = { isConfigured, authUrl, exchangeCode, getUserInfo, publish };
