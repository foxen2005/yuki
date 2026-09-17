const { app } = require('electron')

function getChromeUA(ses) {
  let ua = ses.getUserAgent() || app.userAgentFallback || ''
  return ua.replace(/Electron\/[\d\.]+ ?/i, '').replace(/yuki\/[\d\.]+ ?/i, '')
}

function spoofSession(ses) {
  const ua = getChromeUA(ses)
  ses.setUserAgent(ua)
  
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const h = details.requestHeaders

    h['User-Agent'] = ua
    // Extraer versión mayor de Chromium del UA
    const match = ua.match(/Chrome\/(\d+)/)
    const version = match ? match[1] : '134'
    
    h['sec-ch-ua'] = `"Google Chrome";v="${version}", "Chromium";v="${version}", "Not_A Brand";v="24"`
    h['sec-ch-ua-mobile'] = '?0'
    h['sec-ch-ua-platform'] = '"Windows"'
    delete h['X-Requested-With']
    callback({ requestHeaders: h })
  })
}

module.exports = { spoofSession, getChromeUA }
