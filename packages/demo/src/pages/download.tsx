import React, { useState } from 'react';
import { NextApiRequest, NextApiResponse } from 'next';

const DownloadIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const SmartphoneIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v16a1 1 0 001 1z" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const urls = {
  "general": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk",
  "lg-classic": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-lgclassic-release.apk",
  "external": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-external_accessibility-release.apk"
};

export async function getServerSideProps({ req, res, query }: { req: any, res: any, query: any }) {
  if (req.method === 'GET' && query.variant) {
    const { variant } = query;
    
    if (!(variant in urls)) {
      res.statusCode = 400;
      res.end('bad variant');
      return { props: {} };
    }
    
    try {
      const response = await fetch(urls[variant as keyof typeof urls], {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (!response.ok) throw new Error();
      
      const buffer = await response.arrayBuffer();
      
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="app-${variant}.apk"`);
      res.setHeader('Content-Length', buffer.byteLength.toString());
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      
      res.statusCode = 200;
      res.end(Buffer.from(buffer));
      return { props: {} };
    } catch (e) {
      res.statusCode = 500;
      res.end('error');
      return { props: {} };
    }
  }
  
  return { props: {} };
}

const APKDownloader = () => {
  const [downloading, setDownloading] = useState(null);

  const variants = {
    general: {
      name: 'General Release',
      description: 'Standard version for most devices',
      icon: <SmartphoneIcon />,
      color: 'bg-blue-500 hover:bg-blue-600'
    },
    'lg-classic': {
      name: 'LG Classic',
      description: 'Optimized for LG Classic devices',
      icon: <ShieldIcon />,
      color: 'bg-purple-500 hover:bg-purple-600'
    },
    external: {
      name: 'External Accessibility',
      description: 'Enhanced accessibility features',
      icon: <ExternalLinkIcon />,
      color: 'bg-green-500 hover:bg-green-600'
    }
  };

  const downloadAPK = (variant) => {
    setDownloading(variant);
    window.location.href = `?variant=${variant}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            eGate APK Downloads
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Download the latest version of eGate for your device. Choose the variant that best fits your needs.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {Object.entries(variants).map(([key, variant]) => (
            <div key={key} className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:border-white/40 transition-all duration-300 hover:scale-105">
              <div className="flex items-center justify-center mb-6">
                <div className={`p-4 rounded-full ${variant.color} text-white shadow-lg`}>
                  {variant.icon}
                </div>
              </div>
              
              <h3 className="text-2xl font-bold text-white mb-3 text-center">
                {variant.name}
              </h3>
              
              <p className="text-gray-300 text-center mb-8 leading-relaxed">
                {variant.description}
              </p>
              
              <button
                onClick={() => downloadAPK(key)}
                disabled={downloading === key}
                className={`w-full ${variant.color} text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {downloading === key ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Downloading...</span>
                  </>
                ) : (
                  <>
                    <DownloadIcon />
                    <span>Download APK</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <h4 className="text-lg font-semibold text-white mb-2">Installation Note</h4>
            <p className="text-gray-300 text-sm">
              You may need to enable &quot;Install from unknown sources&quot; in your device settings to install the APK.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default APKDownloader;
