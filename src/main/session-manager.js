const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function spoofSession(ses) {
  ses.setUserAgent(CHROME_UA)
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const h = details.requestHeaders

    // No modificar peticiones de service worker — protege SW de Gmail y otras apps
    const isSW = details.resourceType === 'serviceWorker'
      || h['Service-Worker'] === 'script'
      || (h['Sec-Fetch-Dest'] && h['Sec-Fetch-Dest'] === 'serviceworker')
    if (isSW) { callback({ requestHeaders: h }); return }

    h['User-Agent'] = CHROME_UA
    h['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"'
    h['sec-ch-ua-mobile'] = '?0'
    h['sec-ch-ua-platform'] = '"Windows"'
    h['sec-ch-ua-full-version-list'] = '"Google Chrome";v="131.0.6778.205", "Chromium";v="131.0.6778.205", "Not_A Brand";v="24.0.0.0"'
    h['sec-ch-ua-platform-version'] = '"10.0.0"'
    h['sec-ch-ua-arch'] = '"x86"'
    h['sec-ch-ua-bitness'] = '"64"'
    h['sec-ch-ua-model'] = '""'
    delete h['X-Requested-With']
    callback({ requestHeaders: h })
  })
}

module.exports = { spoofSession, CHROME_UA }
