import React, { useEffect } from 'react';

const APKDownloader = () => {
  const urls = {
    "general": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk",
    "lg-classic": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-lgclassic-release.apk",
    "external": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-external_accessibility-release.apk"
  };

  const startDownload = async (url, name) => {
    try {
      const proxied = `https://cors-anywhere.herokuapp.com/${url}`;
      const resp = await fetch(proxied);
      
      if (resp.ok) {
        const data = await resp.blob();
        const objUrl = URL.createObjectURL(data);
        
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(objUrl);
      } else {
        throw new Error('proxy failed');
      }
    } catch (e) {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('variant');
    
    if (v && urls[v]) {
      const fileName = urls[v].split('/').pop();
      startDownload(urls[v], fileName);
    }
  }, []);

  return null;
};

export default APKDownloader;
