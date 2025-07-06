export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const { variant = 'general' } = req.query;
  
  const apkUrls = {
    "general": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk",
    "lg-classic": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-lgclassic-release.apk",
    "external": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-external_accessibility-release.apk"
  };
  
  const apkUrl = apkUrls[variant] || apkUrls["general"];
  
  try {
    const response = await fetch(apkUrl);
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch APK' });
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="app-${variant}-release.apk"`);
    
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    res.send(buffer);
    
  } catch (error) {
    console.error('Error fetching APK:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
